import { describe, expect, test } from "bun:test"
import { stat } from "node:fs/promises"
import { join } from "node:path"
import {
  getRippleTemplateForTarget,
  loadRippleTemplateCatalog,
  listRippleTemplateViews,
  resolveTemplateBundlePath,
} from "./catalog"

const bundleRoot = join(process.cwd(), "resources", "hyperframes-templates")

describe("Ripple template catalog", () => {
  test("loads a validated offline bundle with Blank first", async () => {
    const catalog = await loadRippleTemplateCatalog({ bundleRoot })

    expect(catalog.manifest.version).toBeTruthy()
    expect(catalog.templates.length).toBe(47)
    expect(catalog.templates[0]?.id).toBe("blank")

    const ids = new Set(catalog.templates.map((template) => template.id))
    expect(ids.size).toBe(catalog.templates.length)
    const previewPosterPaths = new Set(catalog.templates.map((template) => template.previewPosterPath))
    expect(previewPosterPaths.size).toBe(catalog.templates.length)
    const previewVideoPaths = new Set(catalog.templates.map((template) => template.previewVideoPath))
    expect(previewVideoPaths.size).toBe(catalog.templates.length)
    expect(previewPosterPaths.has("previews/template-poster.svg")).toBe(false)
    expect(previewVideoPaths.has(null)).toBe(false)
    expect(ids.has("apple-money-count")).toBe(true)
    expect(ids.has("grain-overlay")).toBe(true)
    expect(ids.has("chromatic-radial-split")).toBe(true)
    expect(ids.has("transitions-scale")).toBe(true)

    for (const template of catalog.templates) {
      expect(template.width).toBeGreaterThan(0)
      expect(template.height).toBeGreaterThan(0)
      expect(template.durationSeconds).toBeGreaterThan(0)
      await stat(resolveTemplateBundlePath(catalog.root, template.previewPosterPath))
      expect(template.previewVideoPath).toBeTruthy()
      await stat(resolveTemplateBundlePath(catalog.root, template.previewVideoPath ?? ""))
      for (const file of template.sourceFiles) {
        await stat(resolveTemplateBundlePath(catalog.root, file.source))
      }
    }
  })

  test("filters templates by supported target", async () => {
    const projectTemplates = await listRippleTemplateViews({
      target: "new-project",
      bundleRoot,
    })
    const compositionTemplates = await listRippleTemplateViews({
      target: "new-composition",
      bundleRoot,
    })

    expect(projectTemplates[0]?.id).toBe("blank")
    expect(compositionTemplates[0]?.id).toBe("blank")
    expect(projectTemplates).toHaveLength(47)
    expect(compositionTemplates).toHaveLength(47)
    expect(projectTemplates.some((template) => template.id === "warm-grain")).toBe(false)
    expect(projectTemplates.some((template) => template.id === "yt-lower-third")).toBe(true)
    expect(compositionTemplates.some((template) => template.id === "yt-lower-third")).toBe(true)
    expect(compositionTemplates.some((template) => template.id === "grain-overlay")).toBe(true)
    expect(compositionTemplates.some((template) => template.id === "apple-money-count")).toBe(true)
    expect(compositionTemplates.some((template) => template.id === "warm-grain")).toBe(false)
    expect(projectTemplates.every((template) => template.previewPosterDataUrl)).toBe(true)
    expect(projectTemplates.every((template) => template.previewVideoDataUrl)).toBe(true)
    expect(compositionTemplates.every((template) => template.previewPosterDataUrl)).toBe(true)
    expect(compositionTemplates.every((template) => template.previewVideoDataUrl)).toBe(true)
  })

  test("rejects removed generic project-starter ids", async () => {
    await expect(
      getRippleTemplateForTarget({
        templateId: "warm-grain",
        target: "new-project",
        bundleRoot,
      }),
    ).rejects.toThrow("not available")
  })
})
