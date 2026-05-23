import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, mock, test } from "bun:test"
import {
  buildAgentRuntimeAssistantProjection,
  type RuntimeEventLike,
} from "../../../../shared/agent-runtime-ui-projection"
import {
  normalizeCodexAppServerNotification,
  type JsonRpcMessage,
} from "../../../../main/lib/agent-runtime/providers/codex-app-server-events"
import {
  buildMotionRuntimeActivity,
  buildMotionRuntimeTimeline,
  shouldHideMotionRuntimeInterimPart,
  shouldShowMotionRuntimeThinkingFallback,
  type MotionRuntimeActivityItem,
} from "./motion-runtime-activity"
import { shouldHideResolvedProjectLocalApproval } from "./agent-runtime-approval-copy"

mock.module("../../../lib/trpc", () => ({
  trpc: {
    files: {
      readBinaryFile: {
        useQuery: () => ({ data: undefined }),
      },
    },
  },
}))

mock.module("../../../components/ui/text-shimmer", () => ({
  TextShimmer: ({
    as: Component = "span",
    children,
    className,
  }: {
    as?: React.ElementType
    children: React.ReactNode
    className?: string
  }) => React.createElement(
    Component,
    {
      "data-text-shimmer": "true",
      className,
    },
    children,
  ),
}))

const { AgentMotionRuntimeFeed } = await import("./agent-motion-runtime-feed")

const ONE_BY_ONE_PNG = "iVBORw0KGgo="
const PROJECT_PATH = "/Users/motion/Ripple Projects/Launch Promo"

type ReplayCheckpoint = {
  name: string
  eventCount: number
  live: boolean
  expectedRows: Array<[MotionRuntimeActivityItem["kind"], string, MotionRuntimeActivityItem["status"]]>
  expectedMarkup?: string[]
  forbiddenMarkup?: string[]
  shimmerCount: number
}

type ReplaySession = {
  name: string
  events: RuntimeEventLike[]
  checkpoints: ReplayCheckpoint[]
}

type RealReplayRow = {
  kind: MotionRuntimeActivityItem["kind"] | "reply"
  status: MotionRuntimeActivityItem["status"]
  title: string
  visual?: "snapshot" | "frame_sheet"
}

type RealReplayFixture = {
  schemaVersion: 1
  source: {
    provider: string
    model: string | null
    runKind?: string
    status: string
    originalEventCount: number
    selectedEventCount: number
    note: string
  }
  projectPath: string
  events: RuntimeEventLike[]
  checkpoints: Array<{
    name: string
    eventCount: number
    live: boolean
    expectedRows: RealReplayRow[]
    shimmerCount: number
  }>
}

function runtimeEvent(
  input: Omit<RuntimeEventLike, "id" | "sequence" | "createdAt" | "agentRunId"> & {
    id: string
    sequence: number
    agentRunId?: string
  },
): RuntimeEventLike {
  return {
    ...input,
    agentRunId: input.agentRunId ?? "run-replay",
    createdAt: `2026-05-21T18:00:${String(input.sequence).padStart(2, "0")}.000Z`,
  }
}

function codexEventsFromMessages(messages: JsonRpcMessage[]): RuntimeEventLike[] {
  return messages.flatMap((message, messageIndex) =>
    normalizeCodexAppServerNotification(message).map((event, eventIndex) => ({
      ...event,
      id: `codex-replay-${messageIndex}-${eventIndex}`,
      agentRunId: "run-codex-replay",
      sequence: messageIndex * 10 + eventIndex + 1,
      createdAt: `2026-05-21T18:00:${String(messageIndex).padStart(2, "0")}.000Z`,
      provider: "codex",
      payload: {
        ...(event.payload ?? {}),
        providerRefs: event.refs,
      },
    }))
  )
}

function projectSessionAt(
  session: ReplaySession,
  checkpoint: ReplayCheckpoint,
): Record<string, any>[] {
  return buildAgentRuntimeAssistantProjection({
    events: session.events.slice(0, checkpoint.eventCount),
    fallbackText: "",
    finalize: !checkpoint.live,
    includeFallback: false,
  }).parts
}

