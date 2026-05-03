import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { buildCodexAppServerEnv } from "./codex-app-server-env"
import { buildCodexTurnInput } from "./codex-app-server-input"
import {
  buildCodexSkillInputs,
  normalizeCodexSkillEntries,
} from "./codex-app-server-skills"
import {
  getCodexAppServerErrorMessage,
  isCodexAppServerThreadNotFoundError,
  normalizeCodexAppServerNotification,
} from "./codex-app-server-events"
import { normalizeCodexModelSelection } from "./codex-model-selection"

describe("Codex App Server notification normalization", () => {
  test("maps command execution item lifecycle into tool events", () => {
    const started = normalizeCodexAppServerNotification({
      method: "item/started",
      params: {
        item: {
          type: "commandExecution",
          id: "cmd-1",
          command: "bun test",
          cwd: "/tmp/project",
          status: "inProgress",
        },
      },
    })
    const output = normalizeCodexAppServerNotification({
      method: "item/commandExecution/outputDelta",
      params: { itemId: "cmd-1", delta: "ok\n" },
    })
    const completed = normalizeCodexAppServerNotification({
      method: "item/completed",
      params: {
        item: {
          type: "commandExecution",
          id: "cmd-1",
          command: "bun test",
          cwd: "/tmp/project",
          status: "completed",
          aggregatedOutput: "ok\n",
          exitCode: 0,
          durationMs: 42,
        },
      },
    })

    expect(started).toEqual([
      expect.objectContaining({
        type: "tool_start",
        providerId: "cmd-1",
        payload: expect.objectContaining({
          toolName: "Bash",
          command: "bun test",
          cwd: "/tmp/project",
          status: "inProgress",
        }),
      }),
    ])
    expect(output).toEqual([
      expect.objectContaining({
        type: "tool_update",
        providerId: "cmd-1",
        payload: { delta: "ok\n" },
      }),
    ])
    expect(completed).toEqual([
      expect.objectContaining({
        type: "tool_end",
        providerId: "cmd-1",
        payload: expect.objectContaining({
          toolName: "Bash",
          status: "completed",
          output: "ok\n",
          exitCode: 0,
        }),
      }),
    ])
  })

  test("maps MCP tool progress and completion into provider-neutral tool events", () => {
    const progress = normalizeCodexAppServerNotification({
      method: "item/mcpToolCall/progress",
      params: { itemId: "mcp-1", message: "Searching" },
    })
    const completed = normalizeCodexAppServerNotification({
      method: "item/completed",
      params: {
        item: {
          type: "mcpToolCall",
          id: "mcp-1",
          server: "notion",
          tool: "search",
          status: "completed",
          arguments: { query: "Ripple" },
          result: { content: [{ type: "text", text: "Found" }] },
          error: null,
          durationMs: 10,
        },
      },
    })

    expect(progress).toEqual([
      expect.objectContaining({
        type: "tool_update",
        providerId: "mcp-1",
        payload: { message: "Searching" },
      }),
    ])
    expect(completed).toEqual([
      expect.objectContaining({
        type: "tool_end",
        providerId: "mcp-1",
        payload: expect.objectContaining({
          toolName: "notion/search",
          server: "notion",
          tool: "search",
          status: "completed",
        }),
      }),
    ])
  })

  test("maps assistant, reasoning, and diff notifications", () => {
    expect(normalizeCodexAppServerNotification({
      method: "item/agentMessage/delta",
      params: { itemId: "msg-1", delta: "Hi" },
    })).toEqual([
      expect.objectContaining({
        type: "assistant_text_delta",
        providerId: "msg-1",
        payload: { delta: "Hi" },
      }),
    ])

    expect(normalizeCodexAppServerNotification({
      method: "item/completed",
      params: { item: { type: "agentMessage", id: "msg-1", text: "Done" } },
    })).toEqual([
      expect.objectContaining({
        type: "assistant_message",
        providerId: "msg-1",
        payload: { text: "Done" },
      }),
    ])

    expect(normalizeCodexAppServerNotification({
      method: "item/reasoning/summaryTextDelta",
      params: { itemId: "reason-1", delta: "Thinking" },
    })).toEqual([
      expect.objectContaining({
        type: "reasoning",
        providerId: "reason-1",
        payload: { delta: "Thinking" },
      }),
    ])

    expect(normalizeCodexAppServerNotification({
      method: "turn/diff/updated",
      params: { turnId: "turn-1", diff: "diff --git a/a b/a" },
    })).toEqual([
      expect.objectContaining({
        type: "file_change",
        providerId: "turn-1",
        payload: { diff: "diff --git a/a b/a" },
      }),
    ])
  })

  test("maps app-server usage, session, and compaction notifications", () => {
    expect(normalizeCodexAppServerNotification({
      method: "sessionConfigured",
      params: {
        sessionId: "thread-1",
        model: "gpt-5.3-codex",
        reasoningEffort: "high",
        rolloutPath: "/tmp/rollout.jsonl",
        tools: ["Bash"],
        mcpServers: [{ name: "linear", status: "connected" }],
        plugins: ["Browser Use"],
        skills: ["oracle"],
      },
    })).toEqual([
      expect.objectContaining({
        type: "status",
        providerType: "sessionConfigured",
        providerId: "thread-1",
        payload: expect.objectContaining({
          label: "Codex session ready",
          sessionInit: expect.objectContaining({
            tools: ["Bash"],
            mcpServers: [{ name: "linear", status: "connected" }],
            plugins: ["Browser Use"],
            skills: ["oracle"],
            model: "gpt-5.3-codex",
            reasoningEffort: "high",
          }),
        }),
      }),
    ])

    expect(normalizeCodexAppServerNotification({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        tokenUsage: {
          total: {
            inputTokens: 10,
            cachedInputTokens: 2,
            outputTokens: 5,
            reasoningOutputTokens: 3,
            totalTokens: 18,
          },
          last: {
            inputTokens: 10,
            cachedInputTokens: 2,
            outputTokens: 5,
            reasoningOutputTokens: 3,
            totalTokens: 18,
          },
          modelContextWindow: 200000,
        },
      },
    })).toEqual([
      expect.objectContaining({
        type: "usage",
        providerType: "thread/tokenUsage/updated",
        providerId: "turn-1",
        payload: expect.objectContaining({
          modelContextWindow: 200000,
        }),
      }),
    ])

    expect(normalizeCodexAppServerNotification({
      method: "thread/compacted",
      params: { threadId: "thread-1", turnId: "turn-1" },
    })).toEqual([
      expect.objectContaining({
        type: "status",
        providerType: "thread/compacted",
        providerId: "turn-1",
        payload: expect.objectContaining({ label: "Compacted context" }),
      }),
    ])
  })

  test("extracts provider error details from app-server error notifications", () => {
    expect(getCodexAppServerErrorMessage({
      method: "error",
      params: {
        error: {
          message: JSON.stringify({
            detail: "The selected Codex model is not supported.",
          }),
        },
      },
    })).toBe("The selected Codex model is not supported.")

    expect(getCodexAppServerErrorMessage({
      method: "error",
      params: { error: { message: "Plain failure" } },
    })).toBe("Plain failure")
  })

  test("detects stale app-server thread ids from JSON-RPC errors", () => {
    expect(isCodexAppServerThreadNotFoundError(
      JSON.stringify({ code: -32600, message: "thread not found: thread-1" }),
    )).toBe(true)
    expect(isCodexAppServerThreadNotFoundError(
      JSON.stringify({ detail: "Thread not found after restart." }),
    )).toBe(true)
    expect(isCodexAppServerThreadNotFoundError("model not supported")).toBe(false)
  })
})

