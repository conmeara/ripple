import { beforeAll, describe, expect, mock, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

type CapabilitiesModule = typeof import("./claude-runtime-capabilities")

let capabilitiesModule: CapabilitiesModule

beforeAll(async () => {
  mock.module("electron", () => ({
    app: {
      getPath: () => "/tmp/ripple-claude-capabilities-test",
      isPackaged: false,
    },
  }))
  mock.module("../../claude-config", () => ({
    getMergedGlobalMcpServers: async () => ({}),
    getMergedLocalProjectMcpServers: async () => ({}),
    readClaudeConfig: async () => ({}),
    readClaudeDirConfig: async () => ({}),
    readProjectMcpJson: async () => ({}),
    resolveProjectPathFromWorktree: () => null,
  }))
  mock.module("../../mcp-auth", () => ({
    ensureMcpTokensFresh: async (servers: Record<string, unknown>) => servers,
  }))
  mock.module("../../plugins", () => ({
    discoverInstalledPlugins: async () => [],
    discoverPluginMcpServers: async () => [],
    getPluginComponentPaths: () => ({ skills: "/tmp/missing-skills" }),
  }))
  mock.module("../../trpc/routers/claude-settings", () => ({
    getApprovedPluginMcpServers: async () => [],
    getEnabledPlugins: async () => [],
  }))
  capabilitiesModule = await import("./claude-runtime-capabilities")
})

describe("Claude runtime capabilities source contract", () => {
  test("uses app policy append with native CLAUDE.md discovery and managed skills", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/claude-runtime-capabilities.ts",
      "utf8",
    )

    expect(source).toContain("CLAUDE.md")
    expect(source).toContain("settingSources")
    expect(source).toContain("runContext.appPolicy")
    expect(source).toContain("skills: \"all\"")
    expect(source).toContain("getClaudeHyperframesPluginRoot")
    expect(source).toContain("getAppManagedRippleClaudePluginRoot")
    expect(source).toContain("ripple-visual-context")
    expect(source).toContain("runContext.skillRoots.appManaged.map")
    expect(source).not.toContain("AGENTS.md")
  })

  test("auto-allows only the app-managed visual-context commands for Claude visual context", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts",
      "utf8",
    )

    expect(source).toContain("allowedTools: [...RIPPLE_CLAUDE_AUTO_ALLOWED_TOOLS]")
    expect(source).toContain("canUseTool")
    expect(source).toContain("onElicitation")
    expect(source).toContain('permissionMode: input.mode === "plan" ? "plan" : "default"')
    expect(source).toContain("\"Bash(ripple snapshot)\"")
    expect(source).toContain("\"Bash(ripple sheet)\"")
    expect(source).toContain("\"Bash(ripple context)\"")
    expect(source).not.toContain("\"Bash(ripple visual)\"")
    expect(source).not.toContain("\"Bash(ripple visual *)\"")
    expect(source).not.toContain("\"Bash(ripple frame-sheet)\"")
    expect(source).not.toContain("\"Bash(ripple frame-sheet *)\"")
    expect(source).not.toContain('"acceptEdits"')
    expect(source).not.toContain("\"Bash(*)\"")
    expect(source).not.toContain("allowDangerouslySkipPermissions")
  })

  test("loads the Ripple visual-context plugin and skill without a user skill mention", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-claude-capabilities-"))
    try {
      const capabilities = await capabilitiesModule.loadClaudeRuntimeCapabilities(
        projectPath,
        projectPath,
        "main",
      )

      expect(capabilities.plugins.some((plugin) =>
        plugin.path.endsWith("resources/claude-plugins/ripple-visual-context")
      )).toBe(true)
      expect(capabilities.skills).toBe("all")
      expect(capabilities.summary.pluginNames).toContain("ripple-visual-context")
      expect(capabilities.summary.skillNames).toContain("ripple-visual-context")
      expect(capabilities.summary.appManagedSkillRoots.some((root) =>
        root.endsWith("resources/claude-plugins/ripple-visual-context/skills")
      )).toBe(true)
      expect(capabilities.systemPrompt?.append).toContain("Use it proactively after creating or editing visible motion work")
      expect(capabilities.systemPrompt?.append).toContain("ripple sheet --range 0s..8s --samples 8 --columns 4 --settle 0 --backend engine --json")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
