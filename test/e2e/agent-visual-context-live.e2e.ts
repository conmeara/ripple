import { existsSync } from "node:fs"
import { execFile } from "node:child_process"
import { copyFile, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import type { ElectronApplication, Locator, Page } from "@playwright/test"
import {
  dismissFirstRun,
  expect,
  test,
  type RippleE2EContext,
} from "./helpers/ripple-electron"

const execFileAsync = promisify(execFile)
const liveAgentEnabled = process.env.RIPPLE_E2E_LIVE_AGENT === "1"
const liveProvider = normalizeLiveProvider(process.env.RIPPLE_E2E_LIVE_AGENT_PROVIDER)

test.describe("Ripple live agent visual context", () => {
  test.skip(
    !liveAgentEnabled,
    "Set RIPPLE_E2E_LIVE_AGENT=1 to run this live Codex/Claude visual-context proof.",
  )

  test("runs a real provider against the current app frame and records visual checks in SQLite @live", async ({
    electronApp,
    page,
    e2e,
  }) => {
    test.setTimeout(300_000)
    await configureLiveProvider(page, liveProvider)
    await page.reload()
    await dismissFirstRun(page)

    const projectDir = await openBasicTitleCardProject({ electronApp, page, e2e })
    await expect(page.getByTestId("ripple-shell")).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId("ripple-shell-project-name")).toContainText("Basic Title Card")
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    await page.getByText("Project opened").waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined)

    const previewTime = page.getByRole("slider", { name: "Preview time" })
    await expect(previewTime).toHaveAttribute("aria-disabled", "false", { timeout: 45_000 })
    const timelineBox = await previewTime.boundingBox()
    if (!timelineBox) throw new Error("Preview timeline did not expose a clickable box.")
    await page.mouse.click(timelineBox.x + timelineBox.width * 0.5, timelineBox.y + timelineBox.height / 2)
    await expect.poll(async () => Number(await previewTime.getAttribute("aria-valuenow"))).toBeGreaterThan(0)

    const dbPath = join(e2e.tempRoot, "userData", "data", "agents.db")
    const marker = `VISUAL_CONTEXT_E2E_DONE_${safeId(e2e.runId)}`
    const prompt = [
      "This is a live Ripple visual-context QA run. Do not edit files.",
      "Run `ripple snapshot --at current --json` to inspect the frame currently visible in Ripple.",
      "Run `ripple frame-sheet --range 0s..1s --samples 3 --columns 3 --json` to inspect motion over time.",
      "Do not use an absolute Ripple path, `bun scripts/ripple-cli.ts`, or HyperFrames CLI for these checks.",
      `Reply with ${marker}, plus the snapshot path and frame-sheet path.`,
    ].join("\n")
    const runCountBefore = await readAgentRunCount(dbPath)

    const editor = page.locator('[contenteditable="true"]').last()
    await expect(editor).toBeVisible({ timeout: 30_000 })
    await editor.fill(prompt)
    await expect(editor).toContainText("This is a live Ripple visual-context QA run")
    const sendButton = page.getByRole("button", { name: "Send message" })
    await expect(sendButton).toBeEnabled({ timeout: 10_000 })
    await submitAgentPrompt({ sendButton, dbPath, runCountBefore })

    await expect(page.getByText(marker)).toBeVisible({ timeout: 240_000 })

    const run = await waitForLatestRun(dbPath)
    expect(run.provider).toBe(liveProvider)
    expect(run.status).toBe("completed")
    expect(run.runtime_context_json).toContain("previewTimeSeconds")

    const eventSummary = await readRunEventSummary(dbPath, run.id)
    expect(eventSummary.approval_requests).toBe(0)
    expect(eventSummary.command_not_found).toBe(0)
    expect(eventSummary.snapshot_successes).toBeGreaterThan(0)
    expect(eventSummary.sheet_successes).toBeGreaterThan(0)
    expect(eventSummary.done_mentions).toBeGreaterThan(0)
    expect(await countImages(join(projectDir, ".ripple", "visual-context", "snapshots"))).toBeGreaterThan(0)
    expect(await countImages(join(projectDir, ".ripple", "frame-sheets"))).toBeGreaterThan(0)
  })
})

function normalizeLiveProvider(value: string | undefined): "codex" | "claude" {
  if (value === "claude") return "claude"
  return "codex"
}

