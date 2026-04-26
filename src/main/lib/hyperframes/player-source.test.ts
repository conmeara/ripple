import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Composition, Project } from "../db/schema"
import {
  buildHyperframesPlayerBaseHref,
  buildHyperframesPlayerGsapUrl,
  buildHyperframesPlayerPreparedPreviewUrl,
  buildHyperframesPlayerRuntimeUrl,
  buildHyperframesPreparedPreviewDocument,
  buildHyperframesPlayerSourceDocument,
  buildHyperframesPlayerSourceUrl,
  getHyperframesPlayerMimeType,
  injectHyperframesPlayerDocumentChrome,
  loadHyperframesPlayerBundledGsapSource,
  loadHyperframesPlayerLegacyGsapSource,
  loadHyperframesPlayerRuntimeSource,
  selectHyperframesPlayerComposition,
  upgradeLegacyRippleStarterHtmlForPreview,
} from "./player-source"
import type { HyperframesProjectContext } from "./types"

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project_1",
    name: "Test Project",
    slug: "test-project",
    localPath: "/tmp/test-project",
    path: "/tmp/test-project",
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

describe("HyperFrames player source", () => {
  test("builds approved preview protocol URLs without absolute paths", () => {
    expect(buildHyperframesPlayerSourceUrl({
      projectId: "project_1",
      filePath: "compositions/lower third.html",
    })).toBe("ripple-preview://project_1/compositions/lower%20third.html")
    expect(buildHyperframesPlayerBaseHref({
      projectId: "project_1",
      filePath: "compositions/lower-third.html",
    })).toBe("ripple-preview://project_1/compositions/")
    expect(buildHyperframesPlayerRuntimeUrl("project_1")).toBe(
      "ripple-preview://project_1/__hyperframes/runtime.js",
    )
    expect(buildHyperframesPlayerGsapUrl("project_1")).toBe(
      "ripple-preview://project_1/__hyperframes/gsap.min.js",
    )
    expect(buildHyperframesPlayerPreparedPreviewUrl({
      projectId: "project_1",
      filePath: "index.html",
      kind: "root",
    })).toBe("ripple-preview://project_1/__hyperframes/preview/index.html")
    expect(buildHyperframesPlayerPreparedPreviewUrl({
      projectId: "project_1",
      filePath: "compositions/lower third.html",
      kind: "external",
    })).toBe(
      "ripple-preview://project_1/__hyperframes/preview/comp/compositions/lower%20third.html",
    )
    expect(() => buildHyperframesPlayerSourceUrl({
      projectId: "project_1",
      filePath: "../secrets.html",
    })).toThrow("Path traversal")
  })

  test("maps media and font assets to browser content types", () => {
    expect(getHyperframesPlayerMimeType("assets/poster.png")).toBe("image/png")
    expect(getHyperframesPlayerMimeType("assets/logo.svg")).toBe(
      "image/svg+xml; charset=utf-8",
    )
    expect(getHyperframesPlayerMimeType("assets/video/clip.mp4")).toBe("video/mp4")
    expect(getHyperframesPlayerMimeType("assets/video/clip.webm")).toBe("video/webm")
    expect(getHyperframesPlayerMimeType("assets/audio/chime.mp3")).toBe("audio/mpeg")
    expect(getHyperframesPlayerMimeType("assets/audio/chime.wav")).toBe("audio/wav")
    expect(getHyperframesPlayerMimeType("assets/fonts/display.woff2")).toBe("font/woff2")
    expect(getHyperframesPlayerMimeType("assets/fonts/display.woff")).toBe("font/woff")
    expect(getHyperframesPlayerMimeType("assets/raw.bin")).toBe(
      "application/octet-stream",
    )
  })

  test("selects explicit, active, then root compositions", () => {
    const root = composition()
    const title = composition({
      id: "title_comp",
      name: "Title",
      filePath: "compositions/title.html",
      dataCompositionId: "title",
      kind: "external",
    })

    expect(selectHyperframesPlayerComposition({
      project: project(),
      compositions: [root, title],
      compositionId: "title_comp",
    })).toBe(title)
    expect(selectHyperframesPlayerComposition({
      project: project({ activeCompositionId: "title_comp" }),
      compositions: [root, title],
    })).toBe(title)
    expect(selectHyperframesPlayerComposition({
      project: project({ activeCompositionId: "missing" }),
      compositions: [root, title],
    })).toBe(root)
    expect(() => selectHyperframesPlayerComposition({
      project: project(),
      compositions: [root],
      compositionId: "missing",
    })).toThrow("composition is no longer available")
  })

  test("injects a base tag and local runtime reference into root documents", () => {
    const html = "<!doctype html><html><head><title>Main</title></head><body></body></html>"
    const result = injectHyperframesPlayerDocumentChrome({
      html,
      baseHref: "ripple-preview://project_1/",
      runtimeUrl: "ripple-preview://project_1/__hyperframes/runtime.js",
    })

    expect(result).toContain('<base href="ripple-preview://project_1/">')
    expect(result).toContain(
      '<script data-hyperframes-preview-runtime="1" src="ripple-preview://project_1/__hyperframes/runtime.js"></script>',
    )
  })

  test("loads the local HyperFrames runtime without importing the package root", () => {
    const runtime = loadHyperframesPlayerRuntimeSource()

    expect(runtime).toContain("__player")
    expect(runtime).toContain("hf-preview")
  })

  test("upgrades the legacy starter GSAP shim to the bundled runtime", () => {
    const runtime = loadHyperframesPlayerLegacyGsapSource("assets/vendor/gsap-lite.js")

    expect(runtime).toContain("totalTime")
    expect(runtime).toContain("timeScale")
    expect(loadHyperframesPlayerBundledGsapSource("__hyperframes/gsap.min.js")).toContain(
      "totalTime",
    )
    expect(loadHyperframesPlayerBundledGsapSource("assets/vendor/gsap.min.js")).toBeNull()
  })

  test("normalizes legacy generated starter timing for preview", () => {
    const html = [
      '<script src="./assets/vendor/gsap-lite.js"></script>',
      '<main data-duration="180">',
      '<div data-start="72" data-duration="90"></div>',
      '<p data-start="8" data-duration="72"></p>',
      "</main>",
    ].join("")

    const result = upgradeLegacyRippleStarterHtmlForPreview(html)

    expect(result).toContain("./assets/vendor/gsap-lite.js")
    expect(result).toContain('data-duration="6"')
    expect(result).toContain('data-start="2.4"')
    expect(result).toContain('data-duration="3"')
    expect(result).toContain('data-start="0.267"')
  })

  test("builds a source document from a validated project file", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-player-source-"))
    try {
      mkdirSync(join(projectDir, "assets", "vendor"), { recursive: true })
      writeFileSync(
        join(projectDir, "index.html"),
        "<!doctype html><html><head><script src=\"./assets/vendor/gsap.min.js\"></script></head><body><div data-composition-id=\"main\" data-width=\"1920\" data-height=\"1080\"></div></body></html>",
      )

      const testProject = project({ localPath: projectDir, path: projectDir })
      const context: HyperframesProjectContext = {
        key: "project:project_1",
        projectId: testProject.id,
        project: testProject,
        projectPath: projectDir,
      }
      const source = buildHyperframesPlayerSourceDocument({
        context,
        composition: composition(),
      })

      expect(source.sourceUrl).toBe(
        "ripple-preview://project_1/__hyperframes/preview/index.html",
      )
      expect(source.rawSourceUrl).toBe("ripple-preview://project_1/index.html")
      expect(source.mode).toBe("url")
      expect(source.width).toBe(1920)
      expect(source.height).toBe(1080)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("builds a HyperFrames-prepared preview document for source URLs", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-player-url-source-"))
    try {
      mkdirSync(join(projectDir, "compositions"), { recursive: true })
      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html>",
          "<html>",
          "<head><script src=\"./assets/vendor/gsap.min.js\"></script></head>",
          "<body><div data-composition-id=\"main\" data-width=\"1920\" data-height=\"1080\"></div></body>",
          "</html>",
        ].join(""),
      )
      writeFileSync(
        join(projectDir, "compositions", "lower-third.html"),
        [
          "<template>",
          "<div data-composition-id=\"lower-third\" data-width=\"1920\" data-height=\"1080\">",
          "<img src=\"../assets/logo.svg\" />",
          "</div>",
          "</template>",
        ].join(""),
      )

      const testProject = project({ localPath: projectDir, path: projectDir })
      const context: HyperframesProjectContext = {
        key: "project:project_1",
        projectId: testProject.id,
        project: testProject,
        projectPath: projectDir,
      }

      const root = await buildHyperframesPreparedPreviewDocument({
        context,
        filePath: "index.html",
        kind: "root",
      })
      expect(root).toContain('<base href="ripple-preview://project_1/">')
      expect(root).toContain("ripple-preview://project_1/__hyperframes/runtime.js")

      const external = await buildHyperframesPreparedPreviewDocument({
        context,
        filePath: "compositions/lower-third.html",
        kind: "external",
      })
      expect(external).toContain('<base href="ripple-preview://project_1/">')
      expect(external).toContain("ripple-preview://project_1/__hyperframes/runtime.js")
      expect(external).toContain('src="assets/logo.svg"')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("keeps prepared preview documents off CDN fallbacks", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-player-no-cdn-"))
    try {
      mkdirSync(join(projectDir, "compositions"), { recursive: true })
      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html>",
          "<html>",
          "<head>",
          '<script src="https://cdn.jsdelivr.net/npm/@hyperframes/core/dist/hyperframe.runtime.iife.js"></script>',
          '<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>',
          "</head>",
          "<body><div data-composition-id=\"main\" data-width=\"1920\" data-height=\"1080\"></div></body>",
          "</html>",
        ].join(""),
      )
      writeFileSync(
        join(projectDir, "compositions", "title.html"),
        [
          "<template>",
          "<div data-composition-id=\"title\" data-width=\"1920\" data-height=\"1080\">Title</div>",
          "</template>",
        ].join(""),
      )

      const testProject = project({ localPath: projectDir, path: projectDir })
      const context: HyperframesProjectContext = {
        key: "project:project_1",
        projectId: testProject.id,
        project: testProject,
        projectPath: projectDir,
      }

      const root = await buildHyperframesPreparedPreviewDocument({
        context,
        filePath: "index.html",
        kind: "root",
      })
      expect(root).not.toContain("cdn.jsdelivr.net")
      expect(root).toContain("ripple-preview://project_1/__hyperframes/runtime.js")
      expect(root).toContain("ripple-preview://project_1/__hyperframes/gsap.min.js")

      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html>",
          "<html>",
          "<head><title>No GSAP in project head</title></head>",
          "<body><div data-composition-id=\"main\" data-width=\"1920\" data-height=\"1080\"></div></body>",
          "</html>",
        ].join(""),
      )

      const external = await buildHyperframesPreparedPreviewDocument({
        context,
        filePath: "compositions/title.html",
        kind: "external",
      })
      expect(external).not.toContain("cdn.jsdelivr.net")
      expect(external).toContain("ripple-preview://project_1/__hyperframes/runtime.js")
      expect(external).toContain("ripple-preview://project_1/__hyperframes/gsap.min.js")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("rebases nested composition, media, and font references for external previews", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-player-assets-"))
    try {
      mkdirSync(join(projectDir, "compositions", "cards"), { recursive: true })
      mkdirSync(join(projectDir, "compositions", "shared"), { recursive: true })
      mkdirSync(join(projectDir, "assets", "audio"), { recursive: true })
      mkdirSync(join(projectDir, "assets", "fonts"), { recursive: true })
      mkdirSync(join(projectDir, "assets", "images"), { recursive: true })
      mkdirSync(join(projectDir, "assets", "video"), { recursive: true })
      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html>",
          "<html>",
          "<head><script src=\"./assets/vendor/gsap.min.js\"></script></head>",
          "<body><div data-composition-id=\"main\" data-width=\"1920\" data-height=\"1080\"></div></body>",
          "</html>",
        ].join(""),
      )
      writeFileSync(
        join(projectDir, "compositions", "cards", "hero.html"),
        [
          "<template>",
          "<section data-composition-id=\"hero\" data-width=\"1920\" data-height=\"1080\">",
          "<style>",
          "@font-face { font-family: Display; src: url(\"../../assets/fonts/display.woff2\") format(\"woff2\"); }",
          ".backplate { background-image: url('../../assets/images/backplate.png'); }",
          "</style>",
          "<img src=\"../../assets/images/logo.svg\" />",
          "<video data-start=\"0\" data-duration=\"2\" src=\"../../assets/video/clip.webm\"></video>",
          "<audio data-start=\"0.5\" data-duration=\"1.5\"><source src=\"../../assets/audio/chime.mp3\" type=\"audio/mpeg\"></audio>",
          "<div data-composition-id=\"badge\" data-width=\"320\" data-height=\"120\" data-composition-src=\"../shared/badge.html\"></div>",
          "</section>",
          "</template>",
        ].join(""),
      )
      writeFileSync(
        join(projectDir, "compositions", "shared", "badge.html"),
        '<template><div data-composition-id="badge" data-width="320" data-height="120">Badge</div></template>',
      )

      const testProject = project({ localPath: projectDir, path: projectDir })
      const context: HyperframesProjectContext = {
        key: "project:project_1",
        projectId: testProject.id,
        project: testProject,
        projectPath: projectDir,
      }

      const external = await buildHyperframesPreparedPreviewDocument({
        context,
        filePath: "compositions/cards/hero.html",
        kind: "external",
      })

      expect(external).toContain('src="assets/images/logo.svg"')
      expect(external).toContain('src="assets/video/clip.webm"')
      expect(external).toContain('src="assets/audio/chime.mp3"')
      expect(external).toContain('url("assets/fonts/display.woff2")')
      expect(external).toContain("url('assets/images/backplate.png')")
      expect(external).toContain('data-composition-src="compositions/shared/badge.html"')
      expect(external).not.toContain("../../assets/")
      expect(external).not.toContain("../shared/badge.html")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("rebuilds prepared preview documents from current project files after edits", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-player-reload-"))
    try {
      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html>",
          "<html>",
          "<head><script src=\"./assets/vendor/gsap.min.js\"></script></head>",
          "<body><div data-composition-id=\"main\" data-width=\"1920\" data-height=\"1080\">Before edit</div></body>",
          "</html>",
        ].join(""),
      )

      const testProject = project({ localPath: projectDir, path: projectDir })
      const context: HyperframesProjectContext = {
        key: "project:project_1",
        projectId: testProject.id,
        project: testProject,
        projectPath: projectDir,
      }

      const before = await buildHyperframesPreparedPreviewDocument({
        context,
        filePath: "index.html",
        kind: "root",
      })
      expect(before).toContain("Before edit")

      writeFileSync(
        join(projectDir, "index.html"),
        [
          "<!doctype html>",
          "<html>",
          "<head><script src=\"./assets/vendor/gsap.min.js\"></script></head>",
          "<body><div data-composition-id=\"main\" data-width=\"1920\" data-height=\"1080\">After agent edit</div></body>",
          "</html>",
        ].join(""),
      )

      const after = await buildHyperframesPreparedPreviewDocument({
        context,
        filePath: "index.html",
        kind: "root",
      })
      expect(after).toContain("After agent edit")
      expect(after).not.toContain("Before edit")
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
