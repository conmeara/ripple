import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveAgentRunContext } from "./agent-run-context-resolver"
import { ensureRippleProjectAgentNotes } from "../ripple-projects/project-agent-notes"

describe("agent run context resolver", () => {
  test("separates app policy, project notes, and app-managed skill roots", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-run-context-project-"))
    const revisionPath = await mkdtemp(join(tmpdir(), "ripple-run-context-revision-"))
    try {
      await ensureRippleProjectAgentNotes(projectPath)

      const context = await resolveAgentRunContext({
        provider: "codex",
        cwd: revisionPath,
        projectPath,
        workspaceKind: "generated_change",
      })

      expect(context.appPolicy).toContain("Ripple users create and review")
      expect(context.appPolicy).toContain("Ripple app-managed HyperFrames skills")
      expect(context.appPolicy).toContain("hyperframes, hyperframes-cli, gsap")
      expect(context.appPolicy).toContain("Ripple app-managed visual-context skill")
      expect(context.appPolicy).toContain("ripple-visual-context")
      expect(context.appPolicy).toContain("Use it proactively after creating or editing visible motion work")
      expect(context.appPolicy).toContain("ripple sheet --range 0s..8s --samples 8 --columns 4 --settle 0 --backend engine --json")
      expect(context.appPolicy).toContain("instead of `npx`, `bunx`, or package installs")
      expect(context.appPolicy).toContain("If local image viewing is unavailable")
      expect(context.projectNotes.fileName).toBe("AGENTS.md")
      expect(context.projectNotes.discoveryStatus).toBe("injected")
      expect(context.projectNotes.fallbackContent).toContain("Ripple Project Notes For Codex")
      expect(context.skillRoots.appManaged.some((root) => root.includes("hyperframes"))).toBe(true)
      expect(context.skillRoots.appManaged.some((root) => root.endsWith("resources/agent-skills"))).toBe(true)
      expect(context.skillRoots.project[0]).toContain(".agents")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(revisionPath, { recursive: true, force: true })
    }
  })

  test("exposes the Ripple visual-context skill through both Codex and Claude run contexts", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-run-context-project-"))
    try {
      await ensureRippleProjectAgentNotes(projectPath)

      const expectations = {
        codex: "resources/agent-skills",
        claude: "resources/claude-plugins/ripple-visual-context/skills",
      } as const
      for (const provider of ["codex", "claude"] as const) {
        const context = await resolveAgentRunContext({
          provider,
          cwd: projectPath,
          projectPath,
          workspaceKind: "main",
        })

        expect(context.appPolicy).toContain("ripple-visual-context")
        expect(context.appPolicy).toContain("Ripple visual context commands")
        expect(context.skillRoots.appManaged.some((root) => root.endsWith(expectations[provider]))).toBe(true)
        expect(context.statusLabels).toContain("Ripple visual context")
      }
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("keeps Codex and Claude Ripple visual-context skill bodies in sync", async () => {
    const [codexSkill, claudeSkill, claudePlugin] = await Promise.all([
      readFile("resources/agent-skills/ripple-visual-context/SKILL.md", "utf8"),
      readFile("resources/claude-plugins/ripple-visual-context/skills/ripple-visual-context/SKILL.md", "utf8"),
      readFile("resources/claude-plugins/ripple-visual-context/.claude-plugin/plugin.json", "utf8"),
    ])

    expect(codexSkill).toBe(claudeSkill)
    expect(codexSkill).toContain("name: ripple-visual-context")
    expect(codexSkill).toContain("description:")
    expect(codexSkill).toContain("Do not run")
    expect(codexSkill).toContain("Do not call `view_image`, `open`, or browser tools")
    expect(codexSkill).toContain("ripple sheet --range 0s..8s --samples 8 --columns 4 --settle 0 --backend engine --json")
    expect(JSON.parse(claudePlugin).name).toBe("ripple-visual-context")
  })
})
