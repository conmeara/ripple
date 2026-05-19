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

  test("returns updated input when auto-allowing Claude visual tools", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts",
      "utf8",
    )

    expect(source).toContain("isRippleClaudeAutoAllowedTool(toolName, normalizedInput)")
    expect(source).toContain("updatedInput: normalizedInput")
    expect(source).toContain("updatedInput: asRecord(approval.response) ?? normalizedInput")
  })
})
