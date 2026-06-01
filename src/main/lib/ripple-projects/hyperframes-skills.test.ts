import { describe, expect, test } from "bun:test"
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  checkAppManagedHyperframesSkills,
  ensureProjectHyperframesSkills,
  getClaudeHyperframesPluginRoots,
  getOfficialHyperframesPluginRoot,
  listBundledHyperframesSkillNames,
  normalizePackagedHyperframesPath,
  REQUIRED_HYPERFRAMES_SKILL_NAMES,
} from "./hyperframes-skills"

describe("Ripple HyperFrames skill registration", () => {
  test("normalizes packaged skill roots to unpacked filesystem paths", () => {
    expect(normalizePackagedHyperframesPath(
      "/Applications/Ripple.app/Contents/Resources/app.asar/node_modules/hyperframes",
    )).toBe(
      "/Applications/Ripple.app/Contents/Resources/app.asar.unpacked/node_modules/hyperframes",
    )
    expect(normalizePackagedHyperframesPath(
      "/Applications/Ripple.app/Contents/Resources/app.asar.unpacked/node_modules/hyperframes",
    )).toBe(
      "/Applications/Ripple.app/Contents/Resources/app.asar.unpacked/node_modules/hyperframes",
    )
  })

  test("reports app-managed HyperFrames skills without project copies", async () => {
    const skillNames = await listBundledHyperframesSkillNames()
    const result = await checkAppManagedHyperframesSkills()

    for (const required of REQUIRED_HYPERFRAMES_SKILL_NAMES) {
      expect(skillNames).toContain(required)
    }
    expect(skillNames).toContain("three")
    expect(skillNames).toContain("website-to-hyperframes")
    expect(result.skills).toHaveLength(skillNames.length * 2)
    expect(result.skills.every((skill) => skill.status === "app-managed")).toBe(true)
    expect(result.skills.map((skill) => skill.name)).toContain("hyperframes")
    expect(result.skills.map((skill) => skill.name)).toContain("hyperframes-media")
  })

  test("packages official HyperFrames skills as refreshable app-managed plugins", async () => {
    const [sourceJson, sourceMarkdown, codexPlugin, claudePlugin] = await Promise.all([
      readFile("resources/hyperframes-official/source.json", "utf8"),
      readFile("resources/hyperframes-official/SOURCE.md", "utf8"),
      readFile("resources/hyperframes-official/.codex-plugin/plugin.json", "utf8"),
      readFile("resources/hyperframes-official/.claude-plugin/plugin.json", "utf8"),
    ])
    const source = JSON.parse(sourceJson)
    const codex = JSON.parse(codexPlugin)
    const claude = JSON.parse(claudePlugin)
    const skillNames = await listBundledHyperframesSkillNames()

    expect(source.repository).toBe("https://github.com/heygen-com/hyperframes")
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(source.skillNames).toEqual(skillNames)
    for (const required of REQUIRED_HYPERFRAMES_SKILL_NAMES) {
      expect(source.skillNames).toContain(required)
    }
    expect(sourceMarkdown).toContain("bun run hyperframes:skills:update")
    expect(codex.name).toBe("ripple-hyperframes")
    expect(codex.skills).toBe("./skills/")
    expect(codex.description).toContain("transparent overlays")
    expect(claude.name).toBe("ripple-hyperframes")
    expect(claude.description).toContain("motion projects")
    expect(getOfficialHyperframesPluginRoot()).toContain("resources/hyperframes-official")
    expect(getClaudeHyperframesPluginRoots().some((root) =>
      root.endsWith("resources/hyperframes-official")
    )).toBe(true)
  })

  test("links local HyperFrames skills into project roots for provider-native discovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-hyperframes-skills-"))
    try {
      const skillNames = await listBundledHyperframesSkillNames()
      const result = await ensureProjectHyperframesSkills({ projectPath: root })

      expect(result.skills).toHaveLength(skillNames.length * 2)
      expect(result.skills.every((skill) => skill.status === "created")).toBe(true)
      await expect(
        readFile(join(root, ".claude", "skills", "hyperframes", "SKILL.md"), "utf8"),
      ).resolves.toContain("HyperFrames")
      await expect(
        readFile(join(root, ".agents", "skills", "hyperframes-media", "SKILL.md"), "utf8"),
      ).resolves.toContain("remove-background")
      await expect(
        readFile(join(root, ".agents", "skills", "gsap", "SKILL.md"), "utf8"),
      ).resolves.toContain("GSAP")
      expect((await lstat(join(root, ".agents", "skills", "hyperframes-media"))).isSymbolicLink())
        .toBe(process.platform !== "win32")

      const second = await ensureProjectHyperframesSkills({ projectPath: root })
      expect(second.skills.every((skill) => skill.status === "present")).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reports user-modified skill files without overwriting them", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-hyperframes-skills-"))
    try {
      await ensureProjectHyperframesSkills({ projectPath: root, providers: ["codex"] })
      const skillDir = join(root, ".agents", "skills", "hyperframes")
      await rm(skillDir, { recursive: true, force: true })
      await mkdir(skillDir, { recursive: true })
      const skillPath = join(skillDir, "SKILL.md")
      await writeFile(skillPath, "# Team-owned HyperFrames notes\n", "utf8")

      const result = await ensureProjectHyperframesSkills({
        projectPath: root,
        providers: ["codex"],
      })

      expect(result.skills.find((skill) => skill.name === "hyperframes")?.status)
        .toBe("user-modified")
      await expect(readFile(skillPath, "utf8")).resolves.toBe(
        "# Team-owned HyperFrames notes\n",
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
