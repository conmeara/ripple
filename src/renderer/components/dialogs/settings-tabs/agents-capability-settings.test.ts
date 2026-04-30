import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Ripple agent capability settings", () => {
  test("lets users list, create, update, delete, and refresh skills and slash commands", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx",
      "utf8",
    )

    expect(source).toContain("trpc.skills.list.useQuery")
    expect(source).toContain("trpc.commands.list.useQuery")
    expect(source).toContain("createSkillMutation")
    expect(source).toContain("createCommandMutation")
    expect(source).toContain("updateSkillMutation")
    expect(source).toContain("updateCommandMutation")
    expect(source).toContain("deleteSkillMutation")
    expect(source).toContain("deleteCommandMutation")
    expect(source).toContain('aria-label="Refresh skills and commands"')
    expect(source).toContain("Command (triggered via /slash)")
    expect(source).toContain("Project: ${projectName}")
  })

  test("lets users manage MCP servers for both Claude Agent SDK and Codex App Server", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx",
      "utf8",
    )

    expect(source).toContain('type McpProvider = "claude-code" | "codex"')
    expect(source).toContain("trpc.claude.addMcpServer.useMutation")
    expect(source).toContain("trpc.codex.addMcpServer.useMutation")
    expect(source).toContain("trpc.claude.refreshMcpConfig.useMutation")
    expect(source).toContain("trpc.codex.refreshMcpConfig.useMutation")
    expect(source).toContain('SelectItem value="codex">Codex App Server')
    expect(source).toContain('SelectItem value="claude-code">Claude Agent SDK')
    expect(source).toContain("Global (~/.codex/config.toml)")
    expect(source).toContain("Global (~/.claude.json)")
    expect(source).toContain("Refreshed MCP servers")
  })
})
