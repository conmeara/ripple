import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Composition, Project } from "../db/schema"
import type { HyperframesProjectContext } from "./types"
import {
  buildHyperframesProjectBrowserModel,
  importHyperframesProjectAssets,
  scanHyperframesProjectAssets,
} from "./project-browser"

const tempDirs: string[] = []

function project(projectPath: string, overrides: Partial<Project> = {}): Project {
  return {
    id: "project_1",
    name: "Launch Film",
    slug: "launch-film",
    localPath: projectPath,
    path: projectPath,
    aspectRatioPreset: null,
    activeCompositionId: "lower_comp",
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
    name: "Index",
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

async function makeProjectDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ripple-project-browser-"))
  tempDirs.push(dir)
  await writeFile(join(dir, "index.html"), "<!doctype html>", "utf8")
  await writeFile(join(dir, "hyperframes.json"), "{}", "utf8")
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("HyperFrames project browser", () => {
  test("returns an empty asset list when the project has no assets folder", async () => {
    const projectDir = await makeProjectDir()

    await expect(scanHyperframesProjectAssets(context(projectDir))).resolves.toEqual([])
  })

  test("scans visible media assets and skips generated, unsupported, and symlinked files", async () => {
    const projectDir = await makeProjectDir()
    const outsideDir = await mkdtemp(join(tmpdir(), "ripple-project-browser-outside-"))
    tempDirs.push(outsideDir)

    await mkdir(join(projectDir, "assets", "images"), { recursive: true })
    await mkdir(join(projectDir, "assets", "video"), { recursive: true })
    await mkdir(join(projectDir, "assets", "vendor"), { recursive: true })
    await mkdir(join(projectDir, "assets", "data"), { recursive: true })
    await writeFile(join(projectDir, "assets", "images", "logo.png"), "image", "utf8")
    await writeFile(join(projectDir, "assets", "video", "hero.webm"), "video", "utf8")
    await writeFile(join(projectDir, "assets", "vendor", "gsap-lite.js"), "runtime", "utf8")
    await writeFile(join(projectDir, "assets", "data", "notes.json"), "{}", "utf8")
    await writeFile(join(outsideDir, "secret.png"), "secret", "utf8")
    await symlink(join(outsideDir, "secret.png"), join(projectDir, "assets", "images", "secret.png"))

    const assets = await scanHyperframesProjectAssets(context(projectDir))

    expect(assets.map((asset) => asset.relativePath)).toEqual([
      "assets/images/logo.png",
      "assets/video/hero.webm",
    ])
    expect(assets[0]).toMatchObject({
      kind: "image",
      mimeType: "image/png",
      previewUrl: "ripple-preview://project_1/assets/images/logo.png",
    })
    expect(assets[1]?.kind).toBe("video")
  })

  test("imports image, video, and audio assets through guarded project paths", async () => {
    const projectDir = await makeProjectDir()
    const sourceDir = await mkdtemp(join(tmpdir(), "ripple-project-browser-source-"))
    tempDirs.push(sourceDir)
    await mkdir(join(projectDir, "assets", "images"), { recursive: true })
    await writeFile(join(projectDir, "assets", "images", "hero.png"), "existing", "utf8")
    const heroSource = join(sourceDir, "hero.png")
    const audioSource = join(sourceDir, "theme.mp3")
    const notesSource = join(sourceDir, "notes.json")
    await writeFile(heroSource, "hero", "utf8")
    await writeFile(audioSource, "audio", "utf8")
    await writeFile(notesSource, "{}", "utf8")

    const result = await importHyperframesProjectAssets({
      context: context(projectDir),
      sourcePaths: [heroSource, audioSource, notesSource],
    })

    expect(result.imported.map((asset) => asset.relativePath)).toEqual([
      "assets/images/hero-2.png",
      "assets/audio/theme.mp3",
    ])
    expect(result.rejected).toEqual([
      {
        sourcePath: notesSource,
        reason: "Only image, video, and audio files can be imported.",
      },
    ])
    await expect(readFile(join(projectDir, "assets", "images", "hero.png"), "utf8"))
      .resolves.toBe("existing")
    await expect(readFile(join(projectDir, "assets", "images", "hero-2.png"), "utf8"))
      .resolves.toBe("hero")
    await expect(readFile(join(projectDir, "assets", "audio", "theme.mp3"), "utf8"))
      .resolves.toBe("audio")
  })

  test("does not import symlinked source files", async () => {
    const projectDir = await makeProjectDir()
    const sourceDir = await mkdtemp(join(tmpdir(), "ripple-project-browser-source-"))
    tempDirs.push(sourceDir)
    const realSource = join(sourceDir, "real.png")
    const linkedSource = join(sourceDir, "linked.png")
    await writeFile(realSource, "image", "utf8")
    await symlink(realSource, linkedSource)

    const result = await importHyperframesProjectAssets({
      context: context(projectDir),
      sourcePaths: [linkedSource],
    })

    expect(result.imported).toEqual([])
    expect(result.rejected).toEqual([
      {
        sourcePath: linkedSource,
        reason: "Linked files are not imported.",
      },
    ])
  })

  test("does not import through symlinked asset destination folders", async () => {
    const projectDir = await makeProjectDir()
    const sourceDir = await mkdtemp(join(tmpdir(), "ripple-project-browser-source-"))
    const outsideDir = await mkdtemp(join(tmpdir(), "ripple-project-browser-outside-"))
    tempDirs.push(sourceDir, outsideDir)
    await mkdir(join(projectDir, "assets"), { recursive: true })
    await symlink(outsideDir, join(projectDir, "assets", "images"))
    const sourcePath = join(sourceDir, "poster.png")
    await writeFile(sourcePath, "image", "utf8")

    const result = await importHyperframesProjectAssets({
      context: context(projectDir),
      sourcePaths: [sourcePath],
    })

    expect(result.imported).toEqual([])
    expect(result.rejected).toEqual([
      {
        sourcePath,
        reason: "Asset import destination contains a linked folder.",
      },
    ])
    await expect(readFile(join(outsideDir, "poster.png"), "utf8")).rejects.toThrow()
  })

  test("builds a project browser model with active composition and asset facts", async () => {
    const projectDir = await makeProjectDir()
    await mkdir(join(projectDir, "assets", "audio"), { recursive: true })
    await writeFile(join(projectDir, "assets", "audio", "theme.mp3"), "audio", "utf8")

    const model = await buildHyperframesProjectBrowserModel({
      context: context(projectDir),
      compositions: [
        composition(),
        composition({
          id: "lower_comp",
          name: "Lower Third",
          filePath: "compositions/lower-third.html",
          dataCompositionId: "lower-third",
          height: 240,
          kind: "external",
          parentCompositionId: "root_comp",
        }),
      ],
    })

    expect(model.project).toMatchObject({
      id: "project_1",
      name: "Launch Film",
      activeCompositionId: "lower_comp",
      setupStatus: "ready",
    })
    expect(model.compositions.map((item) => [item.id, item.isActive])).toEqual([
      ["lower_comp", true],
      ["root_comp", false],
    ])
    expect(model.assets.map((asset) => asset.relativePath)).toEqual([
      "assets/audio/theme.mp3",
    ])
  })
})