describe("Codex App Server input", () => {
  test("starts clean Codex threads with app policy, initialized, and native skills/list discovery", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/codex-app-server-adapter.ts",
      "utf8",
    )

    expect(source).toContain('this.notify("initialized")')
    expect(source).toContain("experimentalApi: true")
    expect(source).toContain("let threadId: string | null = null")
    expect(source).toContain("ephemeral: true")
    expect(source).toContain('sessionStartSource: "clear"')
    expect(source).toContain("persistExtendedHistory: false")
    expect(source).toContain('"skills/list"')
    expect(source).toContain("baseInstructions: projectNoteFallback")
    expect(source).toContain("developerInstructions: runContext.appPolicy")
    expect(source).toContain("buildCodexSkillInputs")
  })

  test("passes supported image attachments and typed skills as native inputs", () => {
    expect(buildCodexTurnInput("Use these.", {
      promptSuffix: "",
      imageContentBlocks: [],
      documentContentBlocks: [],
      savedAttachments: [
        {
          type: "image",
          originalName: "frame.png",
          fileName: "frame.png",
          path: "/tmp/project/.ripple/agent-attachments/run/frame.png",
          displayPath: ".ripple/agent-attachments/run/frame.png",
          mediaType: "image/png",
        },
        {
          type: "file",
          originalName: "brief.pdf",
          fileName: "brief.pdf",
          path: "/tmp/project/.ripple/agent-attachments/run/brief.pdf",
          displayPath: ".ripple/agent-attachments/run/brief.pdf",
          mediaType: "application/pdf",
        },
      ],
    }, [{ type: "skill", name: "hyperframes", path: "/tmp/project/.agents/skills/hyperframes" }])).toEqual([
      {
        type: "skill",
        name: "hyperframes",
        path: "/tmp/project/.agents/skills/hyperframes",
      },
      {
        type: "localImage",
        path: "/tmp/project/.ripple/agent-attachments/run/frame.png",
      },
      {
        type: "text",
        text: "Use these.",
        text_elements: [],
      },
    ])
  })

  test("normalizes enabled skills/list entries for typed skill mentions", () => {
    const skills = normalizeCodexSkillEntries({
      data: [
        {
          cwd: "/tmp/project",
          skills: [
            {
              name: "hyperframes",
              description: "Author HyperFrames compositions",
              path: "/tmp/project/.agents/skills/hyperframes",
              enabled: true,
            },
            {
              name: "disabled",
              description: "",
              path: "/tmp/project/.agents/skills/disabled",
              enabled: false,
            },
          ],
          errors: [],
        },
      ],
    })

    expect(buildCodexSkillInputs(["hyperframes", "disabled", "missing"], skills)).toEqual([
      {
        type: "skill",
        name: "hyperframes",
        path: "/tmp/project/.agents/skills/hyperframes",
      },
    ])
  })
})

