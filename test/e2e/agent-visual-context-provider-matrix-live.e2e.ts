import { existsSync } from "node:fs"
import { execFile } from "node:child_process"
import { copyFile, cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import type { ElectronApplication, Locator, Page } from "@playwright/test"
import {
  dismissFirstRun,
  expect,
  test,
  type RippleE2EContext,
} from "./helpers/ripple-electron"
import {
  writeVisualContextTimingReport,
  type VisualContextTimingRow,
} from "./helpers/visual-context-timing-report"

type LiveProvider = "codex" | "claude"

const execFileAsync = promisify(execFile)
const liveAgentEnabled = process.env.RIPPLE_E2E_LIVE_AGENT === "1"
const liveProviders = parseLiveProviders(process.env.RIPPLE_E2E_LIVE_AGENT_PROVIDER)
const timingReportPath = process.env.RIPPLE_E2E_VISUAL_CONTEXT_TIMING_OUT ||
  join(process.cwd(), "test-results", "visual-context-live-timing-matrix.json")
let timingReportReset = false

test.describe("Ripple live provider visual context matrix", () => {
  test.skip(
    !liveAgentEnabled,
    "Set RIPPLE_E2E_LIVE_AGENT=1 to run the live Codex/Claude visual-context matrix.",
  )

  for (const provider of liveProviders) {
    test(`${provider} chat and comments receive direct visual tool results @live @visual`, async ({
      electronApp,
      page,
      e2e,
    }) => {
      test.setTimeout(600_000)
      await configureLiveProvider(page, provider)
      await page.reload()
      await dismissFirstRun(page)

      const projectDir = await openBasicTitleCardProject({ electronApp, page, e2e })
      const dbPath = join(e2e.tempRoot, "userData", "data", "agents.db")
      await prepareVisiblePreview(page)
      await resetTimingReport()

      await test.step("chat can ask for current, timestamped, and frame-sheet visuals", async () => {
        const marker = `VISUAL_CONTEXT_CHAT_${provider.toUpperCase()}_${safeId(e2e.runId)}`
        const runCountBefore = await readAgentRunCount(dbPath)
        const submission = await submitChatPrompt({
          page,
          dbPath,
          runCountBefore,
          prompt: [
            "This is a live Ripple visual-context chat eval. Do not edit files.",
            "Use the app-managed Ripple visual context tools directly, not shell commands and not file lookup.",
            "This eval measures visual tool-choice latency: your next assistant action should be the first visual tool call, with no explanation before it.",
            "Make exactly three visual tool calls in this order.",
            "1. Call the Ripple snapshot tool with at=current and no composition argument.",
            "2. Call the Ripple snapshot tool with at=0.5s and no composition argument.",
            "3. Call the Ripple frame sheet tool with range=0s..1s, samples=3, columns=3, and no composition argument.",
            `Reply with ${marker} and say whether each visual came back directly from the tool result.`,
          ].join("\n"),
        })
        await expect(page.getByText(marker)).toBeVisible({ timeout: 300_000 })

        const run = await waitForRunAfter({
          dbPath,
          runCountBefore,
          provider,
          runKind: "chat",
        })
        expect(run.status).toBe("completed")
        expect(run.runtime_context_json).toContain("previewTimeSeconds")

        const summary = await readRunEventSummary(dbPath, run.id, marker)
        expect(summary.approval_requests).toBe(0)
        expect(summary.visual_shell_commands).toBe(0)
        expect(summary.native_snapshot_successes).toBeGreaterThanOrEqual(2)
        expect(summary.native_frame_sheet_successes).toBeGreaterThanOrEqual(1)
        expect(summary.done_mentions).toBeGreaterThan(0)
        expect(await countImages(join(projectDir, ".ripple", "tmp", "agent-attachments", run.id)))
          .toBe(0)

        const toolRows = await buildToolTimingRows({
          dbPath,
          run,
          provider,
          surface: "chat",
          submittedAtMs: submission.submittedAtMs,
          runObservedAtMs: submission.runObservedAtMs,
        })
        expect(toolRows.map((row) => row.path)).toEqual([
          "chat.current_snapshot_tool",
          "chat.timestamp_snapshot_tool",
          "chat.frame_sheet_tool",
        ])
        expect(toolRows.map((row) => row.toolOrderIndex)).toEqual([1, 2, 3])
        expect(toolRows.every((row) => typeof row.modelToolChoiceMs === "number")).toBe(true)

        await writeVisualContextTimingReport({
          path: timingReportPath,
          rows: toolRows,
        })
      })

      await test.step("comments attach the automatic frame and can call the same visual tools", async () => {
        const marker = `VISUAL_CONTEXT_COMMENT_${provider.toUpperCase()}_${safeId(e2e.runId)}`
        const runCountBefore = await readAgentRunCount(dbPath)
        const commentBody = [
          "This is a live Ripple visual-context comment eval. Do not edit files.",
          "Use the automatic image attached to this comment as the current-frame reference.",
          "Then use the app-managed Ripple visual context tools directly, not shell commands and not file lookup.",
          "This eval measures visual tool-choice latency: after reading the attached image, your next external action should be the first visual tool call.",
          "Make exactly three visual tool calls in this order: snapshot at=current with no composition argument; snapshot at=0.5s with no composition argument; frame sheet with range=0s..1s, samples=3, columns=3, and no composition argument.",
          `Reply with ${marker} and say whether the automatic comment visual plus all three tool visuals were available.`,
        ].join("\n")

        const submission = await submitCommentPrompt({
          page,
          dbPath,
          runCountBefore,
          prompt: commentBody,
          projectDir,
          preparedVisualFileName: "frame.png",
        })
        const thread = submission.thread
        await expect(page.getByText(marker)).toBeVisible({ timeout: 360_000 })

        const run = await waitForRunAfter({
          dbPath,
          runCountBefore,
          provider,
          runKind: "generated_change",
        })
        expect(run.status).toBe("completed")
        expect(run.threadId).toBeTruthy()
        expect(run.revisionId).toBeTruthy()
        expect(run.threadId).toBe(thread.id)

        expect(thread.anchorType).toBe("frame")
        expect(thread.screenshotPath).toMatch(/\.ripple\/comment-visuals\/.+\/frame\.png$/)
        expect(existsSync(join(projectDir, thread.screenshotPath!))).toBe(true)

        const revision = await readRevision(dbPath, run.revisionId!)
        const attachmentRoot = join(
          revision?.contextPath || projectDir,
          ".ripple",
          "tmp",
          "agent-attachments",
          run.id,
        )
        expect(await countImages(attachmentRoot)).toBeGreaterThan(0)

        const summary = await readRunEventSummary(dbPath, run.id, marker)
        expect(summary.approval_requests).toBe(0)
        expect(summary.visual_shell_commands).toBe(0)
        expect(summary.native_snapshot_successes).toBeGreaterThanOrEqual(2)
        expect(summary.native_frame_sheet_successes).toBeGreaterThanOrEqual(1)
        expect(summary.done_mentions).toBeGreaterThan(0)

        const toolRows = await buildToolTimingRows({
          dbPath,
          run,
          provider,
          surface: "comment",
          submittedAtMs: submission.submittedAtMs,
          runObservedAtMs: submission.runObservedAtMs,
        })
        expect(toolRows.map((row) => row.path)).toEqual([
          "comment.current_snapshot_tool",
          "comment.timestamp_snapshot_tool",
          "comment.frame_sheet_tool",
        ])
        expect(toolRows.map((row) => row.toolOrderIndex)).toEqual([1, 2, 3])
        expect(toolRows.every((row) => typeof row.modelToolChoiceMs === "number")).toBe(true)

        await writeVisualContextTimingReport({
          path: timingReportPath,
          rows: [
            buildAutomaticCommentVisualTimingRow({
              provider,
              run,
              thread,
              submission,
              path: "comment.auto_current_frame_attachment",
            }),
            ...toolRows,
          ],
        })
      })

      await test.step("range comments attach an automatic frame sheet before the agent starts", async () => {
        await prepareVisiblePreview(page)
        await selectPreviewTimelineRange(page)
        const marker = `VISUAL_CONTEXT_RANGE_COMMENT_${provider.toUpperCase()}_${safeId(e2e.runId)}`
        const runCountBefore = await readAgentRunCount(dbPath)
        const commentBody = [
          "This is a live Ripple visual-context range-comment eval. Do not edit files.",
          "Use the automatic frame sheet attached to this range comment as visual context.",
          "Do not call extra visual tools for this step.",
          `Reply with ${marker} when the automatic range sheet is available.`,
        ].join("\n")

        const submission = await submitCommentPrompt({
          page,
          dbPath,
          runCountBefore,
          prompt: commentBody,
          projectDir,
          preparedVisualFileName: "sheet.png",
        })
        const thread = submission.thread
        await expect(page.getByText(marker)).toBeVisible({ timeout: 360_000 })

        const run = await waitForRunAfter({
          dbPath,
          runCountBefore,
          provider,
          runKind: "generated_change",
        })
        expect(run.status).toBe("completed")
        expect(run.threadId).toBeTruthy()
        expect(run.revisionId).toBeTruthy()
        expect(run.threadId).toBe(thread.id)

        expect(thread.anchorType).toBe("range")
        expect(thread.screenshotPath).toMatch(/\.ripple\/comment-visuals\/.+\/sheet\.png$/)
        expect(existsSync(join(projectDir, thread.screenshotPath!))).toBe(true)

        const revision = await readRevision(dbPath, run.revisionId!)
        const attachmentRoot = join(
          revision?.contextPath || projectDir,
          ".ripple",
          "tmp",
          "agent-attachments",
          run.id,
        )
        expect(await countImages(attachmentRoot)).toBeGreaterThan(0)

        const summary = await readRunEventSummary(dbPath, run.id, marker)
        expect(summary.approval_requests).toBe(0)
        expect(summary.visual_shell_commands).toBe(0)
        expect(summary.done_mentions).toBeGreaterThan(0)

        await writeVisualContextTimingReport({
          path: timingReportPath,
          rows: [
            buildAutomaticCommentVisualTimingRow({
              provider,
              run,
              thread,
              submission,
              path: "comment.auto_range_sheet_attachment",
            }),
          ],
        })
      })
    })
  }
})

function parseLiveProviders(value: string | undefined): LiveProvider[] {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === "all") return ["codex", "claude"]
  if (normalized === "codex" || normalized === "claude") return [normalized]
  throw new Error("RIPPLE_E2E_LIVE_AGENT_PROVIDER must be codex, claude, or all.")
}

