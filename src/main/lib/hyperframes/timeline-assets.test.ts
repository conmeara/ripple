import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Composition, Project } from "../db/schema"
import type { HyperframesProjectContext } from "./types"
import { insertHyperframesTimelineAsset } from "./timeline-assets"

function project(projectPath: string): Project {
  return {
    id: "project_1",
    name: "Test Project",
    slug: "test-project",
    localPath: projectPath,
    path: projectPath,
    aspectRatioPreset: null,
    activeCompositionId: "root_comp",
    templateId: null,
    setupStatus: "ready",
    setupError: null,
    lastSetupCheckAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    gitRemoteUrl: null,
    gitProvider: null,
    gitOwner: null,
    gitRepo: null,
    iconPath: null,
  }
}

function composition(overrides: Partial<Composition> = {}): Composition {
  return {
    id: "root_comp",
    projectId: "project_1",
    name: "Main",
    filePath: "index.html",
    dataCompositionId: "main",
    width: 1920,
    height: 1080,
    parentCompositionId: null,
    kind: "root",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function context(projectPath: string): HyperframesProjectContext {
  const testProject = project(projectPath)
  return {
    key: `project:${testProject.id}`,
    projectId: testProject.id,
    project: testProject,
    projectPath,
  }
}

describe("HyperFrames timeline asset insertion", () => {
  test("adds a project asset to the active composition through guarded paths", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-asset-"))
    try {
      mkdirSync(join(projectDir, "assets", "images"), { recursive: true })
      writeFileSync(join(projectDir, "assets", "images", "logo.png"), "image", "utf8")
      writeFileSync(
        join(projectDir, "hyperframes.json"),
        JSON.stringify({ fps: 30, duration: 6 }),
      )
      writeFileSync(
        join(projectDir, "index.html"),
        '<main data-composition-id="main" data-width="1920" data-height="1080" data-duration="6"></main>',
      )

      const result = await insertHyperframesTimelineAsset({
        context: context(projectDir),
        composition: composition(),
        assetPath: "assets/images/logo.png",
        start: 1.25,
        track: 2,
        duration: 2.5,
      })

      const source = readFileSync(join(projectDir, "index.html"), "utf-8")
      expect(source).toContain('id="logo"')
      expect(source).toContain('src="assets/images/logo.png"')
      expect(source).toContain('data-start="1.25"')
      expect(source).toContain('data-duration="2.5"')
      expect(source).toContain('data-track-index="2"')
      expect(result.model.clips[0]).toMatchObject({
        id: "logo",
        kind: "image",
        start: 1.25,
        duration: 2.5,
        track: 2,
        assetUrl: "assets/images/logo.png",
      })
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("rejects unsupported or non-asset timeline drops", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-asset-reject-"))
    try {
      writeFileSync(join(projectDir, "hyperframes.json"), "{}")
      writeFileSync(join(projectDir, "index.html"), '<main data-composition-id="main"></main>')
      await expect(insertHyperframesTimelineAsset({
        context: context(projectDir),
        composition: composition(),
        assetPath: "index.html",
        start: 0,
        track: 0,
      })).rejects.toThrow("assets folder")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("rejects assets that resolve outside the project through symlinks", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-asset-link-"))
    const outsideDir = mkdtempSync(join(tmpdir(), "ripple-timeline-outside-"))
    try {
      mkdirSync(join(projectDir, "assets"), { recursive: true })
      writeFileSync(join(outsideDir, "secret.png"), "image", "utf8")
      symlinkSync(outsideDir, join(projectDir, "assets", "linked"), "dir")
      writeFileSync(join(projectDir, "hyperframes.json"), "{}")
      writeFileSync(join(projectDir, "index.html"), '<main data-composition-id="main"></main>')

      await expect(insertHyperframesTimelineAsset({
        context: context(projectDir),
        composition: composition(),
        assetPath: "assets/linked/secret.png",
        start: 0,
        track: 0,
      })).rejects.toThrow("outside the project assets folder")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  test("avoids duplicate DOM ids when adding an asset", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-asset-id-"))
    try {
      mkdirSync(join(projectDir, "assets"), { recursive: true })
      writeFileSync(join(projectDir, "assets", "logo.png"), "image", "utf8")
      writeFileSync(
        join(projectDir, "hyperframes.json"),
        JSON.stringify({ fps: 30, duration: 6 }),
      )
      writeFileSync(
        join(projectDir, "index.html"),
        '<main data-composition-id="main" data-width="1920" data-height="1080" data-duration="6"><div id="logo"></div></main>',
      )

      await insertHyperframesTimelineAsset({
        context: context(projectDir),
        composition: composition(),
        assetPath: "assets/logo.png",
        start: 0,
        track: 0,
      })

      const source = readFileSync(join(projectDir, "index.html"), "utf-8")
      expect(source).toContain('<div id="logo"></div>')
      expect(source).toContain('id="logo_2"')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
