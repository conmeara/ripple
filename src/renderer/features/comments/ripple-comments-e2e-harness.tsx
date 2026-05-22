"use client"

import { useEffect, useMemo, useState } from "react"
import type {
  RippleCommentMessageView,
  RippleCommentThreadView,
  RippleRevisionStatus,
  RippleRevisionView,
} from "../../../shared/ripple-comments"
import {
  AGENT_RUNTIME_UI_E2E_FIXTURE_STORAGE_KEY,
} from "../agents/ui/agent-runtime-ui-e2e-harness"
import { RippleCommentCardFixture } from "./RippleCommentsPane"

type FixtureExpectedRow = {
  kind: string
  status: string
  title: string
}

type FixtureCheckpoint = {
  name: string
  eventCount: number
  live: boolean
  expectedRows?: FixtureExpectedRow[]
}

type RuntimeUiFixture = {
  name?: string
  source?: {
    provider?: string
    status?: string
  }
  projectPath?: string
  checkpoints: FixtureCheckpoint[]
}

type HarnessPayload = {
  fixture: RuntimeUiFixture
  checkpointIndex?: number
  checkpointName?: string
  pendingStartup?: boolean
}

type ParsedHarnessPayload =
  | {
    ok: true
    payload: HarnessPayload
    checkpoint: FixtureCheckpoint
    checkpointIndex: number
  }
  | {
    ok: false
    message: string
  }

function readHarnessPayload(): ParsedHarnessPayload {
  const raw = window.localStorage.getItem(AGENT_RUNTIME_UI_E2E_FIXTURE_STORAGE_KEY)
  if (!raw) return { ok: false, message: "No fixture payload found." }

  try {
    const payload = JSON.parse(raw) as HarnessPayload
    const checkpoints = payload.fixture?.checkpoints
    if (!payload.fixture || !Array.isArray(checkpoints)) {
      return { ok: false, message: "Fixture payload is malformed." }
    }

    const checkpointIndex =
      typeof payload.checkpointName === "string"
        ? checkpoints.findIndex((candidate) => candidate.name === payload.checkpointName)
        : typeof payload.checkpointIndex === "number"
          ? payload.checkpointIndex
          : checkpoints.length - 1
    const checkpoint = checkpoints[checkpointIndex]

    if (!checkpoint) {
      return { ok: false, message: "Fixture checkpoint was not found." }
    }

    return { ok: true, payload, checkpoint, checkpointIndex }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not parse fixture payload.",
    }
  }
}

function lastRow(
  rows: FixtureExpectedRow[],
  predicate: (row: FixtureExpectedRow) => boolean,
): FixtureExpectedRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row && predicate(row)) return row
  }
  return null
}

function revisionStatusForCheckpoint(
  fixture: RuntimeUiFixture,
  checkpoint: FixtureCheckpoint,
): RippleRevisionStatus {
  if (fixture.source?.status === "failed" || fixture.source?.status === "cancelled") {
    return "failed"
  }

  const rows = checkpoint.expectedRows ?? []
  const pendingRow = lastRow(rows, (row) =>
    row.status === "pending" && row.kind !== "reply"
  )
  if (pendingRow?.kind === "motion_change") return "running"
  if (pendingRow) return "preparing"
  if (lastRow(rows, (row) => row.kind === "motion_change" && row.status === "done")) {
    return "proposed"
  }
  if (lastRow(rows, (row) => row.kind === "reply" && row.status === "done")) {
    return "answered"
  }
  return checkpoint.live ? "queued" : "answered"
}

function revisionSummaryForCheckpoint(
  fixture: RuntimeUiFixture,
  checkpoint: FixtureCheckpoint,
  status: RippleRevisionStatus,
): string | null {
  if (status === "failed") return null

  const rows = checkpoint.expectedRows ?? []
  const pendingRow = lastRow(rows, (row) =>
    row.status === "pending" && row.kind !== "reply"
  )
  const motionRow = lastRow(rows, (row) =>
    row.kind === "motion_change" && row.status === "done"
  )
  const visualRow = lastRow(rows, (row) =>
    row.kind === "visual_check" && row.status === "done"
  )
  const verificationRow = lastRow(rows, (row) =>
    row.kind === "verification" && row.status === "done"
  )
  const replyRow = lastRow(rows, (row) => row.kind === "reply" && row.status === "done")

  return (
    pendingRow?.title ??
    motionRow?.title ??
    visualRow?.title ??
    verificationRow?.title ??
    replyRow?.title ??
    (fixture.source?.provider === "claude" ? "Checked the request" : "Planning the change")
  )
}

function revisionErrorMessage(fixture: RuntimeUiFixture): string {
  return fixture.source?.status === "cancelled"
    ? "This generated change was cancelled."
    : "This generated change needs attention."
}

function buildDiffSummary(status: RippleRevisionStatus, summary: string | null): string | null {
  if (!summary || status === "failed") return null
  return JSON.stringify({
    fileCount: status === "answered" ? 0 : 1,
    additions: status === "answered" ? 0 : 4,
    deletions: 0,
    files: status === "answered" ? [] : ["index.html"],
    summary,
  })
}

