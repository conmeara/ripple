import type { Locator, Page, TestInfo } from "@playwright/test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "./helpers/ripple-electron"

const FIXTURE_STORAGE_KEY = "ripple:agent-runtime-ui-e2e-fixture"

type RuntimeFixtureEvent = {
  type?: string
}

type FixtureCheckpoint = {
  name: string
  eventCount: number
  live: boolean
  shimmerCount: number
  expectedRows: Array<{
    kind: string
    status: string
    title: string
  }>
}

type RuntimeUiFixture = {
  source: {
    provider: string
    status: string
  }
  projectPath: string
  events: RuntimeFixtureEvent[]
  checkpoints: FixtureCheckpoint[]
}

type FixtureCase = {
  id: string
  fixtureFile: string
  checkpoint: FixtureCheckpoint
  visibleText: string[]
  hiddenText?: string[]
  shimmerCount?: number
}

type CommentFixtureCase = FixtureCase & {
  pendingStartup?: boolean
  commentStatus: string
  shimmerCount: number
  enabledButton?: string
}

const RAW_RUNTIME_LEAK_PATTERN =
  /\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__)\b|(?:\/bin\/zsh|sed -n|git diff|bun run|npm run|hyperframes validate|\/Users\/|\/private\/tmp\/)/i

const COMMENT_RAW_RUNTIME_LEAK_PATTERN =
  /\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__|Agent is thinking|Editing files|Agent run)\b|(?:\/bin\/zsh|sed -n|git diff|bun run|npm run|hyperframes validate|\/Users\/|\/private\/tmp\/)/i

function loadFixture(file: string): RuntimeUiFixture {
  return JSON.parse(
    readFileSync(join(process.cwd(), "test/fixtures/agent-runtime-ui", file), "utf8"),
  ) as RuntimeUiFixture
}

function checkpointWithRow(
  fixture: RuntimeUiFixture,
  kind: string,
  status: string,
  title: string,
): FixtureCheckpoint {
  const checkpoint = fixture.checkpoints.find((candidate) =>
    candidate.expectedRows.some((row) =>
      row.kind === kind &&
      row.status === status &&
      row.title === title
    )
  )
  if (!checkpoint) {
    throw new Error(`Missing checkpoint for ${kind}:${status}:${title}`)
  }
  return checkpoint
}

function checkpointWithRows(
  fixture: RuntimeUiFixture,
  rows: Array<{ kind: string; status: string; title: string }>,
): FixtureCheckpoint {
  const checkpoint = fixture.checkpoints.find((candidate) =>
    rows.every((expected) =>
      candidate.expectedRows.some((row) =>
        row.kind === expected.kind &&
        row.status === expected.status &&
        row.title === expected.title
      )
    )
  )
  if (!checkpoint) {
    const labels = rows.map((row) => `${row.kind}:${row.status}:${row.title}`).join(", ")
    throw new Error(`Missing checkpoint for rows: ${labels}`)
  }
  return checkpoint
}

function checkpointAfterEvent(
  fixture: RuntimeUiFixture,
  eventType: string,
): FixtureCheckpoint {
  const eventIndex = fixture.events.findIndex((event) => event.type === eventType)
  if (eventIndex === -1) {
    throw new Error(`Missing fixture event ${eventType}`)
  }
  const checkpoint = fixture.checkpoints.find((candidate) =>
    candidate.eventCount >= eventIndex + 1
  )
  if (!checkpoint) {
    throw new Error(`Missing checkpoint after fixture event ${eventType}`)
  }
  return checkpoint
}

function lastCheckpoint(fixture: RuntimeUiFixture): FixtureCheckpoint {
  const checkpoint = fixture.checkpoints.at(-1)
  if (!checkpoint) throw new Error("Fixture has no checkpoints")
  return checkpoint
}

async function renderFixtureCheckpoint(
  page: Page,
  fixture: RuntimeUiFixture,
  checkpoint: FixtureCheckpoint,
): Promise<void> {
  const checkpointIndex = fixture.checkpoints.indexOf(checkpoint)
  if (checkpointIndex === -1) {
    throw new Error(`Checkpoint is not part of the provided fixture: ${checkpoint.name}`)
  }
  await page.waitForLoadState("domcontentloaded")
  await page.evaluate(({ storageKey, fixture, checkpointIndex }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({ fixture, checkpointIndex }))
    window.location.hash = "agent-runtime-ui-fixture"
  }, {
    storageKey: FIXTURE_STORAGE_KEY,
    fixture,
    checkpointIndex,
  })
  await page.reload()
  await expect(page.getByTestId("agent-runtime-ui-e2e-harness")).toBeVisible({
    timeout: 45_000,
  })
  await expect(page.getByTestId("agent-runtime-ui-e2e-harness"))
    .toHaveAttribute("data-fixture-checkpoint", checkpoint.name)
  await expect(page.locator("[data-assistant-message-id]")).toBeVisible()
}