async function configureLiveProvider(page: Page, provider: LiveProvider): Promise<void> {
  const codexApiKey =
    process.env.RIPPLE_E2E_LIVE_CODEX_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  const codexModel = process.env.RIPPLE_E2E_LIVE_CODEX_MODEL || "gpt-5.4-mini"
  const claudeModel = process.env.RIPPLE_E2E_LIVE_CLAUDE_MODEL || "sonnet"

  await page.evaluate(({ provider, codexApiKey, codexModel, claudeModel }) => {
    localStorage.setItem(
      "agents:lastSelectedAgentId",
      JSON.stringify(provider === "codex" ? "codex" : "claude-code"),
    )
    localStorage.setItem("agents:lastSelectedCodexModelId", JSON.stringify(codexModel))
    localStorage.setItem("agents:lastSelectedCodexThinking", JSON.stringify("low"))
    localStorage.setItem("agents:lastSelectedModelId", JSON.stringify(claudeModel))

    if (provider === "codex") {
      localStorage.setItem("onboarding:codex-completed", JSON.stringify(true))
      if (codexApiKey) {
        localStorage.setItem("onboarding:codex-auth-method", JSON.stringify("api_key"))
        localStorage.setItem("onboarding:codex-api-key", JSON.stringify(codexApiKey))
      }
    } else {
      localStorage.setItem("onboarding:anthropic-completed", JSON.stringify(true))
    }
  }, { provider, codexApiKey, codexModel, claudeModel })
}

