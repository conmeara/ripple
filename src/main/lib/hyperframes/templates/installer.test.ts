import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Project } from "../../db/schema"
import type { HyperframesProjectContext } from "../types"
import { installCompositionTemplateFiles } from "./installer"

const tempDirs: string[] = []

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project_1",
    name: "Template Test",
    slug: "template-test",
    localPath: "/tmp/template-test",
    path: "/tmp/template-test",
    aspectRatioPreset: "wide-16-9",
    activeCompositionId: null,
    templateId: "blank",
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

async function makeContext(): Promise<HyperframesProjectContext> {
  const projectPath = await mkdtemp(join(tmpdir(), "ripple-template-install-"))
  tempDirs.push(projectPath)

  await mkdir(join(projectPath, "assets", "vendor"), { recursive: true })
  await writeFile(
    join(projectPath, "index.html"),
    '<!doctype html><main data-composition-id="main" data-width="1920" data-height="1080"></main>',
    "utf8",
  )
  await writeFile(
    join(projectPath, "hyperframes.json"),
    JSON.stringify({
      name: "Template Test",
      entry: "index.html",
      width: 1920,
      height: 1080,
      fps: 30,
      compositions: ["index.html"],
    }, null, 2),
    "utf8",
  )

  const testProject = project({ localPath: projectPath, path: projectPath })
  return {
    key: `project:${testProject.id}`,
    projectId: testProject.id,
    project: testProject,
    projectPath,
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("Ripple composition template installer", () => {
  test("creates the default blank composition from the composition source", async () => {
    const context = await makeContext()
    const indexBefore = await readFile(join(context.projectPath, "index.html"), "utf8")

    const result = await installCompositionTemplateFiles({
      context,
      templateId: "blank",
    })

    expect(result).toMatchObject({
      filePath: "compositions/blank.html",
      dataCompositionId: "blank",
    })
    expect(await readFile(join(context.projectPath, "index.html"), "utf8")).toBe(indexBefore)

    const compositionHtml = await readFile(
      join(context.projectPath, result.filePath),
      "utf8",
    )
    expect(compositionHtml).toContain('data-composition-id="blank"')
    expect(compositionHtml).toContain("../assets/vendor/gsap.min.js")
    expect(compositionHtml).toContain('window.__timelines["blank"]')
    expect(compositionHtml).not.toContain("ripple-template-stage")

    const metadata = JSON.parse(
      await readFile(join(context.projectPath, "hyperframes.json"), "utf8"),
    )
    expect(metadata.compositions).toContainEqual({
      name: "Blank",
      filePath: "compositions/blank.html",
      dataCompositionId: "blank",
      width: 1920,
      height: 1080,
      kind: "external",
      parentDataCompositionId: "main",
    })
  })

  test("creates a reusable composition without patching index.html", async () => {
    const context = await makeContext()
    const indexBefore = await readFile(join(context.projectPath, "index.html"), "utf8")

    const result = await installCompositionTemplateFiles({
      context,
      templateId: "yt-lower-third",
    })

    expect(result).toMatchObject({
      filePath: "compositions/yt-lower-third.html",
      dataCompositionId: "yt-lower-third",
    })
    expect(await readFile(join(context.projectPath, "index.html"), "utf8")).toBe(indexBefore)
    await stat(join(context.projectPath, "assets", "vendor", "gsap.min.js"))

    const compositionHtml = await readFile(
      join(context.projectPath, result.filePath),
      "utf8",
    )
    expect(compositionHtml).toContain('data-composition-id="yt-lower-third"')
    expect(compositionHtml).toContain('data-width="1920"')
    expect(compositionHtml).toContain('data-height="1080"')
    expect(compositionHtml).toContain('class="clip lower-third"')
    expect(compositionHtml).toContain("../assets/vendor/gsap.min.js")
    expect(compositionHtml).toContain("assets/hyperframes-catalog/yt-lower-third/avatar.jpg")
    expect(compositionHtml).toContain('window.__timelines["yt-lower-third"]')
    expect(compositionHtml).not.toContain("https://")
    expect(compositionHtml).not.toContain("http://")
    await stat(join(context.projectPath, "assets", "hyperframes-catalog", "yt-lower-third", "avatar.jpg"))

    const metadata = JSON.parse(
      await readFile(join(context.projectPath, "hyperframes.json"), "utf8"),
    )
    expect(metadata.compositions).toContain("index.html")
    expect(metadata.compositions).toContainEqual({
      name: "YouTube Lower Third",
      filePath: "compositions/yt-lower-third.html",
      dataCompositionId: "yt-lower-third",
      width: 1920,
      height: 1080,
      kind: "external",
      parentDataCompositionId: "main",
    })
  })

  test("uses stable collision suffixes for repeated composition templates", async () => {
    const context = await makeContext()

    await installCompositionTemplateFiles({ context, templateId: "logo-outro" })
    const second = await installCompositionTemplateFiles({ context, templateId: "logo-outro" })

    expect(second).toMatchObject({
      filePath: "compositions/logo-outro-2.html",
      dataCompositionId: "logo-outro-2",
    })
    await stat(join(context.projectPath, "compositions", "logo-outro.html"))
    await stat(join(context.projectPath, "compositions", "logo-outro-2.html"))
  })

  test("installs component catalog items as previewable compositions with snippets", async () => {
    const context = await makeContext()

    const result = await installCompositionTemplateFiles({
      context,
      templateId: "grain-overlay",
    })

    expect(result).toMatchObject({
      filePath: "compositions/grain-overlay.html",
      dataCompositionId: "grain-overlay",
    })

    const compositionHtml = await readFile(
      join(context.projectPath, result.filePath),
      "utf8",
    )
    expect(compositionHtml).toContain('data-composition-id="grain-overlay"')
    expect(compositionHtml).toContain("../assets/vendor/gsap.min.js")
    expect(compositionHtml).toContain('window.__timelines["grain-overlay"]')
    expect(compositionHtml).not.toContain("https://")
    expect(compositionHtml).not.toContain("http://")
    await stat(join(context.projectPath, "compositions", "components", "grain-overlay.html"))
  })
})
