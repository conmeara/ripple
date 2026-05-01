import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Composition, Project } from "../db/schema"
import type { HyperframesProjectContext } from "./types"
import { buildHyperframesStaticTimelineModel } from "./timeline-model"

function project(projectPath: string, overrides: Partial<Project> = {}): Project {
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
    ...overrides,
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

describe("HyperFrames static timeline model", () => {
  test("extracts explicit clips and nested composition hosts from root HTML", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-static-timeline-"))
    try {
      mkdirSync(join(projectDir, "compositions"), { recursive: true })
      writeFileSync(
        join(projectDir, "hyperframes.json"),
        JSON.stringify({ fps: 30, duration: 6 }),
      )
      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html><html><body>",
          '<main id="main" data-composition-id="main" data-width="1920" data-height="1080" data-duration="6">',
          '<section class="clip title-card" data-start="0" data-duration="6" data-track-index="1">',
          '<h1 id="title" class="clip title" data-start="0.2" data-duration="4.8" data-track-index="2">Launch Film</h1>',
          "</section>",
          '<div class="clip lower-third-host" data-start="2.4" data-duration="3.2" data-track-index="4" data-composition-id="lower-third" data-width="1920" data-height="220" data-composition-src="./compositions/lower-third.html"></div>',
          "</main>",
          "</body></html>",
        ].join(""),
      )
      writeFileSync(
        join(projectDir, "compositions", "lower-third.html"),
        '<template><section data-composition-id="lower-third"></section></template>',
      )

      const model = buildHyperframesStaticTimelineModel({
        context: context(projectDir),
        composition: composition(),
      })

      expect(model.source).toBe("static-source")
      expect(model.durationSeconds).toBe(6)
      expect(model.width).toBe(1920)
      expect(model.height).toBe(1080)
      expect(model.clips.map((clip) => clip.label)).toEqual([
        "Title Card",
        "Title",
        "Lower Third",
      ])
      expect(model.clips.at(-1)?.kind).toBe("composition")
      expect(model.clips.at(-1)?.compositionSrc).toBe("compositions/lower-third.html")
      expect(model.clips.at(-1)?.confidence).toBe("static")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("reads clips from external composition template content", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-static-template-"))
    try {
      mkdirSync(join(projectDir, "compositions"), { recursive: true })
      writeFileSync(
        join(projectDir, "hyperframes.json"),
        JSON.stringify({ fps: 30, duration: 6 }),
      )
      writeFileSync(join(projectDir, "index.html"), "<main data-composition-id=\"main\"></main>")
      writeFileSync(
        join(projectDir, "compositions", "lower-third.html"),
        [
          "<template>",
          '<section id="lower-third" data-composition-id="lower-third" data-width="1920" data-height="220" data-duration="3">',
          '<div class="clip lower-third-panel" data-start="0" data-duration="3" data-track-index="1">',
          '<p class="clip caption" data-start="0.25" data-duration="2" data-track-index="2">Motion project ready</p>',
          "</div>",
          "</section>",
          "</template>",
        ].join(""),
      )

      const model = buildHyperframesStaticTimelineModel({
        context: context(projectDir),
        composition: composition({
          id: "lower_comp",
          name: "Lower Third",
          filePath: "compositions/lower-third.html",
          dataCompositionId: "lower-third",
          height: 220,
          kind: "external",
        }),
      })

      expect(model.compositionId).toBe("lower_comp")
      expect(model.durationSeconds).toBe(3)
      expect(model.clips.map((clip) => clip.label)).toEqual([
        "Lower Third Panel",
        "Caption",
      ])
      expect(model.clips[0]?.sourceFile).toBe("compositions/lower-third.html")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("clips child durations to the root duration and preserves media metadata", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-static-media-"))
    try {
      writeFileSync(
        join(projectDir, "hyperframes.json"),
        JSON.stringify({ fps: 24, duration: 3 }),
      )
      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html><html><body>",
          '<main data-composition-id="main" data-width="1280" data-height="720" data-duration="3">',
          '<video id="hero-video" class="clip" src="assets/hero.mp4" data-start="2" data-duration="5" data-track-index="1" data-playback-start="0.5" data-source-duration="10" data-volume="0.75"></video>',
          '<img id="after-end" class="clip" src="assets/late.png" data-start="4" data-duration="1" data-track-index="2" />',
          "</main>",
          "</body></html>",
        ].join(""),
      )

      const model = buildHyperframesStaticTimelineModel({
        context: context(projectDir),
        composition: composition(),
      })

      expect(model.fps).toBe(24)
      expect(model.durationSeconds).toBe(3)
      expect(model.durationFrames).toBe(72)
      expect(model.width).toBe(1280)
      expect(model.height).toBe(720)
      expect(model.clips).toHaveLength(1)
      expect(model.clips[0]).toMatchObject({
        id: "hero-video",
        label: "Hero",
        kind: "video",
        start: 2,
        duration: 1,
        assetUrl: "assets/hero.mp4",
        playbackStart: 0.5,
        sourceDuration: 10,
        volume: 0.75,
      })
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("extracts caption and timeline metadata from static HTML", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-static-caption-"))
    try {
      writeFileSync(
        join(projectDir, "hyperframes.json"),
        JSON.stringify({ fps: 30, duration: 4 }),
      )
      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html><html><body>",
          '<main data-composition-id="main" data-width="1920" data-height="1080" data-duration="4">',
          '<span id="caption-a" class="clip caption" data-start="1" data-duration="2" data-track-index="3" data-timeline-role="caption" data-timeline-group="captions" data-timeline-priority="-1">Ship the spot</span>',
          "</main>",
          "</body></html>",
        ].join(""),
      )

      const model = buildHyperframesStaticTimelineModel({
        context: context(projectDir),
        composition: composition(),
      })

      expect(model.clips[0]).toMatchObject({
        id: "caption-a",
        label: "Caption",
        kind: "caption",
        timelineRole: "caption",
        timelineGroup: "captions",
        timelinePriority: -1,
      })
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("rebases relative media paths from nested composition files and preserves external URLs", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-static-assets-"))
    try {
      mkdirSync(join(projectDir, "compositions"), { recursive: true })
      writeFileSync(
        join(projectDir, "hyperframes.json"),
        JSON.stringify({ fps: 30, duration: 4 }),
      )
      writeFileSync(
        join(projectDir, "compositions", "card.html"),
        [
          "<template>",
          '<section data-composition-id="card" data-width="1080" data-height="1080" data-duration="4">',
          '<img id="logo" class="clip" src="../assets/logo.png" data-start="0" data-duration="2" data-track-index="1" />',
          '<audio id="voice" class="clip" src="https://cdn.example.test/voice.mp3" data-start="1" data-duration="2" data-track-index="2"></audio>',
          "</section>",
          "</template>",
        ].join(""),
      )

      const model = buildHyperframesStaticTimelineModel({
        context: context(projectDir),
        composition: composition({
          id: "card_comp",
          name: "Card",
          filePath: "compositions/card.html",
          dataCompositionId: "card",
          width: 1080,
          height: 1080,
          kind: "external",
        }),
      })

      expect(model.clips.map((clip) => clip.assetUrl)).toEqual([
        "assets/logo.png",
        "https://cdn.example.test/voice.mp3",
      ])
      expect(model.clips.map((clip) => clip.kind)).toEqual(["image", "audio"])
      expect(model.clips.every((clip) => clip.sourceFile === "compositions/card.html")).toBe(true)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("returns a fallback root clip when a valid composition has duration but no child clips", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-static-fallback-"))
    try {
      writeFileSync(
        join(projectDir, "hyperframes.json"),
        JSON.stringify({ fps: 30, duration: 5 }),
      )
      writeFileSync(
        join(projectDir, "index.html"),
        '<main data-composition-id="main" data-width="1920" data-height="1080" data-duration="5"></main>',
      )

      const model = buildHyperframesStaticTimelineModel({
        context: context(projectDir),
        composition: composition(),
      })

      expect(model.clips).toHaveLength(1)
      expect(model.clips[0]?.confidence).toBe("fallback")
      expect(model.clips[0]?.duration).toBe(5)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("rejects missing or escaped composition files", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-static-boundary-"))
    try {
      writeFileSync(join(projectDir, "hyperframes.json"), "{}")
      expect(() => buildHyperframesStaticTimelineModel({
        context: context(projectDir),
        composition: composition({ filePath: "missing.html" }),
      })).toThrow("composition file is missing")

      expect(() => buildHyperframesStaticTimelineModel({
        context: context(projectDir),
        composition: composition({ filePath: "../outside.html" }),
      })).toThrow("Path traversal")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