async function openBasicTitleCardProject({
  electronApp,
  page,
  e2e,
}: {
  electronApp: ElectronApplication
  page: Page
  e2e: RippleE2EContext
}): Promise<string> {
  const projectDir = join(e2e.tempRoot, "basic-title-card")
  await rm(projectDir, { recursive: true, force: true })
  await cp(
    join(e2e.repoRoot, "test", "fixtures", "hyperframes", "basic-title-card"),
    projectDir,
    { recursive: true },
  )
  await mkdir(join(projectDir, "assets", "vendor"), { recursive: true })
  await copyFile(
    join(e2e.repoRoot, "node_modules", "gsap", "dist", "gsap.min.js"),
    join(projectDir, "assets", "vendor", "gsap.min.js"),
  )
  await writeFile(
    join(projectDir, "AGENTS.md"),
    [
      "Use Ripple visual context for visual checks.",
      "When Ripple exposes app-managed visual tools, prefer those tools over shell commands.",
    ].join("\n"),
    "utf8",
  )

  await electronApp.evaluate(
    ({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedPath],
      })
    },
    projectDir,
  )

  await page.getByTestId("ripple-open-project-button").click()
  return projectDir
}

async function prepareVisiblePreview(page: Page): Promise<void> {
  await expect(page.getByTestId("ripple-shell")).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId("ripple-shell-project-name")).toContainText("Basic Title Card")
  await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
  await page.getByText("Project opened").waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined)
  const viewMain = page.getByTestId("ripple-comments-pane").getByRole("button", { name: "View Main" })
  if (await viewMain.isVisible().catch(() => false)) {
    await viewMain.click()
  }

  const previewTime = page.getByRole("slider", { name: "Preview time" })
  await expect(previewTime).toHaveAttribute("aria-disabled", "false", { timeout: 45_000 })
  const timelineBox = await previewTime.boundingBox()
  if (!timelineBox) throw new Error("Preview timeline did not expose a clickable box.")
  await page.mouse.click(timelineBox.x + timelineBox.width * 0.5, timelineBox.y + timelineBox.height / 2)
  await expect.poll(async () => Number(await previewTime.getAttribute("aria-valuenow"))).toBeGreaterThan(0)
}

