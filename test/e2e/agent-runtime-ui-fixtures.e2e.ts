import type { Page, TestInfo } from "@playwright/test"
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
        checkpoint: checkpointWithRow(codexVisual, "visual_check", "pending", "Checking current frame"),
        visibleText: ["Checking current frame"],
      },
      {
        id: "codex-motion-edit-live",
        fixtureFile: "real-codex-visual-edit.json",
        checkpoint: checkpointWithRow(codexVisual, "motion_change", "pending", "Updating composition"),
        visibleText: ["Updating composition"],
      },
      {
        id: "claude-visual-answer",
        fixtureFile: "real-claude-visual-context.json",
        checkpoint: checkpointWithRow(claudeVisual, "visual_check", "done", "Checked current frame"),
        shimmerCount: 0,
        visibleText: ["Checked current frame"],
      },
      {
        id: "comment-revision-edit-live",
        fixtureFile: "real-codex-comment-revision.json",
        checkpoint: checkpointWithRow(commentRevision, "motion_change", "pending", "Updating composition"),
        visibleText: ["Updating composition"],
      },
      {
        id: "codex-project-local-approval-hidden",
        fixtureFile: "real-codex-approval.json",
        checkpoint: checkpointAfterEvent(approval, "approval_request"),
        visibleText: [
          "Updated composition",
          "Checked project",
        ],
        hiddenText: ["Codex needs permission to check the project"],
      },
      {
        id: "codex-phone-move-edit-live",
        fixtureFile: "real-codex-phone-move.json",
        checkpoint: checkpointWithRow(codexPhoneMove, "motion_change", "pending", "Updating composition"),
        visibleText: [
          "Checked current frame",
          "Updating composition",
        ],
        hiddenText: ["Thinking", "Codex needs permission"],
      },
      {
        id: "codex-phone-move-right-post-check-thinking",
        fixtureFile: "real-codex-phone-move-right.json",
        checkpoint: checkpointWithRows(codexPhoneMoveRight, [
          { kind: "motion_change", status: "done", title: "Updated composition" },
          { kind: "verification", status: "done", title: "Checked project" },
          { kind: "thinking", status: "pending", title: "Thinking" },
        ]),
        visibleText: [
          "Explored 1 file, 1 search",
          "Updated composition",
          "Checked project",
          "Thinking",
        ],
        hiddenText: ["Explored 3 files", "Codex needs permission"],
      },
      {
        id: "claude-phone-move-project-local-approval-hidden",
        fixtureFile: "real-claude-phone-move.json",
        checkpoint: checkpointWithRow(claudePhoneMove, "motion_change", "done", "Updated composition"),
        shimmerCount: 0,
        visibleText: [
          "Checked current frame",
          "Updated composition",
        ],
        hiddenText: ["Thinking", "Claude needs permission to update the project"],
      },
      {
        id: "claude-phone-move-right-final-reply",
        fixtureFile: "real-claude-phone-move-right.json",
        checkpoint: lastCheckpoint(claudePhoneMoveRight),
        visibleText: [
          "Updated composition",
          "Checked current frame",
          "The phone group has moved 100px to the right",
        ],
        hiddenText: ["Claude needs permission"],
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

      const shimmerCount = await page.locator("[data-text-shimmer='true']").count()
      if (fixtureCase.shimmerCount !== undefined) {
        expect(shimmerCount, fixtureCase.id).toBe(fixtureCase.shimmerCount)
      }
      expect(shimmerCount, fixtureCase.id).toBeLessThanOrEqual(1)

      const visibleText = await harness.innerText()
      expect(visibleText, fixtureCase.id).not.toMatch(RAW_RUNTIME_LEAK_PATTERN)

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
        checkpoint: checkpointWithRow(commentRevision, "motion_change", "pending", "Updating composition"),
        commentStatus: "running",
        shimmerCount: 1,
        visibleText: [
          "Lower the phones in the screen a lot.",
          "Updating composition",
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
          "Updated composition",
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
