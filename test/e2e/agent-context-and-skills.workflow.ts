import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildProjectNoteFallbackInstructions,
  ensureProjectAppManagedAgentSkills,
  resolveAgentRunContext,
} from "../../src/main/lib/agent-runtime/agent-run-context-resolver"
import { buildCodexTurnInput } from "../../src/main/lib/agent-runtime/providers/codex-app-server-input"
import { buildCodexTurnSkillInputs } from "../../src/main/lib/agent-runtime/providers/codex-app-server-skills"
import type { PreparedRuntimeAttachments } from "../../src/main/lib/agent-runtime/runtime-attachments"
import { ensureRippleProjectAgentNotes } from "../../src/main/lib/ripple-projects/project-agent-notes"

const emptyAttachments: PreparedRuntimeAttachments = {
  promptSuffix: "",
  savedAttachments: [],
  imageContentBlocks: [],
  documentContentBlocks: [],
}

test("loads prompt policy, project notes, and official HyperFrames skills for provider sessions", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "ripple-e2e-agent-context-project-"))
  const revisionPath = await mkdtemp(join(tmpdir(), "ripple-e2e-agent-context-revision-"))

  try {
    await ensureRippleProjectAgentNotes(projectPath)

    const codexContext = await resolveAgentRunContext({
      provider: "codex",
      cwd: revisionPath,
      projectPath,
      workspaceKind: "generated_change",
    })
    const codexProjectNotes = buildProjectNoteFallbackInstructions(codexContext)
    const codexSkillResult = await ensureProjectAppManagedAgentSkills({
      provider: "codex",
      projectPath,
    })
    const codexSkillRecords = codexSkillResult.skills.map((skill) => ({
      name: skill.name,
      description: `${skill.provider} ${skill.name}`,
      path: skill.targetPath,
      enabled: skill.status !== "missing-source",
    }))
    const codexSkillInputs = buildCodexTurnSkillInputs(["hyperframes-media"], codexSkillRecords)
    const codexTurnInput = buildCodexTurnInput(
      [codexProjectNotes, "Use the official HyperFrames media skill for transparent overlay work."]
        .filter(Boolean)
        .join("\n\n"),
      emptyAttachments,
      codexSkillInputs,
    )

    expect(codexContext.appPolicy).toContain("Ripple visual tool-choice policy")
    expect(codexContext.appPolicy).toContain("make the native Ripple visual tool the first external action")
    expect(codexContext.appPolicy).toContain("official bundled skills")
    expect(codexContext.appPolicy).toContain("transparent overlays")
    expect(codexContext.appPolicy).not.toContain("ripple-visual-context")
    expect(codexContext.projectNotes.fileName).toBe("AGENTS.md")
    expect(codexContext.projectNotes.discoveryStatus).toBe("injected")
    expect(codexProjectNotes).toContain("Project notes from AGENTS.md")
    expect(codexSkillRecords.map((skill) => skill.name)).toContain("hyperframes-media")
    expect(codexSkillRecords.map((skill) => skill.name)).not.toContain("ripple-visual-context")
    expect(codexSkillInputs).toEqual([
      expect.objectContaining({
        type: "skill",
        name: "hyperframes-media",
      }),
    ])
    expect(codexTurnInput[0]).toEqual(expect.objectContaining({
      type: "skill",
      name: "hyperframes-media",
    }))
    expect(codexTurnInput.at(-1)).toEqual(expect.objectContaining({
      type: "text",
      text: expect.stringContaining("Project notes from AGENTS.md"),
    }))
    expect(await readFile(join(projectPath, ".agents", "skills", "hyperframes-media", "SKILL.md"), "utf8"))
      .toContain("remove-background")
    expect(existsSync(join(projectPath, ".agents", "skills", "ripple-visual-context", "SKILL.md")))
      .toBe(false)

    const claudeContext = await resolveAgentRunContext({
      provider: "claude",
      cwd: projectPath,
      projectPath,
      workspaceKind: "main",
    })
    const claudeSkillResult = await ensureProjectAppManagedAgentSkills({
      provider: "claude",
      projectPath,
    })
    const claudeSystemPromptAppend = [
      claudeContext.appPolicy,
      buildProjectNoteFallbackInstructions(claudeContext),
    ].filter(Boolean).join("\n\n")

    expect(claudeContext.projectNotes.fileName).toBe("CLAUDE.md")
    expect(claudeContext.projectNotes.discoveryStatus).toBe("native")
    expect(claudeSystemPromptAppend).toContain("Ripple visual tool-choice policy")
    expect(claudeSystemPromptAppend).toContain("make the native Ripple visual tool the first external action")
    expect(claudeSystemPromptAppend).toContain("transparent overlays")
    expect(claudeSystemPromptAppend).not.toContain("ripple-visual-context")
    expect(claudeSkillResult.skills.map((skill) => skill.name)).toContain("hyperframes-media")
    expect(existsSync(join(projectPath, ".claude", "skills", "hyperframes-media", "SKILL.md")))
      .toBe(true)
    expect(existsSync(join(projectPath, ".claude", "skills", "ripple-visual-context", "SKILL.md")))
      .toBe(false)
  } finally {
    await rm(projectPath, { recursive: true, force: true })
    await rm(revisionPath, { recursive: true, force: true })
  }
})