function assistantRuntimeState(input: {
  parts: Record<string, any>[]
  live: boolean
  includeReplies?: boolean
}): {
  markup: string
  rows: Array<MotionRuntimeActivityItem | RealReplayRow>
} {
  const timeline = buildMotionRuntimeTimeline({
    parts: input.parts,
    projectPath: PROJECT_PATH,
  })
  const lastRuntimeEntry = [...timeline].reverse().find((entry) => entry.kind === "runtime")
  const shouldShowFallback = shouldShowMotionRuntimeThinkingFallback({
    timeline,
    projectPath: PROJECT_PATH,
    sandboxSetupStatus: "ready",
    isStreaming: input.live,
    isLastMessage: true,
  })
  const rows: Array<MotionRuntimeActivityItem | RealReplayRow> = []
  const children = timeline.map((entry, index) => {
    if (entry.kind === "runtime") {
      const runtimeRows = buildMotionRuntimeActivity({
        parts: entry.parts,
        events: entry.events,
        projectPath: PROJECT_PATH,
      }).items
      rows.push(...runtimeRows)
      return React.createElement(AgentMotionRuntimeFeed, {
        key: entry.key,
        parts: entry.parts,
        events: entry.events,
        projectPath: PROJECT_PATH,
        isLive: input.live && entry.key === lastRuntimeEntry?.key && !shouldShowFallback,
      })
    }
    if (shouldHideMotionRuntimeInterimPart({ entry, timeline, index })) {
      return null
    }
    if (entry.part.type === "data-agent-runtime" && entry.part.data?.kind === "approval") {
      const payload = entry.part.data?.payload && typeof entry.part.data.payload === "object"
        ? entry.part.data.payload as Record<string, any>
        : {}
      if (shouldHideResolvedProjectLocalApproval(payload)) return null
    }
    if (entry.part.type === "text" && entry.part.text?.trim()) {
      if (input.includeReplies) {
        rows.push({
          kind: "reply",
          status: entry.part.state === "streaming" ? "pending" : "done",
          title: "Agent reply",
        })
      }
      return React.createElement(
        "p",
        {
          key: entry.key,
          "data-agent-reply": "true",
        },
        entry.part.text,
      )
    }
    return null
  })

  if (shouldShowFallback) {
    const fallbackParts = [{
      type: "data-agent-runtime",
      id: "replay-thinking-fallback",
      state: "streaming",
      data: {
        kind: "status",
        label: "Thinking",
      },
    }]
    rows.push(...buildMotionRuntimeActivity({ parts: fallbackParts, projectPath: PROJECT_PATH }).items)
    children.push(React.createElement(AgentMotionRuntimeFeed, {
      key: "replay-thinking-fallback",
      parts: fallbackParts,
      projectPath: PROJECT_PATH,
      isLive: true,
    }))
  }

  return {
    rows,
    markup: renderToStaticMarkup(React.createElement(React.Fragment, null, ...children)),
  }
}

function shimmerCount(markup: string): number {
  return markup.match(/data-text-shimmer="true"/g)?.length ?? 0
}

function expectNoVisibleRuntimeLeak(markup: string): void {
  expect(markup).not.toMatch(/\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__)\b/)
  expect(markup).not.toMatch(/\b(?:sed -n|git diff|bun run|npm run|\/Users\/|\/private\/tmp\/)\b/)
}

function expectReplayCheckpoint(session: ReplaySession, checkpoint: ReplayCheckpoint): void {
  const parts = projectSessionAt(session, checkpoint)
  const { rows, markup } = assistantRuntimeState({ parts, live: checkpoint.live })
  const rowTriples = rows.map((row) => [row.kind, row.title, row.status])
  const pendingRows = rows.filter((row) => row.status === "pending")

  expect(rowTriples, `${session.name}: ${checkpoint.name}`).toEqual(checkpoint.expectedRows)
  expect(pendingRows.length, `${session.name}: ${checkpoint.name}`).toBeLessThanOrEqual(1)
  expect(shimmerCount(markup), `${session.name}: ${checkpoint.name}`).toBe(checkpoint.shimmerCount)
  expectNoVisibleRuntimeLeak(markup)

  if (pendingRows.some((row) => row.kind === "motion_change")) {
    expect(
      pendingRows.some((row) => row.kind === "thinking"),
      `${session.name}: ${checkpoint.name}`,
    ).toBe(false)
  }

  for (const expected of checkpoint.expectedMarkup ?? []) {
    expect(markup, `${session.name}: ${checkpoint.name}`).toContain(expected)
  }
  for (const forbidden of checkpoint.forbiddenMarkup ?? []) {
    expect(markup, `${session.name}: ${checkpoint.name}`).not.toContain(forbidden)
  }
}

