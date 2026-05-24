import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  buildAgentRuntimeAssistantProjection,
  type RuntimeEventLike,
} from "../../src/shared/agent-runtime-ui-projection"
import {
  latestAgentRuntimeActivityLine,
  summarizeAgentRuntimePart,
} from "../../src/shared/agent-runtime-summary"
import {
  buildMotionRuntimeActivity,
  type MotionRuntimeActivityItem,
} from "../../src/renderer/features/agents/ui/motion-runtime-activity"
import {
  formatRevisionStatusLine,
  revisionStatusLabel,
} from "../../src/renderer/features/comments/comment-formatting"

type IdealManifest = {
  schemaVersion: 1
  sourceSpec: string
  cases: Array<{
    id: string
    input: string
    expected: string
    covers: string[]
  }>
}

type IdealInput = {
  schemaVersion: 1
  provider: string
  surface: "chat" | "comment"
  projectPath?: string
  events: RuntimeEventLike[]
  checkpoints?: Array<{
    name: string
    eventCount: number
  }>
}

const repoRoot = process.cwd()
const specPath = join(repoRoot, "docs/specs/Agent Runtime Ideal Architecture.html")
const idealFixtureDir = join(repoRoot, "test/fixtures/agent-runtime-ideal")

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(idealFixtureDir, fileName), "utf8")) as T
}

function visibleItemText(item: MotionRuntimeActivityItem): string {
  return [
    item.title,
    item.subtitle,
    ...(item.details ?? []).flatMap((detail) => [detail.label, detail.value]),
  ].join(" ")
}

function projectIdealInput(input: IdealInput, eventCount = input.events.length) {
  const projection = buildAgentRuntimeAssistantProjection({
    events: input.events.slice(0, eventCount),
    fallbackText: "",
    finalize: false,
    includeFallback: false,
  })
  return {
    parts: projection.parts,
    items: buildMotionRuntimeActivity({
      parts: projection.parts,
      projectPath: input.projectPath,
    }).items,
  }
}

function assistantText(parts: Array<Record<string, any>>): string {
  return parts
    .filter((part) => part.type === "text" || part.type === "text-delta")
    .map((part) => String(part.text ?? part.delta ?? ""))
    .join("")
}

function revision(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "revision-1",
    status,
    diffSummary: null,
    errorMessage: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...extra,
  } as any
}

