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

mock.module("../../../components/chat-markdown-renderer", () => ({
  ChatMarkdownRenderer: ({ content }: { content: string }) =>
    React.createElement("span", null, content),
}))

const { AgentMotionRuntimeFeed } = await import("./agent-motion-runtime-feed")
const { AgentThinkingTool } = await import("./agent-thinking-tool")

function codexEventsFromMessages(messages: JsonRpcMessage[]): RuntimeEventLike[] {
  return messages.flatMap((message, messageIndex) =>
    normalizeCodexAppServerNotification(message).map((event, eventIndex) => ({
      ...event,
      id: `codex-render-event-${messageIndex}-${eventIndex}`,
      agentRunId: "run-codex-render",
      sequence: messageIndex * 10 + eventIndex + 1,
      createdAt: `2026-05-21T12:00:${String(messageIndex).padStart(2, "0")}.000Z`,
      provider: "codex",
      payload: {
        ...(event.payload ?? {}),
        providerRefs: event.refs,
      },
    }))
  )
}

function renderFeed(input: {
  parts: Record<string, any>[]
  projectPath?: string
  isLive?: boolean
}): string {
  return renderToStaticMarkup(React.createElement(AgentMotionRuntimeFeed, {
    parts: input.parts,
    projectPath: input.projectPath,
    isLive: input.isLive,
  }))
}

function shimmerCount(markup: string): number {
  return markup.match(/data-text-shimmer="true"/g)?.length ?? 0
}

function expectNoRuntimeLeak(markup: string): void {
  expect(markup).not.toContain("Bash")
  expect(markup).not.toContain("Edit")
  expect(markup).not.toContain("commandExecution")
  expect(markup).not.toContain("fileChange")
  expect(markup).not.toContain("tool-")
}