async function renderCommentsFixtureCheckpoint(
  page: Page,
  fixture: RuntimeUiFixture,
  checkpoint: FixtureCheckpoint,
  options: { pendingStartup?: boolean } = {},
): Promise<void> {
  const checkpointIndex = fixture.checkpoints.indexOf(checkpoint)
  if (checkpointIndex === -1) {
    throw new Error(`Checkpoint is not part of the provided fixture: ${checkpoint.name}`)
  }
  await page.waitForLoadState("domcontentloaded")
  await page.evaluate(({ storageKey, fixture, checkpointIndex, pendingStartup }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      fixture,
      checkpointIndex,
      pendingStartup,
    }))
    window.location.hash = "agent-runtime-comments-fixture"
  }, {
    storageKey: FIXTURE_STORAGE_KEY,
    fixture,
    checkpointIndex,
    pendingStartup: options.pendingStartup ?? false,
  })
  await page.reload()
  await expect(page.getByTestId("agent-runtime-comments-e2e-harness")).toBeVisible({
    timeout: 45_000,
  })
  await expect(page.getByTestId("agent-runtime-comments-e2e-harness"))
    .toHaveAttribute("data-fixture-checkpoint", checkpoint.name)
  await expect(page.locator("[data-comment-card='true']")).toBeVisible()
}

