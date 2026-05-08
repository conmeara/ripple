import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import {
  buildCodexAppServerArgs,
  buildCodexAppServerEnv,
  buildCodexShellEnvironmentPolicyConfig,
} from "./codex-app-server-env"
import {
  assessCodexAppServerApprovalRequest,
  isCodexAppServerAutoApprovedVisualCommand,
} from "./codex-app-server-approval"
import { buildCodexTurnInput } from "./codex-app-server-input"
import {
  buildCodexTurnSkillInputs,
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

    expect(normalizeCodexAppServerNotification({
      method: "warning",
      params: { threadId: "thread-1", message: "Using fallback model." },
    })).toEqual([
      expect.objectContaining({
        type: "status",
        providerType: "warning",
        providerId: "thread-1",
        payload: expect.objectContaining({
          label: "Using fallback model.",
          message: "Using fallback model.",
          threadId: "thread-1",
        }),
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

describe("Codex App Server approval policy", () => {
  const workspaceRoot = "/tmp/ripple-project"

  test("prepares project-local command approvals with protocol-supported decisions", () => {
    expect(assessCodexAppServerApprovalRequest({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "bun test",
        availableDecisions: ["accept", "acceptForSession", "decline"],
      },
    })).toEqual(expect.objectContaining({
      canApprove: true,
      approvalWarning: null,
      approveResponse: { decision: "acceptForSession" },
      denyResponse: { decision: "decline", reason: "Denied by user." },
      requestedNetwork: false,
      requestedPermissionPaths: [],
    }))

    expect(assessCodexAppServerApprovalRequest({
      workspaceRoot,
      params: {
        cwd: `${workspaceRoot}/compositions`,
        command: "bun test",
        availableDecisions: ["accept", "decline"],
      },
    }).approveResponse).toEqual({ decision: "accept" })
  })

  test("asks before approving command requests for network access", () => {
    const byNetworkContext = assessCodexAppServerApprovalRequest({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "curl https://example.com",
        networkApprovalContext: {
          host: "example.com",
          protocol: "https",
        },
        availableDecisions: ["acceptForSession", "decline"],
      },
    })

    expect(byNetworkContext).toEqual(expect.objectContaining({
      canApprove: true,
      requestedNetwork: true,
      approvalWarning: "Network access is outside Ripple's project-local sandbox for this run.",
      approveResponse: {
        decision: "acceptForSession",
      },
      denyResponse: {
        decision: "decline",
        reason: "Denied by user.",
      },
    }))

    const byAdditionalPermission = assessCodexAppServerApprovalRequest({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "npm view hyperframes",
        additionalPermissions: {
          network: { enabled: true },
          fileSystem: null,
        },
      },
    })

    expect(byAdditionalPermission.canApprove).toBe(true)
    expect(byAdditionalPermission.approveResponse.decision).toBe("acceptForSession")
    expect(byAdditionalPermission.requestedNetwork).toBe(true)
  })

  test("surfaces filesystem expansions before asking for approval", () => {
    const outsidePath = assessCodexAppServerApprovalRequest({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        additionalPermissions: {
          network: null,
          fileSystem: {
            read: ["/Users/conmeara/.ssh"],
            write: null,
          },
        },
      },
    })

    expect(outsidePath.canApprove).toBe(true)
    expect(outsidePath.approvalWarning).toBe(
      "Approval request references a path outside the Ripple workspace: /Users/conmeara/.ssh",
    )
    expect(outsidePath.approveResponse).toEqual({ decision: "acceptForSession" })
    expect(outsidePath.requestedPermissionPaths).toEqual(["/Users/conmeara/.ssh"])

    const specialPath = assessCodexAppServerApprovalRequest({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        permissions: {
          network: null,
          fileSystem: {
            read: null,
            write: null,
            entries: [
              { path: { type: "special", value: "home" }, access: "readOnly" },
            ],
          },
        },
      },
    })

    expect(specialPath.canApprove).toBe(true)
    expect(specialPath.approveResponse.decision).toBe("acceptForSession")
    expect(specialPath.approvalWarning).toContain("cannot confine to this project")
  })

  test("surfaces outside-workspace commands before asking for approval", () => {
    const assessment = assessCodexAppServerApprovalRequest({
      workspaceRoot,
      params: {
        cwd: "/tmp/other-project",
        command: "bun test",
      },
    })

    expect(assessment.canApprove).toBe(true)
    expect(assessment.approvalWarning).toBe(
      "Approval requested outside the Ripple workspace: /tmp/other-project",
    )
    expect(assessment.approveResponse).toEqual({ decision: "acceptForSession" })
  })

  test("auto-approves only clean Ripple visual commands inside the workspace", () => {
    expect(isCodexAppServerAutoApprovedVisualCommand({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "ripple snapshot --at current --json",
        availableDecisions: ["acceptForSession", "decline"],
      },
    })).toBe(true)
    expect(isCodexAppServerAutoApprovedVisualCommand({
      workspaceRoot,
      params: {
        cwd: `${workspaceRoot}/compositions`,
        command: "ripple frame-sheet --range 0s..8s --samples 8 --json",
        availableDecisions: ["accept", "decline"],
      },
    })).toBe(true)
    expect(isCodexAppServerAutoApprovedVisualCommand({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "ripple context --range 0s..8s --json",
      },
    })).toBe(false)
    expect(isCodexAppServerAutoApprovedVisualCommand({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "ripple sheet --range 0s..8s --json",
      },
    })).toBe(false)
    expect(isCodexAppServerAutoApprovedVisualCommand({
      workspaceRoot,
      params: {
        cwd: "/tmp/other-project",
        command: "ripple snapshot --at current --json",
      },
    })).toBe(false)
    expect(isCodexAppServerAutoApprovedVisualCommand({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "ripple frame-sheet --json > /tmp/sheet.json",
      },
    })).toBe(false)
    expect(isCodexAppServerAutoApprovedVisualCommand({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "ripple snapshot --at $(date) --json",
      },
    })).toBe(false)
    expect(isCodexAppServerAutoApprovedVisualCommand({
      workspaceRoot,
      params: {
        cwd: workspaceRoot,
        command: "ripple frame-sheet --range 0s..8s --json",
        additionalPermissions: {
          network: { enabled: true },
        },
      },
    })).toBe(false)
  })
})