function expectRealFixtureCheckpoint(
  fixture: RealReplayFixture,
  checkpoint: RealReplayFixture["checkpoints"][number],
): void {
  const projection = buildAgentRuntimeAssistantProjection({
    events: fixture.events.slice(0, checkpoint.eventCount),
    fallbackText: "",
    finalize: !checkpoint.live,
    includeFallback: false,
  })
  const { rows, markup } = assistantRuntimeState({
    parts: projection.parts,
    live: checkpoint.live,
    includeReplies: true,
  })
  const visibleRows = rows.map((row) => {
    const visual = "visual" in row ? row.visual : undefined
    return {
      kind: row.kind,
      status: row.status,
      title: row.title,
      ...(visual
        ? { visual: typeof visual === "string" ? visual : visual.kind }
        : {}),
    }
  })
  const pendingRows = rows.filter((row) => row.status === "pending")

  expect(visibleRows, `${fixture.source.provider}: ${checkpoint.name}`).toEqual(checkpoint.expectedRows)
  expect(pendingRows.length, `${fixture.source.provider}: ${checkpoint.name}`).toBeLessThanOrEqual(1)
  expect(shimmerCount(markup), `${fixture.source.provider}: ${checkpoint.name}`).toBe(checkpoint.shimmerCount)
  expectNoVisibleRuntimeLeak(markup)
}

