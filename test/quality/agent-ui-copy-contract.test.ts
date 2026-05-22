import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

function read(path: string): string {
  return readFileSync(path, "utf8")
}

describe("Agent UI copy contract", () => {
  test("normal chat tool affordances use product language instead of protocol labels", () => {
    const mcpIndicator = read("src/renderer/features/agents/ui/mcp-servers-indicator.tsx")
    const mentionsMenu = read("src/renderer/features/agents/mentions/agents-file-mention.tsx")
    const renderedMentions = read("src/renderer/features/agents/mentions/render-file-mentions.tsx")

    expect(mcpIndicator).toContain("Project tools")
    expect(mcpIndicator).toContain("project tool connection")
    expect(mcpIndicator).toContain("Manage tool connections in advanced settings.")
    expect(mcpIndicator).not.toContain('aria-label="MCP Servers"')
    expect(mcpIndicator).not.toContain("{connectedCount} MCP")
    expect(mcpIndicator).not.toContain("Model Context Protocol servers")
    expect(mcpIndicator).not.toContain("~/.claude.json")
    expect(mcpIndicator).not.toContain(".mcp.json")

    expect(mentionsMenu).toContain('label: "Project tools"')
    expect(mentionsMenu).toContain('showingToolsList ? "Project tools"')
    expect(renderedMentions).toContain("Project tool:")
    expect(renderedMentions).not.toContain("MCP Tool:")
  })
})