async function selectPreviewTimelineRange(page: Page): Promise<void> {
  const timeline = page
    .getByTestId("ripple-preview-player")
    .locator("div.h-full.overflow-y-auto")
    .last()
  await expect(timeline).toBeVisible({ timeout: 45_000 })
  const box = await timeline.boundingBox()
  if (!box) throw new Error("Preview timeline did not expose a range-selectable box.")
  const y = box.y + Math.min(box.height - 24, 120)
  await page.keyboard.down("Shift")
  await page.mouse.move(box.x + box.width * 0.28, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.66, y, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up("Shift")
}

interface SubmissionTiming {
  submittedAtMs: number
  cardVisibleAtMs?: number | null
  runObservedAtMs: number
}

interface CommentSubmissionTiming extends SubmissionTiming {
  thread: {
    id: string
    anchorType: string
    screenshotPath: string | null
    visualObservedAtMs: number
  }
}

async function submitChatPrompt(input: {
  page: Page
  dbPath: string
  runCountBefore: number
  prompt: string
}): Promise<CommentSubmissionTiming> {
  const editor = input.page.locator('[contenteditable="true"]').last()
  await expect(editor).toBeVisible({ timeout: 30_000 })
  await editor.fill(input.prompt)
  await expect(editor).toContainText("live Ripple visual-context chat eval")
  const sendButton = input.page.getByRole("button", { name: "Send message" })
  await expect(sendButton).toBeEnabled({ timeout: 10_000 })
  return submitAgentPrompt({ sendButton, dbPath: input.dbPath, runCountBefore: input.runCountBefore })
}

async function submitCommentPrompt(input: {
  page: Page
  dbPath: string
  runCountBefore: number
  prompt: string
  projectDir?: string
  preparedVisualFileName?: "frame.png" | "sheet.png"
}): Promise<SubmissionTiming> {
  await input.page
    .getByTestId("ripple-shell")
    .locator("aside")
    .getByRole("button", { name: "Comments", exact: true })
    .first()
    .click()
  await expect(input.page.getByTestId("ripple-comments-pane")).toBeVisible()
  // The product path prewarms comment visuals while the composer is open on a stable frame.
  if (input.projectDir && input.preparedVisualFileName) {
    await waitForPreparedCommentVisual(input.projectDir, input.preparedVisualFileName)
    await input.page.waitForTimeout(100)
  }
  const composer = input.page.getByTestId("ripple-comment-composer-input")
  await expect(composer).toBeVisible()
  await composer.fill(input.prompt)
  const submittedAtMs = Date.now()
  await input.page.getByRole("button", { name: "Send comment" }).click()
  const runObservedAtPromise = waitForAgentRunObservedAt({
    dbPath: input.dbPath,
    runCountBefore: input.runCountBefore,
    message: "expected sending the comment to queue a live comment agent run",
  })
  const threadPromise = waitForCommentThreadVisualForBody(input.dbPath, input.prompt)
  const commentCardMarker = input.prompt.split("\n")[0] || input.prompt
  await expect(
    input.page.locator("[data-comment-card='true']").filter({ hasText: commentCardMarker }),
  ).toBeVisible({ timeout: 30_000 })
  const cardVisibleAtMs = Date.now()
  const [runObservedAtMs, thread] = await Promise.all([
    runObservedAtPromise,
    threadPromise,
  ])
  return { submittedAtMs, cardVisibleAtMs, runObservedAtMs, thread }
}

async function waitForPreparedCommentVisual(
  projectDir: string,
  fileName: "frame.png" | "sheet.png",
): Promise<void> {
  const root = join(projectDir, ".ripple", "comment-visuals")
  await expect.poll(async () => findPreparedCommentVisual(root, fileName), {
    message: `expected prepared ${fileName} before sending the comment`,
    timeout: 30_000,
    intervals: [50],
  }).not.toBeNull()
}

async function findPreparedCommentVisual(
  root: string,
  fileName: "frame.png" | "sheet.png",
): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("prepared-")) continue
    const candidate = join(root, entry.name, fileName)
    const info = await stat(candidate).catch(() => null)
    if (info?.isFile() && info.size > 0) return candidate
  }
  return null
}

async function submitAgentPrompt(input: {
  sendButton: Locator
  dbPath: string
  runCountBefore: number
}): Promise<SubmissionTiming> {
  await input.sendButton.scrollIntoViewIfNeeded()
  const submittedAtMs = Date.now()
  await input.sendButton.click()
  const runObservedAtMs = await waitForAgentRunObservedAt({
    dbPath: input.dbPath,
    runCountBefore: input.runCountBefore,
    message: "expected clicking the composer send button to submit the live agent prompt",
  })
  return { submittedAtMs, runObservedAtMs }
}

async function waitForAgentRunObservedAt(input: {
  dbPath: string
  runCountBefore: number
  message: string
}): Promise<number> {
  let observedAtMs = Date.now()
  await pollUntil(async () => {
    const count = await readAgentRunCount(input.dbPath)
    if (count > input.runCountBefore) {
      observedAtMs = Date.now()
      return count
    }
    return null
  }, {
    message: input.message,
    timeoutMs: 45_000,
    intervalMs: 50,
  })
  return observedAtMs
}