const codexTitleEditSession: ReplaySession = {
  name: "Codex app-server title edit replay",
  events: codexEventsFromMessages([
    {
      method: "turn/started",
      params: { turn: { id: "turn-codex" } },
    },
    {
      method: "sessionConfigured",
      params: {
        sessionId: "session-codex",
        model: "gpt-5.1-codex",
        tools: ["Bash", "Edit", "mcp__ripple_visual_context__ripple_snapshot"],
      },
    },
    {
      method: "item/reasoning/summaryTextDelta",
      params: {
        turnId: "turn-codex",
        itemId: "reason-codex",
        summaryIndex: 0,
        delta: "Planning the title animation",
      },
    },
    {
      method: "item/reasoning/textDelta",
      params: {
        turnId: "turn-codex",
        itemId: "reason-codex",
        contentIndex: 0,
        delta: "I will inspect the title card, check the current frame, then adjust timing.",
      },
    },
    {
      method: "item/started",
      params: {
        turnId: "turn-codex",
        item: {
          id: "read-title",
          type: "commandExecution",
          command: "sed -n '1,120p' intro.html",
          cwd: PROJECT_PATH,
          status: "inProgress",
        },
      },
    },
    {
      method: "item/completed",
      params: {
        turnId: "turn-codex",
        item: {
          id: "read-title",
          type: "commandExecution",
          command: "sed -n '1,120p' intro.html",
          cwd: PROJECT_PATH,
          status: "completed",
          aggregatedOutput: "<h1>Launch Promo</h1>",
          exitCode: 0,
        },
      },
    },
    {
      method: "item/started",
      params: {
        turnId: "turn-codex",
        item: {
          id: "snapshot-title",
          type: "mcpToolCall",
          server: "ripple_visual_context",
          tool: "ripple_snapshot",
          status: "inProgress",
          arguments: { mode: "current-frame" },
        },
      },
    },
    {
      method: "item/completed",
      params: {
        turnId: "turn-codex",
        item: {
          id: "snapshot-title",
          type: "mcpToolCall",
          server: "ripple_visual_context",
          tool: "ripple_snapshot",
          status: "completed",
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  artifactPath: ".ripple/visual-context/snapshots/snapshot-title/current.png",
                }),
              },
              {
                type: "image",
                mimeType: "image/png",
                data: ONE_BY_ONE_PNG,
              },
            ],
          },
        },
      },
    },
    {
      method: "item/started",
      params: {
        turnId: "turn-codex",
        item: {
          id: "edit-title",
          type: "fileChange",
          status: "inProgress",
          changes: [{
            path: "intro.html",
            kind: { type: "update" },
            diff: "-top: 295px;\n+top: 215px;",
          }],
        },
      },
    },
    {
      method: "turn/diff/updated",
      params: {
        turnId: "turn-codex",
        diff: "diff --git a/intro.html b/intro.html\n-top: 295px;\n+top: 215px;",
      },
    },
    {
      method: "item/completed",
      params: {
        turnId: "turn-codex",
        item: {
          id: "edit-title",
          type: "fileChange",
          status: "completed",
          changes: [{
            path: "intro.html",
            kind: { type: "update" },
            diff: "-top: 295px;\n+top: 215px;",
          }],
        },
      },
    },
    {
      method: "item/started",
      params: {
        turnId: "turn-codex",
        item: {
          id: "review-diff",
          type: "commandExecution",
          command: "git diff -- intro.html",
          cwd: PROJECT_PATH,
          status: "inProgress",
        },
      },
    },
    {
      method: "item/completed",
      params: {
        turnId: "turn-codex",
        item: {
          id: "review-diff",
          type: "commandExecution",
          command: "git diff -- intro.html",
          cwd: PROJECT_PATH,
          status: "completed",
          aggregatedOutput: "diff --git a/intro.html b/intro.html",
          exitCode: 0,
        },
      },
    },
    {
      method: "item/completed",
      params: {
        turnId: "turn-codex",
        item: {
          id: "message-codex",
          type: "agentMessage",
          text: "Adjusted the title timing and checked the current frame.",
        },
      },
    },
    {
      method: "turn/completed",
      params: { turn: { id: "turn-codex" }, status: "completed" },
    },
  ]),
  checkpoints: [
    {
      name: "reasoning is the only live row",
      eventCount: 6,
      live: true,
      expectedRows: [
        ["thinking", "Thinking", "pending"],
      ],
      expectedMarkup: ["Thinking"],
      forbiddenMarkup: ["Planning the title animation"],
      shimmerCount: 1,
    },
    {
      name: "project inspection replaces live thinking",
      eventCount: 9,
      live: true,
      expectedRows: [
        ["explored", "Exploring 1 file", "pending"],
      ],
      expectedMarkup: ["Exploring 1 file"],
      forbiddenMarkup: ["Planning the title animation", "sed -n", "Read project", "Read via"],
      shimmerCount: 1,
    },
    {
      name: "visual check keeps prior completed work visible",
      eventCount: 13,
      live: true,
      expectedRows: [
        ["explored", "Explored 1 file", "done"],
        ["visual_check", "Looking", "pending"],
      ],
      expectedMarkup: ["Explored 1 file", "Looking"],
      forbiddenMarkup: ["Planning the title animation"],
      shimmerCount: 1,
    },
    {
      name: "edit activity supersedes stale thinking and visual work",
      eventCount: 17,
      live: true,
      expectedRows: [
        ["explored", "Explored 1 file", "done"],
        ["visual_check", "Looked", "done"],
        ["motion_change", "Editing", "pending"],
      ],
      expectedMarkup: ["Editing"],
      forbiddenMarkup: ["Thinking"],
      shimmerCount: 1,
    },
    {
      name: "final transcript stays concise and product-facing",
      eventCount: 27,
      live: false,
      expectedRows: [
        ["explored", "Explored 1 file", "done"],
        ["visual_check", "Looked", "done"],
        ["motion_change", "Edited composition", "done"],
        ["verification", "Verified", "done"],
      ],
      expectedMarkup: [
        "Explored 1 file · Looked · Edited composition · Verified",
        "Ripple current frame",
        "Adjusted the title timing",
      ],
      shimmerCount: 0,
    },
  ],
}