function buildFixtureThread(
  fixture: RuntimeUiFixture,
  checkpoint: FixtureCheckpoint,
  options: { pendingStartup?: boolean } = {},
): RippleCommentThreadView {
  const createdAt = new Date("2026-05-21T12:00:00.000Z")
  const threadId = "agent-runtime-comments-e2e-thread"
  const revisionId = "agent-runtime-comments-e2e-revision"
  const userMessage: RippleCommentMessageView = {
    id: "agent-runtime-comments-e2e-message",
    threadId,
    revisionId: options.pendingStartup ? null : revisionId,
    role: "user",
    body: "Lower the phones in the screen a lot.",
    metadataJson: null,
    clientRequestId: null,
    createdAt,
  }

  const status = revisionStatusForCheckpoint(fixture, checkpoint)
  const summary = revisionSummaryForCheckpoint(fixture, checkpoint, status)
  const revision: RippleRevisionView = {
    id: revisionId,
    threadId,
    projectId: "agent-runtime-comments-e2e-project",
    compositionId: "main",
    conversationId: "agent-runtime-comments-e2e-conversation",
    chatId: "agent-runtime-comments-e2e-chat",
    subChatId: "agent-runtime-comments-e2e-sub-chat",
    status,
    previewContextKey: status === "answered" || status === "failed" ? null : revisionId,
    diffSummary: buildDiffSummary(status, summary),
    errorMessage: status === "failed" ? revisionErrorMessage(fixture) : null,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: status === "accepted" ? createdAt : null,
  }

  return {
    id: threadId,
    projectId: "agent-runtime-comments-e2e-project",
    compositionId: "main",
    conversationId: "agent-runtime-comments-e2e-conversation",
    anchorType: "frame",
    startTime: 1500,
    endTime: null,
    startFrame: 45,
    endFrame: null,
    elementSelector: null,
    clipKey: null,
    sourceFile: "index.html",
    screenshotPath: null,
    clientRequestId: null,
    status: "open",
    latestRevisionId: options.pendingStartup ? null : revisionId,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    deletedAt: null,
    messages: [userMessage],
    revisions: options.pendingStartup ? [] : [revision],
  }
}

export function shouldShowAgentRuntimeCommentsUiE2EHarness(): boolean {
  return Boolean(
    window.__RIPPLE_E2E__ === true &&
    window.location.hash.startsWith("#agent-runtime-comments-fixture"),
  )
}

export function AgentRuntimeCommentsUiE2EHarness() {
  const parsed = useMemo(readHarnessPayload, [])
  const [checkpointIndex, setCheckpointIndex] = useState(() =>
    parsed.ok ? parsed.checkpointIndex : 0
  )

  useEffect(() => {
    if (!parsed.ok) return

    const setTemporalCheckpoint = (input: number | string) => {
      const checkpoints = parsed.payload.fixture.checkpoints
      const nextIndex = typeof input === "number"
        ? input
        : checkpoints.findIndex((checkpoint) => checkpoint.name === input)
      if (nextIndex < 0 || nextIndex >= checkpoints.length) return
      setCheckpointIndex(nextIndex)
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ checkpointIndex?: number; checkpointName?: string }>).detail
      if (typeof detail?.checkpointIndex === "number") {
        setTemporalCheckpoint(detail.checkpointIndex)
      } else if (typeof detail?.checkpointName === "string") {
        setTemporalCheckpoint(detail.checkpointName)
      }
    }

    window.__RIPPLE_AGENT_UI_SET_CHECKPOINT__ = setTemporalCheckpoint
    window.addEventListener("ripple-agent-ui:set-checkpoint", handler)
    return () => {
      if (window.__RIPPLE_AGENT_UI_SET_CHECKPOINT__ === setTemporalCheckpoint) {
        delete window.__RIPPLE_AGENT_UI_SET_CHECKPOINT__
      }
      window.removeEventListener("ripple-agent-ui:set-checkpoint", handler)
    }
  }, [parsed])

  const thread = useMemo(() => {
    if (!parsed.ok) return null
    const checkpoint = parsed.payload.fixture.checkpoints[checkpointIndex] ?? parsed.checkpoint
    return buildFixtureThread(parsed.payload.fixture, checkpoint, {
      pendingStartup: parsed.payload.pendingStartup,
    })
  }, [checkpointIndex, parsed])

  if (!parsed.ok) {
    return (
      <main
        data-testid="agent-runtime-comments-e2e-harness"
        className="h-full w-full overflow-auto bg-background p-6 text-foreground"
      >
        <div role="alert" className="text-sm text-destructive">{parsed.message}</div>
      </main>
    )
  }

  const revision = thread?.revisions[0] ?? null
  const checkpoint = parsed.payload.fixture.checkpoints[checkpointIndex] ?? parsed.checkpoint

  return (
    <main
      data-testid="agent-runtime-comments-e2e-harness"
      data-fixture-provider={parsed.payload.fixture.source?.provider ?? "unknown"}
      data-fixture-checkpoint={checkpoint.name}
      data-fixture-checkpoint-index={checkpointIndex}
      data-fixture-comment-status={revision?.status ?? "pending-startup"}
      className="h-full w-full overflow-auto bg-background p-6 text-foreground"
    >
      <div className="mx-auto max-w-md">
        {thread ? (
          <RippleCommentCardFixture
            thread={thread}
            selected={true}
            activePreviewRevisionId={null}
            agentTextResetKey={`${parsed.checkpoint.eventCount}`}
          />
        ) : (
          <div className="text-sm text-muted-foreground">Loading fixture...</div>
        )}
      </div>
    </main>
  )
}
