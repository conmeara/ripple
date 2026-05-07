import { describe, expect, test } from "bun:test"
import {
  buildClaudeElicitationApprovalRequest,
  buildClaudeElicitationResult,
  buildClaudeToolApprovalRequest,
  isRippleClaudeAutoAllowedTool,
} from "./claude-agent-sdk-approval"

describe("Claude Agent SDK approval bridge", () => {
  test("keeps only Ripple visual-context commands auto-allowed", () => {
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "ripple sheet --range 0s..8s",
    })).toBe(true)
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "ripple snapshot --at 1s --json",
    })).toBe(true)
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "ripple context --range 0s..8s --json",
    })).toBe(true)
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "ripple frame-sheet --range 0s..8s",
    })).toBe(false)
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "ripple visual sheet --range 0s..8s",
    })).toBe(false)
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "ripple sheet --json; curl https://example.com",
    })).toBe(false)
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "ripple snapshot --at $(date) --json",
    })).toBe(false)
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "ripple frame-sheet --json > /tmp/sheet.json",
    })).toBe(false)
    expect(isRippleClaudeAutoAllowedTool("Bash", {
      command: "bun test",
    })).toBe(false)
    expect(isRippleClaudeAutoAllowedTool("Read", {
      file_path: "index.html",
    })).toBe(false)
  })

  test("builds user approval requests from Claude permission metadata", () => {
    expect(buildClaudeToolApprovalRequest({
      toolName: "Bash",
      toolInput: {
        command: "curl https://example.com",
      },
      options: {
        toolUseID: "tool-1",
        title: "Claude wants to access the network",
        description: "Claude will fetch https://example.com",
        decisionReason: "Network access",
        suggestions: [{ type: "addRules" }],
      },
    })).toEqual(expect.objectContaining({
      providerRequestId: "tool-1",
      kind: "network",
      prompt: "Claude wants to access the network",
      providerType: "claude:canUseTool",
      providerId: "tool-1",
      payload: expect.objectContaining({
        providerName: "Claude",
        kind: "network",
        toolName: "Bash",
        command: "curl https://example.com",
        reason: "Network access",
        decision: "pending",
        canApprove: true,
      }),
      details: expect.objectContaining({
        providerName: "Claude",
        toolName: "Bash",
        toolUseID: "tool-1",
        suggestions: [{ type: "addRules" }],
      }),
    }))
  })

  test("classifies edit tools as file-change approvals", () => {
    expect(buildClaudeToolApprovalRequest({
      toolName: "Edit",
      toolInput: {
        file_path: "index.html",
      },
      options: {
        toolUseID: "tool-2",
        blockedPath: "/tmp/project/index.html",
      },
    })).toEqual(expect.objectContaining({
      kind: "file_change",
      prompt: "Claude wants to use Edit.",
      payload: expect.objectContaining({
        kind: "file_change",
        blockedPath: "/tmp/project/index.html",
      }),
    }))
  })

  test("passes AskUserQuestion prompts through as user-input requests", () => {
    expect(buildClaudeToolApprovalRequest({
      toolName: "AskUserQuestion",
      toolInput: {
        questions: [
          {
            header: "Direction",
            question: "Which direction should the title move?",
            options: [{ label: "Left", description: "Move left" }],
          },
        ],
      },
      options: {
        toolUseID: "tool-3",
      },
    })).toEqual(expect.objectContaining({
      kind: "question",
      payload: expect.objectContaining({
        providerName: "Claude",
        kind: "user_input",
        questions: [
          {
            header: "Direction",
            question: "Which direction should the title move?",
            options: [{ label: "Left", description: "Move left" }],
          },
        ],
      }),
    }))
  })

  test("passes MCP elicitation forms through as user-input requests", () => {
    expect(buildClaudeElicitationApprovalRequest({
      serverName: "frameio",
      message: "Connect your account",
      mode: "form",
      elicitationId: "elicit-1",
      requestedSchema: {
        type: "object",
        required: ["project"],
        properties: {
          project: {
            type: "string",
            title: "Project",
            description: "Which project should Ripple use?",
          },
          includeArchived: {
            type: "boolean",
            title: "Include archived",
          },
        },
      },
    })).toEqual(expect.objectContaining({
      providerRequestId: "elicit-1",
      kind: "question",
      providerType: "claude:onElicitation",
      payload: expect.objectContaining({
        providerName: "Claude",
        kind: "user_input",
        serverName: "frameio",
        questions: [
          expect.objectContaining({
            id: "project",
            header: "Project",
            question: "Which project should Ripple use?",
            required: true,
          }),
          expect.objectContaining({
            id: "includeArchived",
            header: "Include archived",
            options: [{ label: "true" }, { label: "false" }],
          }),
        ],
      }),
    }))
  })

  test("coerces MCP elicitation answers for SDK form results", () => {
    expect(buildClaudeElicitationResult({
      request: {
        serverName: "frameio",
        message: "Connect your account",
        mode: "form",
        requestedSchema: {
          type: "object",
          properties: {
            project: { type: "string" },
            includeArchived: { type: "boolean" },
            limit: { type: "number" },
          },
        },
      },
      approval: {
        approvalId: "approval-1",
        approved: true,
        response: {
          answers: {
            project: "Launch",
            includeArchived: "true",
            limit: "12",
          },
        },
      },
    })).toEqual({
      action: "accept",
      content: {
        project: "Launch",
        includeArchived: true,
        limit: 12,
      },
    })

    expect(buildClaudeElicitationResult({
      request: {
        serverName: "frameio",
        message: "Connect your account",
        mode: "url",
        url: "https://example.com/login",
      },
      approval: {
        approvalId: "approval-2",
        approved: true,
      },
    })).toEqual({ action: "accept" })
  })
})