describe("Codex App Server model selection", () => {
  test("splits UI model/thinking selections into app-server model and effort", () => {
    expect(normalizeCodexModelSelection("gpt-5.3-codex/high")).toEqual({
      model: "gpt-5.3-codex",
      effort: "high",
    })
    expect(normalizeCodexModelSelection("gpt-5.2-codex/xhigh")).toEqual({
      model: "gpt-5.2-codex",
      effort: "xhigh",
    })
  })

  test("leaves provider-native model strings unchanged", () => {
    expect(normalizeCodexModelSelection("gpt-5.3-codex")).toEqual({
      model: "gpt-5.3-codex",
      effort: null,
    })
    expect(normalizeCodexModelSelection("custom/provider/model")).toEqual({
      model: "custom/provider/model",
      effort: null,
    })
    expect(normalizeCodexModelSelection(null)).toEqual({
      model: null,
      effort: null,
    })
  })
})

describe("Codex App Server environment", () => {
  test("passes app-managed Codex API keys to the app-server process", () => {
    const env = buildCodexAppServerEnv("  sk-test-ripple  ")

    expect(env.CODEX_APP_SERVER_CLIENT).toBe("ripple-desktop/phase-13")
    expect(env.CODEX_API_KEY).toBe("sk-test-ripple")
    expect(env.OPENAI_API_KEY).toBe("sk-test-ripple")
  })
})