const claudeCommentRevisionSession: ReplaySession = {
  name: "Claude SDK comment revision replay",
  events: [
    runtimeEvent({
      id: "claude-thinking-start",
      sequence: 1,
      provider: "claude",
      type: "activity",
      providerType: "content_block_start",
      providerId: "thinking-claude",
      payload: {
        kind: "thinking",
        label: "Agent is thinking",
      },
    }),
    runtimeEvent({
      id: "claude-thinking-delta",
      sequence: 2,
      provider: "claude",
      type: "reasoning",
      providerType: "content_block_delta",
      providerId: "thinking-claude",
      payload: {
        delta: "**Checking frame balance** I need to compare the comment frame before changing the lower third.",
      },
    }),
    runtimeEvent({
      id: "claude-read-start",
      sequence: 3,
      provider: "claude",
      type: "tool_start",
      providerType: "assistant:tool_use",
      providerId: "read-lower-third",
      payload: {
        toolCallId: "read-lower-third",
        toolName: "Read",
        input: { file_path: "lower-third.html" },
      },
    }),
    runtimeEvent({
      id: "claude-read-end",
      sequence: 4,
      provider: "claude",
      type: "tool_end",
      providerType: "user:tool_result",
      providerId: "read-lower-third",
      payload: {
        toolCallId: "read-lower-third",
        toolName: "Read",
        status: "completed",
        output: "<div class=\"lower-third\">",
      },
    }),
    runtimeEvent({
      id: "claude-sheet-start",
      sequence: 5,
      provider: "claude",
      type: "tool_start",
      providerType: "assistant:tool_use",
      providerId: "sheet-lower-third",
      payload: {
        toolCallId: "sheet-lower-third",
        toolName: "mcp__ripple_visual_context__ripple_frame_sheet",
        input: { range: "comment", samples: 4 },
      },
    }),
    runtimeEvent({
      id: "claude-sheet-end",
      sequence: 6,
      provider: "claude",
      type: "tool_end",
      providerType: "user:tool_result",
      providerId: "sheet-lower-third",
      payload: {
        toolCallId: "sheet-lower-third",
        toolName: "mcp__ripple_visual_context__ripple_frame_sheet",
        status: "completed",
        output: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                artifactPath: ".ripple/visual-context/frame-sheets/sheet-lower-third/sheet.png",
              }),
            },
            {
              type: "image",
              mimeType: "image/png",
              data: ONE_BY_ONE_PNG,
            },
          ],
        },
      },
    }),
    runtimeEvent({
      id: "claude-edit-start",
      sequence: 7,
      provider: "claude",
      type: "tool_start",
      providerType: "assistant:tool_use",
      providerId: "edit-lower-third",
      payload: {
        toolCallId: "edit-lower-third",
        toolName: "Edit",
        input: {
          file_path: "lower-third.html",
          old_string: "opacity: 0.72;",
          new_string: "opacity: 0.9;",
        },
      },
    }),
    runtimeEvent({
      id: "claude-edit-end",
      sequence: 8,
      provider: "claude",
      type: "tool_end",
      providerType: "user:tool_result",
      providerId: "edit-lower-third",
      payload: {
        toolCallId: "edit-lower-third",
        toolName: "Edit",
        status: "completed",
        output: "File updated.",
      },
    }),
    runtimeEvent({
      id: "claude-check-start",
      sequence: 9,
      provider: "claude",
      type: "tool_start",
      providerType: "assistant:tool_use",
      providerId: "check-project",
      payload: {
        toolCallId: "check-project",
        toolName: "Bash",
        command: "bun run test:agent-ui",
      },
    }),
    runtimeEvent({
      id: "claude-check-end",
      sequence: 10,
      provider: "claude",
      type: "tool_end",
      providerType: "user:tool_result",
      providerId: "check-project",
      payload: {
        toolCallId: "check-project",
        toolName: "Bash",
        status: "completed",
        output: "50 pass",
        exitCode: 0,
      },
    }),
    runtimeEvent({
      id: "claude-message",
      sequence: 11,
      provider: "claude",
      type: "assistant_message",
      providerType: "assistant",
      providerId: "message-claude",
      payload: {
        text: "Balanced the lower third against the comment frame.",
      },
    }),
    runtimeEvent({
      id: "claude-completed",
      sequence: 12,
      provider: "claude",
      type: "turn.completed",
      providerType: "result",
      providerId: "turn-claude",
      payload: {
        status: "completed",
      },
    }),
  ],
  checkpoints: [
    {
      name: "Claude thinking starts as one live row",
      eventCount: 2,
      live: true,
      expectedRows: [
        ["thinking", "Thinking", "pending"],
      ],
      expectedMarkup: ["Thinking"],
      forbiddenMarkup: ["Checking frame balance"],
      shimmerCount: 1,
    },
    {
      name: "comment frame sheet becomes the active visual row",
      eventCount: 5,
      live: true,
      expectedRows: [
        ["explored", "Explored 1 file", "done"],
        ["visual_check", "Looking", "pending"],
      ],
      expectedMarkup: ["Looking"],
      shimmerCount: 1,
    },
    {
      name: "lower-third edit is the only live row",
      eventCount: 7,
      live: true,
      expectedRows: [
        ["explored", "Explored 1 file", "done"],
        ["visual_check", "Looked", "done"],
        ["motion_change", "Editing", "pending"],
      ],
      expectedMarkup: ["Editing"],
      forbiddenMarkup: ["Thinking"],
      shimmerCount: 1,
    },
    {
      name: "project check uses product language",
      eventCount: 9,
      live: true,
      expectedRows: [
        ["explored", "Explored 1 file", "done"],
        ["visual_check", "Looked", "done"],
        ["motion_change", "Edited composition", "done"],
        ["verification", "Verifying", "pending"],
      ],
      expectedMarkup: ["Verifying"],
      forbiddenMarkup: ["bun run", "Bash"],
      shimmerCount: 1,
    },
    {
      name: "final comment revision replay is stable",
      eventCount: 12,
      live: false,
      expectedRows: [
        ["explored", "Explored 1 file", "done"],
        ["visual_check", "Looked", "done"],
        ["motion_change", "Edited composition", "done"],
        ["verification", "Verified", "done"],
      ],
      expectedMarkup: [
        "Explored 1 file · Looked · Edited composition · Verified",
        "Ripple frame sheet",
        "Balanced the lower third",
      ],
      shimmerCount: 0,
    },
  ],
}