describe("Agent Runtime Ideal Architecture executable contract", () => {
  test("HTML spec and machine-readable eval fixtures stay connected", () => {
    const html = readFileSync(specPath, "utf8")
    const manifest = readJson<IdealManifest>("manifest.json")

    expect(manifest.schemaVersion).toBe(1)
    expect(html).toContain("type AgentRuntimeSemanticEvent")
    expect(html).toContain("Summary projector")
    expect(html).toContain("Grouping rule")
    expect(html).toContain("codex-edit-run")
    expect(html).toContain("claude-approval-run")
    expect(html).toContain("claude-approval-resume-run")
    expect(html).toContain("comment-ready-dom")
    expect(html).toContain("replay-idempotency")
    expect(html).toContain("interleaved with assistant narration")
    expect(html).toContain("Ran <code>hyperframes lint .</code>")

    expect(manifest.sourceSpec).toBe("docs/specs/Agent Runtime Ideal Architecture.html")
    expect(manifest.cases.map((item) => item.id)).toEqual([
      "codex-edit-run",
      "claude-approval-run",
      "claude-approval-resume-run",
      "comment-ready-dom",
      "replay-idempotency",
    ])
    for (const item of manifest.cases) {
      expect(existsSync(join(idealFixtureDir, item.input)), item.input).toBe(true)
      expect(existsSync(join(idealFixtureDir, item.expected)), item.expected).toBe(true)
      expect(item.covers.length, item.id).toBeGreaterThan(0)
    }
  })

  test("shared runtime layer exposes a typed semantic event contract before product copy", () => {
    const summarySource = readFileSync(
      join(repoRoot, "src/shared/agent-runtime-summary.ts"),
      "utf8",
    )

    expect(summarySource).toContain("AgentRuntimeSemanticEvent")
    expect(summarySource).toContain("schemaVersion")
    expect(summarySource).toContain("copyVersion")
    expect(summarySource).toContain("evidenceRefs")
    expect(summarySource).toContain("project_activity")
    expect(summarySource).not.toContain('"project_tool"')
  })

  test("active edits collapse to the broad Editing umbrella while file evidence stays in opened details", () => {
    const input = readJson<IdealInput>("codex-edit-run.input.json")
    const expected = readJson<{
      editingOpen: {
        collapsedTitle: string
        openedDetails: string[]
        shimmerTargetsWhenOpen: string[]
        forbiddenVisibleCopy: string[]
      }
    }>("codex-edit-run.expected-projection.json")
    const editingCheckpoint = input.checkpoints?.find((item) => item.name === "editing-open")
    expect(editingCheckpoint).toBeTruthy()

    const { items } = projectIdealInput(input, editingCheckpoint!.eventCount)
    const editRow = items.find((item) => item.kind === "motion_change" && item.status === "pending")
    expect(editRow).toBeTruthy()
    expect(editRow?.title).toBe(expected.editingOpen.collapsedTitle)

    const visibleText = editRow ? visibleItemText(editRow) : ""
    expect(visibleText).toContain("app-showcase.html")
    for (const detail of expected.editingOpen.openedDetails) {
      expect(visibleText).toContain(detail)
    }
    for (const forbidden of expected.editingOpen.forbiddenVisibleCopy) {
      expect(visibleText).not.toContain(forbidden)
    }
  })

  test("open editing umbrellas shimmer both the umbrella and the active detail row", () => {
    const html = readFileSync(specPath, "utf8")
    const expected = readJson<{
      editingOpen: {
        shimmerTargetsWhenOpen: string[]
      }
    }>("codex-edit-run.expected-projection.json")
    const feedSource = readFileSync(
      join(repoRoot, "src/renderer/features/agents/ui/agent-motion-runtime-feed.tsx"),
      "utf8",
    )

    expect(expected.editingOpen.shimmerTargetsWhenOpen).toEqual([
      "collapsed umbrella title",
      "active detail row",
    ])
    expect(html).toContain(".activity-row.pending .activity-title")
    expect(html).toContain(".activity-detail.pending .activity-detail-title")
    expect(html).toContain('data-state="chatEditingOpen"')
    expect(html).toContain('{ title: "Editing", meta: "app-showcase.html", status: "pending"')
    expect(feedSource).toContain("detail.status")
    expect(feedSource).toMatch(/detail\.status[\s\S]*LiveActivityLabel|LiveActivityLabel[\s\S]*detail\.status/)
  })

  test("completed edit runs project a dominant Edited outcome and preserve final reply", () => {
    const input = readJson<IdealInput>("codex-edit-run.input.json")
    const expected = readJson<{
      done: {
        collapsedTitle: string
        finalReply: string
      }
    }>("codex-edit-run.expected-projection.json")
    const doneCheckpoint = input.checkpoints?.find((item) => item.name === "done")
    expect(doneCheckpoint).toBeTruthy()

    const { items, parts } = projectIdealInput(input, doneCheckpoint!.eventCount)
    expect(items.some((item) =>
      item.kind === "motion_change" &&
      item.status === "done" &&
      item.title === expected.done.collapsedTitle
    )).toBe(true)

    const finalReplyText = assistantText(parts)
    expect(finalReplyText).toBe(expected.done.finalReply)
  })

  test("unknown provider tools fall back to project_activity instead of project_tool", () => {
    const summary = summarizeAgentRuntimePart({
      type: "tool-mcp__asset_library__search_media",
      toolName: "mcp__asset_library__search_media",
      state: "input-available",
    })

    expect(summary.kind).toBe("project_activity")
    expect(summary.title).toBe("Working on project")
  })

  test("chat and comments share the same active Editing row", () => {
    const events: RuntimeEventLike[] = [
      {
        type: "reasoning",
        payload: { delta: "Inspect the request." },
      },
      {
        type: "tool_start",
        providerId: "edit-1",
        payload: {
          toolName: "Edit",
          input: { file_path: "/Users/example/Ripple/test-project/app-showcase.html" },
        },
      },
    ]
    const { items } = projectIdealInput({
      schemaVersion: 1,
      provider: "codex",
      surface: "chat",
      projectPath: "/Users/example/Ripple/test-project",
      events,
    })
    const chatLine = items.find((item) => item.kind === "motion_change")?.title
    const commentLine = latestAgentRuntimeActivityLine(events)

    expect(chatLine).toBe("Editing")
    expect(commentLine).toBe("Editing")
  })

  test("approval requests are blocked comment/chat states, not shimmering work", () => {
    const input = readJson<IdealInput>("claude-approval-run.input.json")
    const expected = readJson<{
      row: {
        kind: string
        title: string
        status: string
        shimmer: boolean
      }
      forbiddenVisibleCopy: string[]
    }>("claude-approval-run.expected-projection.json")
    const { parts } = projectIdealInput(input)
    const approvalPart = parts.find((part) => part.type === "data-agent-runtime" && part.data?.kind === "approval")
    const summary = approvalPart?.data?.summary

    expect(summary).toEqual(expect.objectContaining({
      kind: expected.row.kind,
      title: expected.row.title,
      status: expected.row.status,
    }))
    expect(expected.row.shimmer).toBe(false)
    const visibleText = `${summary?.title ?? ""} ${summary?.subtitle ?? ""}`
    for (const forbidden of expected.forbiddenVisibleCopy) {
      expect(visibleText).not.toContain(forbidden)
    }
    expect(approvalPart?.providerRefs).toBeTruthy()
  })

  test("resolved approvals stop blocking and resumed work can finish with the final reply", () => {
    const input = readJson<IdealInput>("claude-approval-resume-run.input.json")
    const expected = readJson<{
      approvalPending: {
        title: string
        status: string
        shimmer: boolean
      }
      resumedDone: {
        approvalStillBlocking: boolean
        collapsedTitle: string
        finalReply: string
      }
    }>("claude-approval-resume-run.expected-projection.json")
    const approvalCheckpoint = input.checkpoints?.find((item) => item.name === "approval-pending")
    const doneCheckpoint = input.checkpoints?.find((item) => item.name === "resumed-done")
    expect(approvalCheckpoint).toBeTruthy()
    expect(doneCheckpoint).toBeTruthy()

    const approvalProjection = projectIdealInput(input, approvalCheckpoint!.eventCount)
    const pendingApprovalSummary = approvalProjection.parts.find((part) =>
      part.type === "data-agent-runtime" && part.data?.kind === "approval"
    )?.data?.summary
    expect(pendingApprovalSummary).toEqual(expect.objectContaining({
      title: expected.approvalPending.title,
      status: expected.approvalPending.status,
    }))
    expect(expected.approvalPending.shimmer).toBe(false)

    const doneProjection = projectIdealInput(input, doneCheckpoint!.eventCount)
    const doneSummaries = doneProjection.parts
      .filter((part) => part.type === "data-agent-runtime")
      .map((part) => part.data?.summary)
      .filter(Boolean)
    expect(doneSummaries.some((summary) =>
      summary?.kind === "approval" && summary?.status === "blocked"
    )).toBe(expected.resumedDone.approvalStillBlocking)
    expect(doneProjection.items.some((item) =>
      item.kind === "motion_change" &&
      item.status === "done" &&
      item.title === expected.resumedDone.collapsedTitle
    )).toBe(true)
    const finalReplyText = assistantText(doneProjection.parts)
    expect(finalReplyText).toBe(expected.resumedDone.finalReply)
  })

  test("comment ready state uses the final agent message instead of generic Changes ready", () => {
    const input = readJson<{
      pendingActivity: string
      finalAssistantMessage: string
    }>("comment-ready.input.json")
    const expected = readJson<{
      pending: { statusLine: string }
      ready: {
        statusLine: string
        forbiddenFallback: string
      }
    }>("comment-ready.expected-dom.json")

    expect(revisionStatusLabel("running")).toBe(expected.pending.statusLine)
    expect(formatRevisionStatusLine(revision("proposed", {
      diffSummary: JSON.stringify({
        fileCount: 1,
        additions: 16,
        deletions: 9,
        files: ["app-showcase.html"],
        summary: input.finalAssistantMessage,
      }),
    }))).toBe(expected.ready.statusLine)
    expect(formatRevisionStatusLine(revision("proposed", { diffSummary: null })))
      .not.toBe(expected.ready.forbiddenFallback)
  })

  test("replay projection is deterministic and uses persisted provider refs as the source of truth", () => {
    const input = readJson<IdealInput>("replay-idempotency.input.json")
    const expected = readJson<{
      sameProjectedRows: boolean
      sameFinalReply: boolean
      requiredStableFields: string[]
    }>("replay-idempotency.expected.json")

    const first = projectIdealInput(input)
    const replayed = projectIdealInput(input)
    const signature = (item: MotionRuntimeActivityItem) => [
      item.id,
      item.kind,
      item.status,
      item.title,
      item.subtitle,
    ].join("|")
    const firstRows = first.items.map(signature)
    const replayedRows = replayed.items.map(signature)
    const firstReply = assistantText(first.parts)
    const replayedReply = assistantText(replayed.parts)

    if (expected.sameProjectedRows) expect(replayedRows).toEqual(firstRows)
    if (expected.sameFinalReply) expect(replayedReply).toBe(firstReply)

    const runtimeParts = first.parts.filter((part) =>
      part.type === "data-agent-runtime" ||
      (typeof part.type === "string" && part.type.startsWith("tool-"))
    )
    expect(runtimeParts.length).toBeGreaterThan(0)
    for (const part of runtimeParts) {
      for (const field of expected.requiredStableFields) {
        if (field === "providerRefs") {
          expect(part.providerRefs, JSON.stringify(part)).toBeTruthy()
        } else if (field === "kind") {
          expect(part.data?.summary?.kind ?? part.type, JSON.stringify(part)).toBeTruthy()
        } else if (field === "status") {
          expect(part.data?.summary?.status ?? part.state, JSON.stringify(part)).toBeTruthy()
        } else if (field === "title") {
          expect(part.data?.summary?.title ?? part.toolName, JSON.stringify(part)).toBeTruthy()
        } else if (field === "id") {
          expect(part.id ?? part.toolCallId, JSON.stringify(part)).toBeTruthy()
        } else {
          expect(part[field], JSON.stringify(part)).toBeTruthy()
        }
      }
    }
  })
})