async function waitForRunAfter(input: {
  dbPath: string
  runCountBefore: number
  provider: LiveProvider
  runKind: "chat" | "generated_change"
}): Promise<LiveRunRow> {
  await expect.poll(
    async () => {
      const count = await readAgentRunCount(input.dbPath)
      if (count <= input.runCountBefore) return "pending"
      const run = await readLatestRun(input.dbPath)
      if (!run) return "pending"
      if (run.provider !== input.provider) return `${run.provider}:${run.status}`
      if (run.runKind !== input.runKind) return `${run.runKind}:${run.status}`
      return run.status
    },
    {
      message: `expected ${input.provider} ${input.runKind} run to complete`,
      timeout: 360_000,
    },
  ).toBe("completed")

  const run = await readLatestRun(input.dbPath)
  if (!run) throw new Error("No agent run was recorded.")
  return run
}

interface LiveRunRow {
  id: string
  status: string
  provider: string
  runKind: string
  runtime_context_json: string
  revisionId: string | null
  threadId: string | null
  createdAt: number | string | null
  startedAt: number | string | null
  completedAt: number | string | null
}

async function readLatestRun(dbPath: string): Promise<LiveRunRow | null> {
  const [run] = await sqliteJson<LiveRunRow>(dbPath, `
    select
      id,
      status,
      provider,
      run_kind as runKind,
      runtime_context_json,
      revision_id as revisionId,
      comment_thread_id as threadId,
      created_at as createdAt,
      started_at as startedAt,
      completed_at as completedAt
    from agent_runs
    order by created_at desc, id desc
    limit 1;
  `)
  return run ?? null
}

async function readAgentRunCount(dbPath: string): Promise<number> {
  const [summary] = await sqliteJson<{ run_count: number }>(dbPath, `
    select count(*) as run_count from agent_runs;
  `)
  return Number(summary?.run_count ?? 0)
}

async function waitForCommentThreadVisual(
  dbPath: string,
  threadId: string,
): Promise<{
  id: string
  anchorType: string
  screenshotPath: string | null
  visualObservedAtMs: number
}> {
  let visualObservedAtMs = Date.now()
  await pollUntil(async () => {
    const thread = await readCommentThread(dbPath, threadId)
    if (thread?.screenshotPath) visualObservedAtMs = Date.now()
    return thread?.screenshotPath ?? null
  }, {
    message: "expected the comment to store an automatic visual frame",
    timeoutMs: 60_000,
    intervalMs: 50,
  })

  const thread = await readCommentThread(dbPath, threadId)
  if (!thread) throw new Error("No comment thread was recorded.")
  return { ...thread, visualObservedAtMs }
}

async function waitForCommentThreadVisualForBody(
  dbPath: string,
  body: string,
): Promise<{
  id: string
  anchorType: string
  screenshotPath: string | null
  visualObservedAtMs: number
}> {
  await pollUntil(
    async () => readCommentThreadByBody(dbPath, body).then((thread) => thread?.id ?? null),
    {
      message: "expected the comment thread to be recorded",
      timeoutMs: 30_000,
      intervalMs: 50,
    },
  )
  const thread = await readCommentThreadByBody(dbPath, body)
  if (!thread) throw new Error("No comment thread was recorded for the prompt.")
  return waitForCommentThreadVisual(dbPath, thread.id)
}

async function pollUntil<T>(
  read: () => Promise<T | null | undefined>,
  options: {
    message: string
    timeoutMs: number
    intervalMs: number
  },
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs
  let lastValue: T | null | undefined = null
  while (Date.now() <= deadline) {
    lastValue = await read()
    if (lastValue !== null && lastValue !== undefined) return lastValue
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs))
  }
  throw new Error(`${options.message}; last value: ${String(lastValue)}`)
}

async function readCommentThread(
  dbPath: string,
  threadId: string,
): Promise<{
  id: string
  anchorType: string
  screenshotPath: string | null
} | null> {
  const [thread] = await sqliteJson<{
    id: string
    anchorType: string
    screenshotPath: string | null
  }>(dbPath, `
    select
      id,
      anchor_type as anchorType,
      screenshot_path as screenshotPath
    from comment_threads
    where id = ${sqlString(threadId)}
    limit 1;
  `)
  return thread ?? null
}

async function readCommentThreadByBody(
  dbPath: string,
  body: string,
): Promise<{
  id: string
  anchorType: string
  screenshotPath: string | null
} | null> {
  const [thread] = await sqliteJson<{
    id: string
    anchorType: string
    screenshotPath: string | null
  }>(dbPath, `
    select
      comment_threads.id,
      comment_threads.anchor_type as anchorType,
      comment_threads.screenshot_path as screenshotPath
    from comment_threads
    inner join comment_messages on comment_messages.thread_id = comment_threads.id
    where comment_messages.role = 'user'
      and comment_messages.body = ${sqlString(body)}
    order by comment_threads.created_at desc, comment_threads.id desc
    limit 1;
  `)
  return thread ?? null
}

async function readRevision(
  dbPath: string,
  revisionId: string,
): Promise<{ id: string; contextPath: string | null } | null> {
  const [revision] = await sqliteJson<{ id: string; contextPath: string | null }>(dbPath, `
    select id, context_path as contextPath
    from revisions
    where id = ${sqlString(revisionId)}
    limit 1;
  `)
  return revision ?? null
}