describe("agent runtime UI replay eval", () => {
  test("keeps live assistant narration visible while later project activity streams", () => {
    const parts = [
      {
        type: "tool-mcp__ripple_visual_context__ripple_snapshot",
        toolName: "mcp__ripple_visual_context__ripple_snapshot",
        toolCallId: "snap-1",
        output: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                artifactPath: ".ripple/visual-context/snapshots/snap-1/current.png",
              }),
            },
            {
              type: "image",
              mimeType: "image/png",
              data: ONE_BY_ONE_PNG,
            },
          ],
        },
        state: "output-available",
      },
      {
        type: "text",
        id: "reply-1",
        text: "I’m seeing a centered phone mockup. I’ll shift the phone group right and then check the frame again.",
        state: "done",
      },
      {
        type: "tool-Read",
        toolCallId: "read-1",
        input: { file_path: "index.html" },
        output: "<html></html>",
        state: "output-available",
      },
      {
        type: "tool-Grep",
        toolCallId: "grep-1",
        input: { pattern: "phone", path: "index.html" },
        state: "input-available",
      },
    ]
    const { rows, markup } = assistantRuntimeState({
      parts,
      live: true,
      includeReplies: true,
    })

    expect(rows.map((row) => [row.kind, row.title, row.status])).toEqual([
      ["visual_check", "Looked", "done"],
      ["reply", "Agent reply", "done"],
      ["explored", "Exploring 1 file, 1 search", "pending"],
    ])
    expect(markup).toContain("I’m seeing a centered phone mockup")
    expect(markup).toContain("Exploring 1 file, 1 search")
    expect(shimmerCount(markup)).toBe(1)
  })

  for (const session of [codexTitleEditSession, claudeCommentRevisionSession]) {
    test(session.name, () => {
      for (const checkpoint of session.checkpoints) {
        expectReplayCheckpoint(session, checkpoint)
      }
    })
  }
})

describe("agent runtime UI real-session golden fixtures", () => {
  const fixtureDir = join(process.cwd(), "test", "fixtures", "agent-runtime-ui")
  const fixtureFiles = readdirSync(fixtureDir)
    .filter((fileName) => fileName.endsWith(".json") && fileName !== "manifest.json")
    .sort()

  for (const fileName of fixtureFiles) {
    test(fileName, () => {
      const fixture = JSON.parse(
        readFileSync(join(fixtureDir, fileName), "utf8"),
      ) as RealReplayFixture

      expect(fixture.schemaVersion).toBe(1)
      expect(fixture.events.length).toBe(fixture.source.selectedEventCount)
      expect(fixture.checkpoints.length).toBeGreaterThan(0)

      for (const checkpoint of fixture.checkpoints) {
        expectRealFixtureCheckpoint(fixture, checkpoint)
      }
    })
  }
})
