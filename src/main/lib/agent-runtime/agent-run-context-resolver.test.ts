import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
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
      expect(context.projectNotes.fileName).toBe("AGENTS.md")
      expect(context.projectNotes.discoveryStatus).toBe("injected")
      expect(context.projectNotes.fallbackContent).toContain("Ripple Project Notes For Codex")
      expect(context.skillRoots.appManaged[0]).toContain("hyperframes")
      expect(context.skillRoots.project[0]).toContain(".agents")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(revisionPath, { recursive: true, force: true })
    }
  })
})