async function readRunEventSummary(
  dbPath: string,
  runId: string,
  marker: string,
): Promise<{
  approval_requests: number
  visual_shell_commands: number
  native_snapshot_successes: number
  native_frame_sheet_successes: number
  done_mentions: number
}> {
  const events = await sqliteJson<{ type: string; payload_json: string }>(dbPath, `
    select type, payload_json
    from agent_run_events
    where agent_run_id = ${sqlString(runId)};
  `)

  const summary = {
    approval_requests: 0,
    visual_shell_commands: 0,
    native_snapshot_successes: 0,
    native_frame_sheet_successes: 0,
    done_mentions: 0,
  }

  for (const event of events) {
    const rawPayload = event.payload_json ?? ""
    if (event.type === "approval_request") summary.approval_requests += 1
    if (rawPayload.includes(marker)) summary.done_mentions += 1

    const payload = parseJsonObject(rawPayload)
    if (usesVisualShellCommand(payload, rawPayload)) {
      summary.visual_shell_commands += 1
    }
    if (event.type !== "tool_end" || payload?.status !== "completed") continue

    const toolName = String(payload.toolName ?? "")
    if (
      isNativeVisualTool(toolName, "snapshot") &&
      isNativeVisualOutput(payload.output, "snapshot")
    ) {
      summary.native_snapshot_successes += 1
    }
    if (
      isNativeVisualTool(toolName, "frame_sheet") &&
      isNativeVisualOutput(payload.output, "frame_sheet")
    ) {
      summary.native_frame_sheet_successes += 1
    }
  }

  return summary
}

async function resetTimingReport(): Promise<void> {
  if (timingReportReset) return
  timingReportReset = true
  await rm(timingReportPath, { force: true }).catch(() => undefined)
  await rm(timingReportPath.replace(/\.json$/, ".md"), { force: true }).catch(() => undefined)
}

function timeValueMs(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return timeValueMs(numeric)
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function elapsedBetween(
  end: number | string | null | undefined,
  start: number | string | null | undefined,
): number | null {
  const endMs = timeValueMs(end)
  const startMs = timeValueMs(start)
  if (endMs === null || startMs === null) return null
  return Math.max(0, endMs - startMs)
}

function elapsedFrom(end: number | string | null | undefined, startMs: number): number | null {
  const endMs = timeValueMs(end)
  if (endMs === null) return null
  return Math.max(0, endMs - startMs)
}

function hasSubsecondTimestampPrecision(value: number | string | null | undefined): boolean {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 10_000_000_000) return !Number.isInteger(value)
    return value % 1000 !== 0
  }
  if (typeof value !== "string" || !value.trim()) return false
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return hasSubsecondTimestampPrecision(numeric)
  return /\.\d+/.test(value)
}

function hasSubsecondToolTiming(input: {
  startAt: number | string | null | undefined
  endAt: number | string | null | undefined
}): boolean {
  return hasSubsecondTimestampPrecision(input.startAt) ||
    hasSubsecondTimestampPrecision(input.endAt)
}

function buildAutomaticCommentVisualTimingRow(input: {
  provider: LiveProvider
  run: LiveRunRow
  thread: {
    id: string
    anchorType: string
    screenshotPath: string | null
    visualObservedAtMs: number
  }
  submission: SubmissionTiming
  path: "comment.auto_current_frame_attachment" | "comment.auto_range_sheet_attachment"
}): VisualContextTimingRow {
  return {
    provider: input.provider,
    surface: "comment",
    path: input.path,
    trigger: "automatic_comment_visual",
    runId: input.run.id,
    threadId: input.thread.id,
    revisionId: input.run.revisionId,
    artifactPath: input.thread.screenshotPath,
    uiCardVisibleMs: input.submission.cardVisibleAtMs
      ? input.submission.cardVisibleAtMs - input.submission.submittedAtMs
      : null,
    autoVisualReadyMs: input.thread.visualObservedAtMs - input.submission.submittedAtMs,
    runObservedMs: input.submission.runObservedAtMs - input.submission.submittedAtMs,
    runCreatedToStartedMs: elapsedBetween(input.run.startedAt, input.run.createdAt),
    providerRunMs: elapsedBetween(input.run.completedAt, input.run.startedAt),
    e2eMs: input.thread.visualObservedAtMs - input.submission.submittedAtMs,
    status: "completed",
    notes: "Comment revision startup waits for this automatic visual so the first agent message includes it.",
  }
}

interface RunEventRow {
  type: string
  payloadJson: string
  createdAt: number | string | null
}

interface ToolTimeline {
  toolCallId: string
  toolName: string
  startAt: number | string | null
  endAt?: number | string | null
  input?: unknown
  output?: unknown
  status?: string
}

