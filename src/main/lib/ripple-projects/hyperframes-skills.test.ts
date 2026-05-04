import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  checkAppManagedHyperframesSkills,
  ensureProjectHyperframesSkills,
  HYPERFRAMES_SKILL_NAMES,
  normalizePackagedHyperframesPath,
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
    const result = await checkAppManagedHyperframesSkills()

    expect(result.skills).toHaveLength(HYPERFRAMES_SKILL_NAMES.length * 2)
    expect(result.skills.every((skill) => skill.status === "app-managed")).toBe(true)
    expect(result.skills.map((skill) => skill.name)).toContain("hyperframes")
  })

  test("copies local HyperFrames skills into project roots only for explicit portability", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-hyperframes-skills-"))
    try {
      const result = await ensureProjectHyperframesSkills({ projectPath: root })

      expect(result.skills).toHaveLength(HYPERFRAMES_SKILL_NAMES.length * 2)
      expect(result.skills.every((skill) => skill.status === "created")).toBe(true)
      await expect(
        readFile(join(root, ".claude", "skills", "hyperframes", "SKILL.md"), "utf8"),
      ).resolves.toContain("HyperFrames")
      await expect(
        readFile(join(root, ".agents", "skills", "gsap", "SKILL.md"), "utf8"),
      ).resolves.toContain("GSAP")

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
      const skillPath = join(root, ".agents", "skills", "hyperframes", "SKILL.md")
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
