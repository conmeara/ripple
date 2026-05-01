import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Composition, Project } from "../db/schema"
import type { HyperframesProjectContext } from "./types"
import { updateHyperframesTimelineClip } from "./timeline-edits"

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

describe("HyperFrames timeline clip editing", () => {
  test("moves and trims a generic DOM clip through guarded source patching", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-edit-"))
    try {
      writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify({ fps: 30, duration: 6 }))
      writeFileSync(
        join(projectDir, "index.html"),
        [
          '<main data-composition-id="main" data-width="1920" data-height="1080" data-duration="6">',
          '  <section id="card" class="clip title-card" data-start="1" data-duration="3" data-track-index="2" style="opacity: 0.8">Title</section>',
          '  <img id="logo" class="clip" src="assets/logo.png" data-start="0" data-duration="6" data-track-index="1" />',
          "</main>",
        ].join("\n"),
      )

      const result = await updateHyperframesTimelineClip({
        context: context(projectDir),
        composition: composition(),
        clip: { domId: "card", sourceFile: "index.html" },
        start: 2.25,
        duration: 1.5,
        track: 0,
      })

      const source = readFileSync(join(projectDir, "index.html"), "utf-8")
      expect(source).toContain('id="card"')
      expect(source).toContain('data-start="2.25"')
      expect(source).toContain('data-duration="1.5"')
      expect(source).toContain('data-track-index="0"')
      expect(source).toContain('style="opacity: 0.8; z-index: 2"')
      expect(source).toContain('id="logo"')
      expect(source).toContain('style="z-index: 1"')
      expect(result.model.clips.find((clip) => clip.id === "card")).toMatchObject({
        start: 2.25,
        duration: 1.5,
        track: 0,
      })
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("left-trims a generic DOM clip without adding a media playback offset", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-dom-left-trim-"))
    try {
      writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify({ fps: 30, duration: 6 }))
      writeFileSync(
        join(projectDir, "index.html"),
        '<main data-composition-id="main" data-duration="6"><div id="panel" class="clip" data-start="1" data-duration="3" data-track-index="0"></div></main>',
      )

      await updateHyperframesTimelineClip({
        context: context(projectDir),
        composition: composition(),
        clip: { domId: "panel", sourceFile: "index.html" },
        start: 1.5,
        duration: 2.5,
        track: 0,
      })

      const source = readFileSync(join(projectDir, "index.html"), "utf-8")
      expect(source).toContain('data-start="1.5"')
      expect(source).toContain('data-duration="2.5"')
      expect(source).not.toContain("data-media-start")
      expect(source).not.toContain("data-playback-start")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("left-trims media by advancing the timeline start and media offset", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-media-trim-"))
    try {
      writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify({ fps: 30, duration: 8 }))
      writeFileSync(
        join(projectDir, "index.html"),
        '<main data-composition-id="main" data-width="1920" data-height="1080" data-duration="8"><video id="hero" class="clip" src="assets/hero.mp4" data-start="1" data-duration="3" data-track-index="1" data-source-duration="10"></video></main>',
      )

      await updateHyperframesTimelineClip({
        context: context(projectDir),
        composition: composition(),
        clip: { domId: "hero", sourceFile: "index.html" },
        start: 1.5,
        duration: 2.5,
        track: 1,
        playbackStart: 0.5,
      })

      const source = readFileSync(join(projectDir, "index.html"), "utf-8")
      expect(source).toContain('data-start="1.5"')
      expect(source).toContain('data-duration="2.5"')
      expect(source).toContain('data-media-start="0.5"')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("resolves generated runtime clip ids back to class-based source clips", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-runtime-target-"))
    try {
      writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify({ fps: 30, duration: 6 }))
      writeFileSync(
        join(projectDir, "index.html"),
        [
          '<main data-composition-id="main" data-width="1920" data-height="1080" data-duration="6">',
          '  <section class="clip title-card" data-start="0" data-duration="6" data-track-index="1">Title card</section>',
          "</main>",
        ].join("\n"),
      )

      await updateHyperframesTimelineClip({
        context: context(projectDir),
        composition: composition(),
        clip: {
          key: "index.html:__node__index_2:0",
          sourceFile: "index.html",
          domId: "__node__index_2",
          selector: "#__node__index_2",
          label: "Node Index 2",
          tagName: "section",
          start: 0,
          duration: 6,
          track: 1,
        },
        start: 0.5,
        duration: 5,
        track: 2,
      })

      const source = readFileSync(join(projectDir, "index.html"), "utf-8")
      expect(source).toContain('class="clip title-card"')
      expect(source).toContain('data-start="0.5"')
      expect(source).toContain('data-duration="5"')
      expect(source).toContain('data-track-index="2"')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("rejects generic DOM left trims that try to add a media playback offset", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-front-trim-"))
    try {
      writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify({ fps: 30, duration: 6 }))
      writeFileSync(
        join(projectDir, "index.html"),
        '<main data-composition-id="main" data-duration="6"><div id="panel" class="clip" data-start="1" data-duration="3" data-track-index="0"></div></main>',
      )

      await expect(updateHyperframesTimelineClip({
        context: context(projectDir),
        composition: composition(),
        clip: { domId: "panel", sourceFile: "index.html" },
        start: 1.5,
        duration: 2.5,
        track: 0,
        playbackStart: 0.5,
      })).rejects.toThrow("Only media clips")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("rejects composition sources that resolve outside the project through symlinks", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-timeline-source-link-"))
    const outsideDir = mkdtempSync(join(tmpdir(), "ripple-timeline-source-outside-"))
    try {
      writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify({ fps: 30, duration: 6 }))
      writeFileSync(
        join(outsideDir, "index.html"),
        '<main data-composition-id="main" data-duration="6"><div id="panel" class="clip" data-start="1" data-duration="3" data-track-index="0"></div></main>',
      )
      symlinkSync(join(outsideDir, "index.html"), join(projectDir, "index.html"))

      await expect(updateHyperframesTimelineClip({
        context: context(projectDir),
        composition: composition(),
        clip: { domId: "panel", sourceFile: "index.html" },
        start: 2,
        duration: 3,
        track: 0,
      })).rejects.toThrow("not a regular project file")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outsideDir, { recursive: true, force: true })
    }
  })
})