async function buildToolTimingRows(input: {
  dbPath: string
  run: LiveRunRow
  provider: LiveProvider
  surface: "chat" | "comment"
  submittedAtMs: number
  runObservedAtMs: number
}): Promise<VisualContextTimingRow[]> {
  const events = await sqliteJson<RunEventRow>(input.dbPath, `
    select
      type,
      payload_json as payloadJson,
      created_at as createdAt
    from agent_run_events
    where agent_run_id = ${sqlString(input.run.id)}
    order by sequence;
  `)
  const toolsById = new Map<string, ToolTimeline>()
  for (const event of events) {
    const payload = parseJsonObject(event.payloadJson)
    const toolCallId = String(payload?.toolCallId ?? "")
    if (!toolCallId) continue
    if (event.type === "tool_start") {
      toolsById.set(toolCallId, {
        toolCallId,
        toolName: String(payload.toolName ?? "AgentTool"),
        startAt: event.createdAt,
        input: payload.input,
      })
    } else if (event.type === "tool_update" && payload?.inputAvailable) {
      const existing = toolsById.get(toolCallId)
      if (existing) {
        existing.input = payload.input
      }
    } else if (event.type === "tool_end") {
      const existing = toolsById.get(toolCallId) ?? {
        toolCallId,
        toolName: String(payload?.toolName ?? "AgentTool"),
        startAt: event.createdAt,
      }
      existing.endAt = event.createdAt
      existing.output = payload?.output
      existing.status = String(payload?.status ?? "")
      toolsById.set(toolCallId, existing)
    }
  }

  const visualTools = Array.from(toolsById.values())
    .filter((tool) => Boolean(visualToolKind(tool.toolName)) && tool.status === "completed")
    .sort((left, right) =>
      (timeValueMs(left.startAt) ?? Number.MAX_SAFE_INTEGER) -
      (timeValueMs(right.startAt) ?? Number.MAX_SAFE_INTEGER)
    )
  const runStart = input.run.startedAt ?? input.run.createdAt
  return visualTools
    .map((tool, index) => {
      const previousVisual = index > 0 ? visualTools[index - 1] : null
      return buildToolTimingRow({
        ...input,
        tool,
        toolOrderIndex: index + 1,
        modelToolChoiceMs: elapsedBetween(
          tool.startAt,
          previousVisual?.endAt ?? previousVisual?.startAt ?? runStart,
        ),
      })
    })
    .filter((row): row is VisualContextTimingRow => Boolean(row))
}

function buildToolTimingRow(input: {
  run: LiveRunRow
  provider: LiveProvider
  surface: "chat" | "comment"
  submittedAtMs: number
  runObservedAtMs: number
  tool: ToolTimeline
  toolOrderIndex: number
  modelToolChoiceMs: number | null
}): VisualContextTimingRow | null {
  const toolKind = visualToolKind(input.tool.toolName)
  if (!toolKind || input.tool.status !== "completed") return null
  const artifactPath = artifactPathFromOutput(input.tool.output)
  const visualPath = timingPathForTool({
    surface: input.surface,
    toolKind,
    toolInput: input.tool.input,
    artifactPath,
  })
  if (!visualPath) return null
  const toolExecutionMs = elapsedBetween(input.tool.endAt ?? null, input.tool.startAt)
  const visualCaptureMs = visualCaptureMsFromOutput(input.tool.output)
  const nativeHandoffMs =
    hasSubsecondToolTiming({
      startAt: input.tool.startAt,
      endAt: input.tool.endAt ?? null,
    }) && toolExecutionMs !== null && visualCaptureMs !== null
      ? Math.max(0, toolExecutionMs - visualCaptureMs)
      : null
  const runStart = input.run.startedAt ?? input.run.createdAt
  return {
    provider: input.provider,
    surface: input.surface,
    path: visualPath,
    trigger: "agent_tool",
    runId: input.run.id,
    threadId: input.run.threadId,
    revisionId: input.run.revisionId,
    artifactPath,
    runObservedMs: input.runObservedAtMs - input.submittedAtMs,
    runCreatedToStartedMs: elapsedBetween(input.run.startedAt, input.run.createdAt),
    toolOrderIndex: input.toolOrderIndex,
    modelToolChoiceMs: input.modelToolChoiceMs,
    runStartedToToolStartMs: elapsedBetween(input.tool.startAt, runStart),
    toolExecutionMs,
    visualCaptureMs,
    nativeHandoffMs,
    providerRunMs: elapsedBetween(input.run.completedAt, input.run.startedAt),
    e2eMs: elapsedFrom(input.tool.endAt ?? null, input.submittedAtMs),
    status: "completed",
  }
}

function visualToolKind(toolName: string): "snapshot" | "frame_sheet" | null {
  if (isNativeVisualTool(toolName, "snapshot")) return "snapshot"
  if (isNativeVisualTool(toolName, "frame_sheet")) return "frame_sheet"
  return null
}

