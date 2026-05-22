import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

describe("Claude Agent SDK visual context contract", () => {
  test("keeps preview-context capture out of the normal Claude startup path", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts",
      "utf8",
    )

    expect(source).not.toContain("prepareAgentVisualContextHandoff")
    expect(source).not.toContain("shouldPrepareAgentVisualContextHandoff")
    expect(source).not.toContain("optionalAttachments: visualContextHandoff?.attachments")
    expect(source).toContain("attachments: input.attachments")
    expect(source).toContain("createAgentVisualContextEndpoint")
    expect(source).toContain("createAgentVisualContextFileBridge")
  })

  test("registers app-managed visual context MCP tools for provider-native images", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts",
      "utf8",
    )

    expect(source).toContain("createClaudeNativeVisualContextMcpServer")
    expect(source).toContain("runNativeVisualContextTool")
    expect(source).toContain("buildClaudeNativeVisualContextToolResult")
    expect(source).toContain("RIPPLE_NATIVE_VISUAL_TOOL_COPY.snapshotDescription")
    expect(source).toContain("RIPPLE_NATIVE_VISUAL_TOOL_COPY.frameSheetDescription")
    expect(source).toContain("ripple_visual_context")
  })

  test("streams Claude text deltas into the visible assistant transcript", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts",
      "utf8",
    )

    expect(source).toContain("event.delta?.type === \"text_delta\"")
    expect(source).toContain("type: \"assistant_text_delta\"")
    expect(source).toContain("payload: { delta }")
    expect(source).not.toContain("Keep that out of the visible transcript")
    expect(source).not.toContain("isInterimToolNarration")
  })

  test("returns updated input when auto-allowing Claude project-local tools", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts",
      "utf8",
    )

    expect(source).toContain("const permissionOptions = {")
    expect(source).toContain("...options,")
    expect(source).toContain("toolUseID,")
    expect(source).toContain("isRippleClaudeProjectLocalAutoAllowedTool({")
    expect(source).toContain("toolName,")
    expect(source).toContain("toolInput: normalizedInput,")
    expect(source).toContain("options: permissionOptions,")
    expect(source).toContain("workspaceRoot: input.cwd,")
    expect(source).toContain("updatedInput: normalizedInput")
    expect(source).toContain("updatedInput: asRecord(approval.response) ?? normalizedInput")
  })
})
