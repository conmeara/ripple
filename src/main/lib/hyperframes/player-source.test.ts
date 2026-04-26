import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Composition, Project } from "../db/schema"
import {
  buildHyperframesPlayerBaseHref,
  buildHyperframesPlayerRuntimeUrl,
  buildHyperframesPlayerSourceDocument,
  buildHyperframesPlayerSourceUrl,
  injectHyperframesPlayerDocumentChrome,
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
    expect(() => buildHyperframesPlayerSourceUrl({
      projectId: "project_1",
      filePath: "../secrets.html",
    })).toThrow("Path traversal")
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
    expect(loadHyperframesPlayerLegacyGsapSource("assets/vendor/gsap.min.js")).toBeNull()
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

      expect(source.srcDoc).toContain('<base href="ripple-preview://project_1/">')
      expect(source.srcDoc).toContain("ripple-preview://project_1/__hyperframes/runtime.js")
      expect(source.sourceUrl).toBe("ripple-preview://project_1/index.html")
      expect(source.width).toBe(1920)
      expect(source.height).toBe(1080)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