function timingPathForTool(input: {
  surface: "chat" | "comment"
  toolKind: "snapshot" | "frame_sheet"
  toolInput: unknown
  artifactPath: string | null
}): VisualContextTimingRow["path"] | null {
  if (input.toolKind === "frame_sheet") {
    return input.surface === "chat"
      ? "chat.frame_sheet_tool"
      : "comment.frame_sheet_tool"
  }
  const args = parseObject(input.toolInput) ?? {}
  const at = String(args.at ?? args.timeMs ?? "current").trim().toLowerCase()
  const artifactLooksCurrent = input.artifactPath?.endsWith("/current.png") ||
    input.artifactPath?.includes("/tmp/agent-attachments/")
  const artifactLooksTimestamped = input.artifactPath?.match(/\/\d{3,}\.png$/)
  if ((at === "current" || at === "") && !artifactLooksTimestamped || artifactLooksCurrent) {
    return input.surface === "chat"
      ? "chat.current_snapshot_tool"
      : "comment.current_snapshot_tool"
  }
  return input.surface === "chat"
    ? "chat.timestamp_snapshot_tool"
    : "comment.timestamp_snapshot_tool"
}

function visualOutputRecord(output: unknown): Record<string, unknown> | null {
  const direct = parseObject(output)
  if (direct) return direct
  if (typeof output !== "string") return null
  const jsonStart = output.indexOf("{")
  if (jsonStart < 0) return null
  try {
    const parsed = JSON.parse(output.slice(jsonStart))
    return parseObject(parsed)
  } catch {
    return null
  }
}

function artifactPathFromOutput(output: unknown): string | null {
  const record = visualOutputRecord(output)
  if (!record) return null
  if (typeof record.artifactPath === "string") return record.artifactPath
  const artifact = parseObject(record.artifact)
  if (typeof artifact?.path === "string") return artifact.path
  const payload = parseObject(record.payload)
  const snapshot = parseObject(payload?.snapshot)
  if (typeof snapshot?.path === "string") return snapshot.path
  const sheet = parseObject(payload?.sheet)
  if (typeof sheet?.path === "string") return sheet.path
  return null
}

function visualCaptureMsFromOutput(output: unknown): number | null {
  const record = visualOutputRecord(output)
  const payload = parseObject(record?.payload)
  const value = payload?.elapsedMs ?? record?.elapsedMs
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function usesVisualShellCommand(payload: any, rawPayload: string): boolean {
  const commands = getLoggedCommandTexts(payload)
  const toolName = String(payload?.toolName ?? "")
  return commands.some((command) => /\bripple\s+(snapshot|frame-sheet)\b/.test(command)) ||
    /Bash\(ripple (snapshot|frame-sheet)/.test(toolName) ||
    /"command"\s*:\s*"[^"]*ripple\s+(snapshot|frame-sheet)\b/.test(rawPayload)
}

function getLoggedCommandTexts(payload: any): string[] {
  const commandTexts = [String(payload?.command ?? "")]
  if (Array.isArray(payload?.parsed_cmd)) {
    for (const entry of payload.parsed_cmd) {
      commandTexts.push(String(entry?.command ?? ""))
    }
  }
  return commandTexts.filter(Boolean)
}

function isNativeVisualTool(
  toolName: string,
  kind: "snapshot" | "frame_sheet",
): boolean {
  const normalized = toolName
    .toLowerCase()
    .replace(/^mcp__ripple_visual_context__/, "")
    .replace(/^ripple_visual_context__/, "")
  if (kind === "snapshot") return normalized.includes("snapshot")
  return normalized.includes("frame_sheet") || normalized.includes("frame-sheet")
}

function isNativeVisualOutput(
  output: unknown,
  kind: "snapshot" | "frame_sheet",
): boolean {
  if (typeof output === "string") {
    return output.includes("Ripple visual context is attached as a native image.") &&
      (
        kind === "snapshot"
          ? output.includes('"type": "snapshot"')
          : output.includes('"type": "sheet"')
      )
  }
  const record = parseObject(output)
  if (!record) return false
  const outputType = String(record.type ?? "")
  const hasArtifactPath = typeof record.artifactPath === "string" ||
    typeof parseObject(record.artifact)?.path === "string"
  if (!hasArtifactPath) return false
  return kind === "snapshot"
    ? outputType === "snapshot"
    : outputType === "frame_sheet" || outputType === "sheet"
}

function parseJsonObject(value: string): any | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function parseObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null
}

async function sqliteJson<T>(dbPath: string, sql: string): Promise<T[]> {
  if (!existsSync(dbPath)) return []
  const { stdout } = await execFileAsync("sqlite3", [
    "-json",
    "-cmd",
    ".timeout 5000",
    dbPath,
    sql,
  ])
  return stdout.trim() ? JSON.parse(stdout) as T[] : []
}

async function countImages(root: string): Promise<number> {
  if (!existsSync(root)) return 0
  let count = 0
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = join(root, entry.name)
    if (entry.isDirectory()) {
      count += await countImages(child)
    } else if (/\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
      count += 1
    }
  }
  return count
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+/g, "_")
}
