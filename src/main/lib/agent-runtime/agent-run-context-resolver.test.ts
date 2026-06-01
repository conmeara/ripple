import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ensureProjectAppManagedAgentSkills,
  resolveAgentRunContext,
} from "./agent-run-context-resolver"
import { ensureRippleProjectAgentNotes } from "../ripple-projects/project-agent-notes"

describe("agent run context resolver", () => {
  test("injects Ripple visual behavior as always-on policy while keeping app-managed skill roots HyperFrames-only", async () => {
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
      expect(context.appPolicy).toContain("hyperframes-media")
      expect(context.appPolicy).toContain("website-to-hyperframes")
      expect(context.appPolicy).toContain("frame comments get a still frame")
      expect(context.appPolicy).toContain("range comments get a frame sheet")
      expect(context.appPolicy).toContain("Normal chats do not receive automatic run-start images")
      expect(context.appPolicy).toContain("make the native Ripple visual tool the first external action")
      expect(context.appPolicy).toContain("Native Ripple visual tools return images directly")
      expect(context.appPolicy).toContain("native snapshot at `current`")
      expect(context.appPolicy).toContain("native frame sheet for motion over time")
      expect(context.appPolicy).toContain("Do not use shell commands, file lookup")
      expect(context.appPolicy).toContain("only when the runtime does not expose native Ripple visual tools")
      expect(context.appPolicy).toContain("--composition <path>")
      expect(context.appPolicy).toContain("instead of `npx`, `bunx`, or package installs")
      expect(context.appPolicy).toContain("media preprocessing, transparent overlays")
      expect(context.appPolicy).not.toContain("Ripple app-managed visual-context skill")
      expect(context.appPolicy).not.toContain("ripple-visual-context")
      expect(context.projectNotes.fileName).toBe("AGENTS.md")
      expect(context.projectNotes.discoveryStatus).toBe("injected")
      expect(context.projectNotes.fallbackContent).toContain("Ripple Project Notes For Codex")
      expect(context.skillRoots.appManaged.some((root) => root.includes("hyperframes"))).toBe(true)
      expect(context.skillRoots.appManaged.some((root) => root.endsWith("resources/hyperframes-official/skills"))).toBe(true)
      expect(context.skillRoots.appManaged.some((root) => root.endsWith("resources/agent-skills"))).toBe(false)
      expect(context.skillRoots.appManaged.some((root) => root.includes("resources/claude-plugins"))).toBe(false)
      expect(context.skillRoots.project[0]).toContain(".agents")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(revisionPath, { recursive: true, force: true })
    }
  })

  test("keeps Ripple visual policy in both Codex and Claude prompts without exposing a Ripple skill root", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-run-context-project-"))
    try {
      await ensureRippleProjectAgentNotes(projectPath)

      for (const provider of ["codex", "claude"] as const) {
        const context = await resolveAgentRunContext({
          provider,
          cwd: projectPath,
          projectPath,
          workspaceKind: "main",
        })

        expect(context.appPolicy).toContain("Ripple visual tool-choice policy")
        expect(context.appPolicy).toContain("make the native Ripple visual tool the first external action")
        expect(context.appPolicy).toContain("Use native snapshot at `current`")
        expect(context.appPolicy).toContain("native frame sheet for motion over time")
        expect(context.appPolicy).toContain("only when the runtime does not expose native Ripple visual tools")
        expect(context.appPolicy).not.toContain("ripple-visual-context")
        expect(context.skillRoots.appManaged.every((root) => root.includes("hyperframes"))).toBe(true)
        expect(context.statusLabels).toContain("Ripple app policy")
        expect(context.statusLabels).toContain("HyperFrames skills")
        expect(context.statusLabels).not.toContain("Ripple visual context")
      }
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("stages only official HyperFrames project skill links before provider sessions", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-run-context-project-"))
    try {
      const result = await ensureProjectAppManagedAgentSkills({
        provider: "codex",
        projectPath,
      })

      expect(result.skills.map((skill) => skill.name)).toContain("hyperframes-media")
      expect(result.skills.map((skill) => skill.name)).not.toContain("ripple-visual-context")
      await expect(
        readFile(join(projectPath, ".agents", "skills", "hyperframes-media", "SKILL.md"), "utf8"),
      ).resolves.toContain("remove-background")
      await expect(
        readFile(join(projectPath, ".agents", "skills", "ripple-visual-context", "SKILL.md"), "utf8"),
      ).rejects.toThrow()
      expect((await lstat(join(projectPath, ".agents", "skills", "hyperframes-media"))).isSymbolicLink())
        .toBe(process.platform !== "win32")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("does not package first-party Ripple visual-context as provider skill source", async () => {
    expect(existsSync("resources/agent-skills/ripple-visual-context/SKILL.md")).toBe(false)
    expect(existsSync("resources/claude-plugins/ripple-visual-context/skills/ripple-visual-context/SKILL.md")).toBe(false)
    expect(existsSync("resources/claude-plugins/ripple-visual-context/.claude-plugin/plugin.json")).toBe(false)
  })
})