describe("AgentMotionRuntimeFeed rendered replay", () => {
  test("renders Codex app-server events as motion-editor activity rows", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "Done.",
      events: codexEventsFromMessages([
        {
          method: "turn/started",
          params: { turn: { id: "turn-1" } },
        },
        {
          method: "item/reasoning/summaryTextDelta",
          params: {
            itemId: "reason-1",
            turnId: "turn-1",
            summaryIndex: 0,
            delta: "Planning the title animation",
          },
        },
        {
          method: "item/started",
          params: {
            turnId: "turn-1",
            item: {
              type: "commandExecution",
              id: "read-1",
              command: "sed -n '1,80p' intro.html",
              status: "inProgress",
            },
          },
        },
        {
          method: "item/completed",
          params: {
            turnId: "turn-1",
            item: {
              type: "commandExecution",
              id: "read-1",
              command: "sed -n '1,80p' intro.html",
              status: "completed",
              aggregatedOutput: "<h1>Ripple</h1>",
              exitCode: 0,
            },
          },
        },
        {
          method: "item/completed",
          params: {
            turnId: "turn-1",
            item: {
              type: "fileChange",
              id: "edit-1",
              status: "completed",
              changes: [{
                path: "intro.html",
                kind: { type: "update" },
                diff: "-top: 295px;\n+top: 215px;",
              }],
            },
          },
        },
      ]),
    })

    const markup = renderFeed({ parts: projection.parts })

    expect(markup).not.toContain("Thinking")
    expect(markup).not.toContain("Planning the title animation")
    expect(markup).toContain("Explored 1 file")
    expect(markup).toContain("Updated composition")
    expect(shimmerCount(markup)).toBe(0)
    expectNoRuntimeLeak(markup)
  })

  test("renders Claude SDK events with the same visible activity grammar", () => {
    const projection = buildAgentRuntimeAssistantProjection({
      fallbackText: "Done.",
      events: [
        {
          id: "claude-thinking-delta",
          agentRunId: "run-claude-render",
          sequence: 1,
          provider: "claude",
          type: "reasoning",
          providerType: "content_block_delta",
          providerId: "thinking-1",
          payload: {
            delta: "**Checking frame balance** I need to inspect the title card before editing.",
          },
        },
        {
          id: "claude-read-start",
          agentRunId: "run-claude-render",
          sequence: 2,
          provider: "claude",
          type: "tool_start",
          providerType: "assistant:tool_use",
          providerId: "read-1",
          payload: {
            toolCallId: "read-1",
            toolName: "Read",
            input: { file_path: "intro.html" },
          },
        },
        {
          id: "claude-read-end",
          agentRunId: "run-claude-render",
          sequence: 3,
          provider: "claude",
          type: "tool_end",
          providerType: "user:tool_result",
          providerId: "read-1",
          payload: {
            toolCallId: "read-1",
            toolName: "Read",
            status: "completed",
            output: "<h1>Ripple</h1>",
          },
        },
        {
          id: "claude-edit-end",
          agentRunId: "run-claude-render",
          sequence: 4,
          provider: "claude",
          type: "tool_end",
          providerType: "user:tool_result",
          providerId: "edit-1",
          payload: {
            toolCallId: "edit-1",
            toolName: "Edit",
            status: "completed",
            output: "File updated.",
          },
        },
      ],
    })

    const markup = renderFeed({ parts: projection.parts })

    expect(markup).not.toContain("Thinking")
    expect(markup).not.toContain("Checking frame balance")
    expect(markup).toContain("Explored 1 file")
    expect(markup).toContain("Updated composition")
    expect(shimmerCount(markup)).toBe(0)
    expectNoRuntimeLeak(markup)
  })

  test("keeps completed live rows visible while only the active row shimmers", () => {
    const markup = renderFeed({
      isLive: true,
      parts: [
        {
          type: "reasoning",
          text: "Checking the composition before editing.",
          state: "output-available",
        },
        {
          type: "tool-Read",
          toolCallId: "read-1",
          input: { file_path: "intro.html" },
          output: "<h1>Ripple</h1>",
          state: "output-available",
        },
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: {
            file_path: "intro.html",
            old_string: "top: 295px;",
            new_string: "top: 215px;",
          },
          state: "input-available",
        },
      ],
    })

    expect(markup).not.toContain("Thinking")
    expect(markup).not.toContain("Checking the composition before editing.")
    expect(markup).toContain("Explored 1 file")
    expect(markup).toContain("Updating composition")
    expect(shimmerCount(markup)).toBe(1)
    expectNoRuntimeLeak(markup)
  })

  test("does not replace completed edit progress with a later live thinking row", () => {
    const markup = renderFeed({
      isLive: true,
      parts: [
        {
          type: "tool-Edit",
          toolCallId: "edit-1",
          input: {
            file_path: "index.html",
            old_string: "left: 720px;",
            new_string: "left: 920px;",
          },
          output: { status: "completed" },
          state: "output-available",
        },
        {
          type: "tool-Bash",
          toolCallId: "check-1",
          input: { command: "hyperframes validate ." },
          output: { exitCode: 0, stdout: "passed" },
          state: "output-available",
        },
        {
          type: "reasoning",
          text: "Checking the result before the final frame capture.",
          state: "streaming",
        },
      ],
    })

    expect(markup).toContain("Updated composition")
    expect(markup).toContain("Checked project")
    expect(markup).toContain("Thinking")
    expect(shimmerCount(markup)).toBe(1)
    expectNoRuntimeLeak(markup)
  })

  test("keeps a completed read visible without animating stale activity", () => {
    const markup = renderFeed({
      isLive: true,
      parts: [
        {
          type: "tool-Read",
          toolCallId: "read-1",
          input: { file_path: "index.html" },
          output: "<html></html>",
          state: "output-available",
        },
      ],
    })

    expect(markup).toContain("Explored 1 file")
    expect(markup).not.toContain("Read index.html")
    expect(shimmerCount(markup)).toBe(0)
    expectNoRuntimeLeak(markup)
  })

  test("shimmers live status-only thinking rows", () => {
    const markup = renderFeed({
      isLive: true,
      parts: [
        {
          type: "data-agent-runtime",
          id: "thinking-status",
          data: {
            kind: "status",
            label: "Thinking",
            payload: { kind: "thinking", label: "Thinking" },
          },
        },
      ],
    })

    expect(markup).toContain("Thinking")
    expect(shimmerCount(markup)).toBe(1)
  })

  test("uses the same fixed line box for provisional and runtime activity rows", () => {
    const provisionalThinking = renderToStaticMarkup(React.createElement(AgentThinkingTool, {
      part: {
        type: "tool-Thinking",
        state: "input-streaming",
        input: { text: "" },
      },
      chatStatus: "streaming",
    }))
    const runtimeThinking = renderFeed({
      isLive: true,
      parts: [
        {
          type: "data-agent-runtime",
          id: "thinking-status",
          data: {
            kind: "status",
            label: "Thinking",
            payload: { kind: "thinking", label: "Thinking" },
          },
        },
      ],
    })
    const collapsibleActivity = renderFeed({
      isLive: true,
      parts: [
        {
          type: "tool-Read",
          toolCallId: "read-1",
          input: { file_path: "index.html" },
          state: "input-available",
        },
      ],
    })

    expect(provisionalThinking).toContain("group flex h-5 cursor-pointer items-center")
    expect(runtimeThinking).toContain("flex h-5 items-center px-2 text-xs leading-5")
    expect(collapsibleActivity).toContain("group flex h-5 cursor-pointer items-center")
    expect(collapsibleActivity).toContain("mt-px h-3 w-3")
    expect(provisionalThinking).not.toContain("py-0.5")
    expect(collapsibleActivity).not.toContain("py-0.5")
  })

  test("renders visual artifacts from native visual tool output", () => {
    const markup = renderFeed({
      projectPath: "/Users/me/project",
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
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
                data: "iVBORw0KGgo=",
              },
            ],
          },
          state: "output-available",
        },
      ],
    })

    expect(markup).toContain("Checked current frame")
    expect(markup).toContain("Ripple current frame")
    expect(markup).toContain("data:image/png;base64,iVBORw0KGgo=")
  })

  test("reserves a stable current-frame card while a visual check is pending", () => {
    const markup = renderFeed({
      isLive: true,
      projectPath: "/Users/me/project",
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          input: {},
          state: "input-available",
        },
      ],
    })

    expect(markup).toContain("Checking current frame")
    expect(markup).toContain("data-agent-motion-visual-preview")
    expect(markup).toContain("Current frame")
    expect(shimmerCount(markup)).toBe(1)
  })

  test("keeps the current-frame card reserved while a file image is loading", () => {
    const markup = renderFeed({
      isLive: true,
      projectPath: "/Users/me/project",
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  artifactPath: ".ripple/visual-context/snapshots/snap-1/current.png",
                }),
              },
            ],
          },
          state: "output-available",
        },
      ],
    })

    expect(markup).toContain("Checked current frame")
    expect(markup).toContain("data-agent-motion-visual-preview")
    expect(markup).toContain("Current frame")
    expect(markup).not.toContain("<img")
    expect(shimmerCount(markup)).toBe(0)
  })

  test("keeps the current-frame card reserved when a native visual has no readable artifact", () => {
    const markup = renderFeed({
      isLive: true,
      projectPath: "/Users/me/project",
      parts: [
        {
          type: "tool-mcp__ripple_visual_context__ripple_snapshot",
          toolCallId: "snap-1",
          toolName: "mcp__ripple_visual_context__ripple_snapshot",
          output: "Ripple visual context is attached as a native image.",
          state: "output-available",
        },
      ],
    })

    expect(markup).toContain("Checked current frame")
    expect(markup).toContain("data-agent-motion-visual-preview")
    expect(markup).toContain("Current frame")
    expect(markup).not.toContain("<img")
    expect(shimmerCount(markup)).toBe(0)
  })
})