describe("Codex App Server input", () => {
  test("starts clean Codex threads with app policy, initialized, and native skills/list discovery", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/codex-app-server-adapter.ts",
      "utf8",
    )

    expect(source).toContain('this.notify("initialized")')
    expect(source).toContain('name: "ripple_desktop"')
    expect(source).toContain('serviceName: "ripple_desktop"')
    expect(source).toContain("experimentalApi: true")
    expect(source).toContain("let threadId: string | null = null")
    expect(source).toContain("ephemeral: true")
    expect(source).toContain('sessionStartSource: "clear"')
    expect(source).toContain("persistExtendedHistory: false")
    expect(source).toContain("suppress_unstable_features_warning: true")
    expect(source).toContain('approvalPolicy: "on-request"')
    expect(source).not.toContain('approvalPolicy: "on-failure"')
    expect(source).toContain('"skills/list"')
    expect(source).toContain("baseInstructions: projectNoteFallback")
    expect(source).toContain("developerInstructions: runContext.appPolicy")
    expect(source).toContain("buildCodexTurnSkillInputs")
  })

  test("keeps preview-context capture off the default Codex startup path", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/codex-app-server-adapter.ts",
      "utf8",
    )

    const handoffPromiseIndex = source.indexOf("const visualContextHandoffPromise")
    const optInIndex = source.indexOf("shouldPrepareAgentVisualContextHandoff()", handoffPromiseIndex)
    const clientStartIndex = source.indexOf("await client.start()", handoffPromiseIndex)
    const handoffAwaitIndex = source.indexOf("visualContextHandoffPromise,", clientStartIndex)

    expect(handoffPromiseIndex).toBeGreaterThan(-1)
    expect(optInIndex).toBeGreaterThan(handoffPromiseIndex)
    expect(clientStartIndex).toBeGreaterThan(handoffPromiseIndex)
    expect(handoffAwaitIndex).toBeGreaterThan(clientStartIndex)
    expect(source).toContain('label: "Preparing preview context"')
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

  test("normalizes enabled skills/list entries for default app skills and typed skill mentions", () => {
    const skills = normalizeCodexSkillEntries({
      data: [
        {
          cwd: "/tmp/project",
          skills: [
            {
              name: "ripple-visual-context",
              description: "Inspect Ripple visuals",
              path: "/tmp/app/resources/agent-skills/ripple-visual-context",
              enabled: true,
            },
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

    expect(buildCodexTurnSkillInputs(["hyperframes", "disabled", "missing"], skills)).toEqual([
      {
        type: "skill",
        name: "ripple-visual-context",
        path: "/tmp/app/resources/agent-skills/ripple-visual-context",
      },
      {
        type: "skill",
        name: "hyperframes",
        path: "/tmp/project/.agents/skills/hyperframes",
      },
    ])
    expect(buildCodexTurnSkillInputs([], skills)).toEqual([
      {
        type: "skill",
        name: "ripple-visual-context",
        path: "/tmp/app/resources/agent-skills/ripple-visual-context",
      },
    ])
  })
})

describe("Codex App Server model selection", () => {
  test("splits UI model/thinking selections into app-server model and effort", () => {
    expect(normalizeCodexModelSelection("gpt-5.5/high")).toEqual({
      model: "gpt-5.5",
      effort: "high",
    })
    expect(normalizeCodexModelSelection("gpt-5.4-mini/xhigh")).toEqual({
      model: "gpt-5.4-mini",
      effort: "xhigh",
    })
  })

  test("leaves provider-native model strings unchanged", () => {
    expect(normalizeCodexModelSelection("gpt-5.5")).toEqual({
      model: "gpt-5.5",
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

  test("lets Codex shell commands inherit only app-managed visual CLI variables", () => {
    const appManagedEnv = {
      PATH: "/app/cli:/usr/bin",
      RIPPLE_VISUAL_CONTEXT_ENDPOINT: "http://127.0.0.1:4000",
      RIPPLE_VISUAL_CONTEXT_TOKEN: "visual-token",
      OPENAI_API_KEY: "sk-test",
      CODEX_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "anthropic-test",
    }
    const args = buildCodexAppServerArgs(appManagedEnv)
    const policyConfig = buildCodexShellEnvironmentPolicyConfig(appManagedEnv)
    const serialized = args.join("\n")

    expect(args[0]).toBe("app-server")
    expect(policyConfig.inherit).toBe("all")
    expect(policyConfig.ignore_default_excludes).toBe(true)
    expect(policyConfig.experimental_use_profile).toBe(false)
    expect(policyConfig.include_only).toEqual(expect.arrayContaining([
      "PATH",
      "RIPPLE_VISUAL_CONTEXT_ENDPOINT",
      "RIPPLE_VISUAL_CONTEXT_TOKEN",
      "HYPERFRAMES_BROWSER_PATH",
    ]))
    expect(policyConfig.set).toEqual(expect.objectContaining({
      PATH: "/app/cli:/usr/bin",
      RIPPLE_VISUAL_CONTEXT_ENDPOINT: "http://127.0.0.1:4000",
      RIPPLE_VISUAL_CONTEXT_TOKEN: "visual-token",
    }))
    expect(serialized).toContain("shell_environment_policy.inherit=all")
    expect(serialized).toContain("shell_environment_policy.include_only=")
    expect(serialized).toContain("shell_environment_policy.ignore_default_excludes=true")
    expect(serialized).toContain("shell_environment_policy.experimental_use_profile=false")
    expect(serialized).toContain("shell_environment_policy.set.PATH=")
    expect(serialized).toContain("/app/cli:/usr/bin")
    expect(serialized).toContain("RIPPLE_VISUAL_CONTEXT_ENDPOINT")
    expect(serialized).toContain("RIPPLE_VISUAL_CONTEXT_TOKEN")
    expect(serialized).toContain("HYPERFRAMES_BROWSER_PATH")
    expect(serialized).toContain("PATH")
    expect(serialized).not.toContain("OPENAI_API_KEY")
    expect(serialized).not.toContain("CODEX_API_KEY")
    expect(serialized).not.toContain("ANTHROPIC_API_KEY")
    expect(policyConfig.include_only).not.toContain("OPENAI_API_KEY")
    expect(policyConfig.include_only).not.toContain("CODEX_API_KEY")
    expect(policyConfig.include_only).not.toContain("ANTHROPIC_API_KEY")
    expect(policyConfig.set).not.toHaveProperty("OPENAI_API_KEY")
    expect(policyConfig.set).not.toHaveProperty("CODEX_API_KEY")
    expect(policyConfig.set).not.toHaveProperty("ANTHROPIC_API_KEY")
  })
})