async function attachHarnessScreenshot(
  page: Page,
  testInfo: TestInfo,
  caseId: string,
): Promise<void> {
  const path = testInfo.outputPath(`${caseId}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(`${caseId} screenshot`, {
    path,
    contentType: "image/png",
  })
}

async function openRuntimeActivityDisclosures(harness: Locator): Promise<void> {
  const buttons = harness.locator("[data-agent-motion-runtime-feed='true'] [role='button']")
  const count = await buttons.count()
  for (let index = 0; index < count; index++) {
    await buttons.nth(index).click()
  }
}

test.describe("agent runtime UI real-session fixtures", () => {
  test("render through the chat message UI without raw runtime leakage @agent-ui", async ({
    page,
  }, testInfo) => {
    const codexVisual = loadFixture("real-codex-visual-edit.json")
    const claudeVisual = loadFixture("real-claude-visual-context.json")
    const commentRevision = loadFixture("real-codex-comment-revision.json")
    const approval = loadFixture("real-codex-approval.json")
    const codexPhoneMove = loadFixture("real-codex-phone-move.json")
    const codexPhoneMoveRight = loadFixture("real-codex-phone-move-right.json")
    const claudePhoneMove = loadFixture("real-claude-phone-move.json")
    const claudePhoneMoveRight = loadFixture("real-claude-phone-move-right.json")

    const cases: FixtureCase[] = [
      {
        id: "codex-visual-check-live",
        fixtureFile: "real-codex-visual-edit.json",
        checkpoint: checkpointWithRow(codexVisual, "visual_check", "pending", "Looking"),
        visibleText: ["Looking"],
      },
      {
        id: "codex-motion-edit-live",
        fixtureFile: "real-codex-visual-edit.json",
        checkpoint: checkpointWithRow(codexVisual, "motion_change", "pending", "Editing"),
        visibleText: ["Editing"],
      },
      {
        id: "claude-visual-answer",
        fixtureFile: "real-claude-visual-context.json",
        checkpoint: checkpointWithRow(claudeVisual, "visual_check", "done", "Looked"),
        shimmerCount: 0,
        visibleText: ["Looked"],
      },
      {
        id: "comment-revision-edit-live",
        fixtureFile: "real-codex-comment-revision.json",
        checkpoint: checkpointWithRow(commentRevision, "motion_change", "pending", "Editing"),
        visibleText: ["Editing"],
      },
      {
        id: "codex-project-local-approval-hidden",
        fixtureFile: "real-codex-approval.json",
        checkpoint: checkpointWithRow(approval, "explored", "pending", "Exploring 1 file"),
        visibleText: [
          "Verified",
          "Exploring 1 file",
        ],
        hiddenText: ["Approval needed to check the project"],
      },
      {
        id: "codex-phone-move-edit-live",
        fixtureFile: "real-codex-phone-move.json",
        checkpoint: checkpointWithRow(codexPhoneMove, "motion_change", "pending", "Editing"),
        visibleText: [
          "Looked",
          "Editing",
        ],
        hiddenText: ["Thinking", "Approval needed"],
      },
      {
        id: "codex-phone-move-right-post-check-thinking",
        fixtureFile: "real-codex-phone-move-right.json",
        checkpoint: checkpointWithRows(codexPhoneMoveRight, [
          { kind: "motion_change", status: "done", title: "Edited" },
          { kind: "verification", status: "done", title: "Verified" },
          { kind: "thinking", status: "pending", title: "Thinking" },
        ]),
        visibleText: [
          "Edited",
          "Thinking",
        ],
        hiddenText: ["Explored 3 files", "Approval needed"],
      },
      {
        id: "codex-phone-move-right-interleaved-final-reply",
        fixtureFile: "real-codex-phone-move-right.json",
        checkpoint: lastCheckpoint(codexPhoneMoveRight),
        shimmerCount: 0,
        visibleText: ["Edited", "Looked"],
        hiddenText: ["Approval needed"],
      },
      {
        id: "claude-phone-move-edit-visible",
        fixtureFile: "real-claude-phone-move.json",
        checkpoint: checkpointWithRow(claudePhoneMove, "motion_change", "done", "Edited"),
        shimmerCount: 0,
        visibleText: [
          "Looked",
          "Edited",
        ],
        hiddenText: ["Thinking", "Approval needed to update the project"],
      },
      {
        id: "claude-phone-move-edit-then-look-order",
        fixtureFile: "real-claude-phone-move.json",
        checkpoint: checkpointWithRows(claudePhoneMove, [
          { kind: "motion_change", status: "done", title: "Edited" },
          { kind: "visual_check", status: "pending", title: "Looking" },
        ]),
        shimmerCount: 1,
        visibleText: ["Edited, looking"],
        hiddenText: ["Looking, edited", "Approval needed"],
      },
      {
        id: "claude-phone-move-final-reply-preserved",
        fixtureFile: "real-claude-phone-move.json",
        checkpoint: lastCheckpoint(claudePhoneMove),
        shimmerCount: 0,
        visibleText: [
          "The phones have shifted noticeably to the left",
        ],
        hiddenText: ["Generating", "Approval needed"],
      },
      {
        id: "claude-phone-move-right-post-read-thinking",
        fixtureFile: "real-claude-phone-move-right.json",
        checkpoint: checkpointWithRows(claudePhoneMoveRight, [
          { kind: "visual_check", status: "done", title: "Looked" },
          { kind: "explored", status: "done", title: "Explored 1 file" },
          { kind: "thinking", status: "pending", title: "Thinking" },
        ]),
        visibleText: [
          "Looked",
          "explored 1 file",
          "Thinking",
        ],
        hiddenText: ["Approval needed"],
      },
      {
        id: "claude-phone-move-right-final-reply",
        fixtureFile: "real-claude-phone-move-right.json",
        checkpoint: lastCheckpoint(claudePhoneMoveRight),
        visibleText: [
          "Edited",
          "looked",
          "The phones have shifted to the right",
        ],
        hiddenText: ["Approval needed"],
      },
    ]

    const fixtureByFile = new Map([
      ["real-codex-visual-edit.json", codexVisual],
      ["real-claude-visual-context.json", claudeVisual],
      ["real-codex-comment-revision.json", commentRevision],
      ["real-codex-approval.json", approval],
      ["real-codex-phone-move.json", codexPhoneMove],
      ["real-codex-phone-move-right.json", codexPhoneMoveRight],
      ["real-claude-phone-move.json", claudePhoneMove],
      ["real-claude-phone-move-right.json", claudePhoneMoveRight],
    ])

    for (const fixtureCase of cases) {
      const fixture = fixtureByFile.get(fixtureCase.fixtureFile)
      if (!fixture) throw new Error(`Fixture not loaded: ${fixtureCase.fixtureFile}`)
      await renderFixtureCheckpoint(page, fixture, fixtureCase.checkpoint)

      const harness = page.getByTestId("agent-runtime-ui-e2e-harness")
      await expect(page.locator("[data-agent-motion-runtime-feed='true']").first()).toBeVisible()
      for (const text of fixtureCase.visibleText) {
        await expect(harness.getByText(text).first()).toBeVisible()
      }
      for (const text of fixtureCase.hiddenText ?? []) {
        await expect(harness.getByText(text).first()).toHaveCount(0)
      }

      const shimmerCount = await harness.locator("[data-text-shimmer='true']").count()
      const expectedShimmerCount =
        fixtureCase.shimmerCount ?? fixtureCase.checkpoint.shimmerCount
      const shimmerLabels = await harness.locator("[data-text-shimmer='true']")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ""))
      expect(shimmerCount, `${fixtureCase.id}: ${JSON.stringify(shimmerLabels)}`)
        .toBe(expectedShimmerCount)
      expect(shimmerCount, fixtureCase.id).toBeLessThanOrEqual(1)

      const visibleText = await harness.innerText()
      expect(visibleText, fixtureCase.id).not.toMatch(RAW_RUNTIME_LEAK_PATTERN)
      expect(visibleText, fixtureCase.id).not.toContain(" · ")
      expect(visibleText, fixtureCase.id).not.toContain("Edited composition")
      await expect(
        harness.locator("[data-agent-motion-visual-preview='true']"),
        `${fixtureCase.id}: visual previews stay inside the closed umbrella`,
      ).toHaveCount(0)
      if (fixtureCase.id === "codex-phone-move-right-post-check-thinking") {
        expect(visibleText, fixtureCase.id).toMatch(/Edited, verified\s+Thinking/)
        expect(visibleText, fixtureCase.id).not.toContain("Thinking,")
      }
      if (fixtureCase.id === "claude-phone-move-right-post-read-thinking") {
        expect(visibleText, fixtureCase.id).toMatch(/Looked, explored 1 file\s+Thinking/)
        expect(visibleText, fixtureCase.id).not.toMatch(/Thinking\s+Looked, explored 1 file/)
      }
      if (fixtureCase.id === "claude-phone-move-edit-then-look-order") {
        expect(visibleText, fixtureCase.id).toMatch(/Edited, looking/)
        expect(visibleText, fixtureCase.id).not.toMatch(/Looking, edited/)
      }
      if (fixtureCase.id === "codex-phone-move-right-interleaved-final-reply") {
        const transcriptSequence = await harness
          .locator("[data-assistant-message-id] > div")
          .first()
          .evaluate((container) =>
            Array.from(container.children)
              .map((child) => {
                if (
                  child.matches("[data-agent-motion-runtime-feed='true']") ||
                  child.querySelector("[data-agent-motion-runtime-feed='true']")
                ) return "runtime"
                if (
                  child.matches("[data-part-type='text']") ||
                  child.querySelector("[data-part-type='text']")
                ) return "text"
                return "other"
              })
              .filter((kind) => kind === "runtime" || kind === "text")
          )
        expect(
          transcriptSequence.filter((kind) => kind === "runtime").length,
          `${fixtureCase.id}: Codex runtime work should stay split across the transcript`,
        ).toBeGreaterThan(1)
        expect(
          transcriptSequence.join(" "),
          `${fixtureCase.id}: runtime rows should stay interleaved with agent text`,
        ).toMatch(/runtime text runtime text runtime/)
        await openRuntimeActivityDisclosures(harness)
        const detailRows = harness.locator("[data-agent-motion-detail-row='true']")
        const readWeight = await detailRows
          .filter({ hasText: /^Read / })
          .first()
          .evaluate((node) => getComputedStyle(node).fontWeight)
        const commandWeight = await detailRows
          .filter({ hasText: /^Ran (git diff|hyperframes lint)/ })
          .first()
          .evaluate((node) => getComputedStyle(node).fontWeight)
        expect(commandWeight, `${fixtureCase.id}: verification detail row weight`)
          .toBe(readWeight)
        await expect(harness.getByText(/^Ran git diff -- index\.html$/).first())
          .toBeVisible()
        await expect(harness.getByText(/^Ran hyperframes lint \.$/).first())
          .toBeVisible()
        await expect(
          detailRows.filter({ hasText: /^Verified$/ }),
          `${fixtureCase.id}: opened trail should use concrete verification details`,
        ).toHaveCount(0)
      }
      if (fixtureCase.id === "codex-project-local-approval-hidden") {
        await openRuntimeActivityDisclosures(harness)
        await expect(harness.getByText("Read app-showcase.html").first())
          .toBeVisible()
        await expect(
          harness.locator("[data-agent-motion-collapsible-activity='true']"),
          `${fixtureCase.id}: opened umbrella should not contain nested umbrellas`,
        ).toHaveCount(0)
      }
      if (fixtureCase.id === "claude-phone-move-right-final-reply") {
        await openRuntimeActivityDisclosures(harness)
        await expect(harness.locator("[data-agent-motion-visual-preview='true']").first())
          .toBeVisible()
        await expect(harness.getByText(/^Read app-showcase\.html$/).first())
          .toBeVisible()
        await expect(harness.getByText(/^Edited app-showcase\.html/).first())
          .toBeVisible()
        const detailRows = harness.locator("[data-agent-motion-detail-row='true']")
        const lookedWeight = await detailRows
          .filter({ hasText: /^Looked$/ })
          .first()
          .evaluate((node) => getComputedStyle(node).fontWeight)
        const readWeight = await detailRows
          .filter({ hasText: /^Read / })
          .first()
          .evaluate((node) => getComputedStyle(node).fontWeight)
        expect(lookedWeight, `${fixtureCase.id}: visual detail row weight`).toBe(readWeight)
        await expect(
          harness.locator("[data-agent-motion-collapsible-activity='true']"),
          `${fixtureCase.id}: opened umbrella should not contain nested umbrellas`,
        ).toHaveCount(0)
      }

      await attachHarnessScreenshot(page, testInfo, fixtureCase.id)
    }
  })

  test("render through the comments card UI without stale shimmer or raw runtime leakage @agent-ui @comments", async ({
    page,
  }, testInfo) => {
    const commentRevision = loadFixture("real-codex-comment-revision.json")
    const cancelled = loadFixture("real-codex-cancelled.json")
    const claudeError = loadFixture("real-claude-error.json")

    const cases: CommentFixtureCase[] = [
      {
        id: "comments-startup-visual-context",
        fixtureFile: "real-codex-comment-revision.json",
        checkpoint: commentRevision.checkpoints[0]!,
        pendingStartup: true,
        commentStatus: "pending-startup",
        shimmerCount: 1,
        visibleText: [
          "Lower the phones in the screen a lot.",
          "Preparing visual context",
        ],
      },
      {
        id: "comments-revision-edit-live",
        fixtureFile: "real-codex-comment-revision.json",
        checkpoint: checkpointWithRow(commentRevision, "motion_change", "pending", "Editing"),
        commentStatus: "running",
        shimmerCount: 1,
        visibleText: [
          "Lower the phones in the screen a lot.",
          "Editing",
        ],
      },
      {
        id: "comments-revision-proposed",
        fixtureFile: "real-codex-comment-revision.json",
        checkpoint: lastCheckpoint(commentRevision),
        commentStatus: "proposed",
        shimmerCount: 0,
        enabledButton: "Accept changes",
        visibleText: [
          "Lower the phones in the screen a lot.",
          "Edited",
        ],
      },
      {
        id: "comments-codex-cancelled",
        fixtureFile: "real-codex-cancelled.json",
        checkpoint: lastCheckpoint(cancelled),
        commentStatus: "failed",
        shimmerCount: 0,
        enabledButton: "Refresh changes",
        visibleText: [
          "Lower the phones in the screen a lot.",
          "This generated change was cancelled.",
        ],
      },
      {
        id: "comments-claude-error",
        fixtureFile: "real-claude-error.json",
        checkpoint: lastCheckpoint(claudeError),
        commentStatus: "failed",
        shimmerCount: 0,
        enabledButton: "Refresh changes",
        visibleText: [
          "Lower the phones in the screen a lot.",
          "This generated change needs attention.",
        ],
      },
    ]

    const fixtureByFile = new Map([
      ["real-codex-comment-revision.json", commentRevision],
      ["real-codex-cancelled.json", cancelled],
      ["real-claude-error.json", claudeError],
    ])

    for (const fixtureCase of cases) {
      const fixture = fixtureByFile.get(fixtureCase.fixtureFile)
      if (!fixture) throw new Error(`Fixture not loaded: ${fixtureCase.fixtureFile}`)
      await renderCommentsFixtureCheckpoint(page, fixture, fixtureCase.checkpoint, {
        pendingStartup: fixtureCase.pendingStartup,
      })

      const harness = page.getByTestId("agent-runtime-comments-e2e-harness")
      await expect(harness).toHaveAttribute(
        "data-fixture-comment-status",
        fixtureCase.commentStatus,
      )
      for (const text of fixtureCase.visibleText) {
        await expect(harness.getByText(text).first()).toBeVisible()
      }
      if (fixtureCase.enabledButton) {
        await expect(harness.getByRole("button", {
          name: fixtureCase.enabledButton,
        })).toBeEnabled()
      }

      const shimmerCount = await harness.locator("[data-text-shimmer='true']").count()
      expect(shimmerCount, fixtureCase.id).toBe(fixtureCase.shimmerCount)
      expect(shimmerCount, fixtureCase.id).toBeLessThanOrEqual(1)

      const visibleText = await harness.innerText()
      expect(visibleText, fixtureCase.id).not.toMatch(COMMENT_RAW_RUNTIME_LEAK_PATTERN)

      await attachHarnessScreenshot(page, testInfo, fixtureCase.id)
    }
  })
})