async function configureLiveProvider(page: Page, provider: "codex" | "claude"): Promise<void> {
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
  await writeFile(join(projectDir, "AGENTS.md"), "Use Ripple visual context for visual checks.\n", "utf8")

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

async function waitForLatestRun(dbPath: string): Promise<{
  id: string
  status: string
  provider: string
  runtime_context_json: string
}> {
  await expect.poll(
    async () => {
      const [run] = await sqliteJson<any>(dbPath, `
        select id, status, provider, runtime_context_json
        from agent_runs
        order by created_at desc
        limit 1;
      `)
      return run?.status ?? null
    },
    {
      message: "expected a live agent run to complete",
      timeout: 240_000,
    },
  ).toBe("completed")

  const [run] = await sqliteJson<any>(dbPath, `
    select id, status, provider, runtime_context_json
    from agent_runs
    order by created_at desc
    limit 1;
  `)
  if (!run) throw new Error("No agent run was recorded.")
  return run
}

async function readRunEventSummary(dbPath: string, runId: string): Promise<{
  approval_requests: number
  command_not_found: number
  snapshot_successes: number
  sheet_successes: number
  done_mentions: number
}> {
  const events = await sqliteJson<{ type: string; payload_json: string }>(dbPath, `
    select type, payload_json
    from agent_run_events
    where agent_run_id = ${sqlString(runId)};
  `)

  const summary = {
    approval_requests: 0,
    command_not_found: 0,
    snapshot_successes: 0,
    sheet_successes: 0,
    done_mentions: 0,
  }

  for (const event of events) {
    const rawPayload = event.payload_json ?? ""
    if (event.type === "approval_request") summary.approval_requests += 1
    if (rawPayload.includes("command not found")) summary.command_not_found += 1
    if (rawPayload.includes("VISUAL_CONTEXT_E2E_DONE")) summary.done_mentions += 1
    if (event.type !== "tool_end") continue

    const payload = parseJsonObject(rawPayload)
    const commandTexts = getLoggedCommandTexts(payload)
    const output = parseJsonObject(String(payload?.output ?? ""))
    if (payload?.status !== "completed" || output?.ok !== true) continue

    const source = output.context?.source
    if (
      output.type === "snapshot" &&
      hasBareRippleVisualCommand(commandTexts, "snapshot", ["--at current", "--json"]) &&
      output.snapshot?.path &&
      source?.kind === "live-app" &&
      source?.preEdit === false
    ) {
      summary.snapshot_successes += 1
    }
    if (
      output.type === "sheet" &&
      hasBareRippleVisualCommand(commandTexts, "frame-sheet", [
        "--range 0s..1s",
        "--samples 3",
        "--columns 3",
        "--json",
      ]) &&
      output.sheet?.path &&
      source?.kind === "app-render" &&
      source?.preEdit === false
    ) {
      summary.sheet_successes += 1
    }
  }

  return summary
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

function hasBareRippleVisualCommand(
  commandTexts: string[],
  subcommand: "snapshot" | "frame-sheet",
  requiredFragments: string[],
): boolean {
  return commandTexts.some((command) =>
    isBareRippleVisualCommand(command, subcommand) &&
    requiredFragments.every((fragment) => command.includes(fragment)) &&
    !usesDisallowedRippleVisualCommand(command),
  )
}

function usesDisallowedRippleVisualCommand(command: string): boolean {
  return command.includes("$RIPPLE_CLI_PATH") ||
    command.includes("scripts/ripple-cli") ||
    command.includes("resources/cli/ripple") ||
    command.includes("node_modules/.bin/ripple") ||
    command.includes("hyperframes")
}

async function submitAgentPrompt(input: {
  sendButton: Locator
  dbPath: string
  runCountBefore: number
}): Promise<void> {
  await input.sendButton.scrollIntoViewIfNeeded()
  await input.sendButton.click()
  await expect.poll(
    async () => readAgentRunCount(input.dbPath),
    {
      message: "expected clicking the composer send button to submit the live agent prompt",
      timeout: 30_000,
    },
  ).toBeGreaterThan(input.runCountBefore)
}

async function readAgentRunCount(dbPath: string): Promise<number> {
  const [summary] = await sqliteJson<{ run_count: number }>(dbPath, `
    select count(*) as run_count from agent_runs;
  `)
  return Number(summary?.run_count ?? 0)
}

function isBareRippleVisualCommand(command: string, subcommand: "snapshot" | "frame-sheet"): boolean {
  return new RegExp(String.raw`(^|\s)ripple\s+${subcommand}(\s|$)`).test(command)
}

function parseJsonObject(value: string): any | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
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
