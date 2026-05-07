import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { listRippleTemplateViews } from "../../../main/lib/hyperframes/templates/catalog"
import { templateHasHoverPreview, templateHasMotionPreview } from "./template-hover-preview"

const repoRoot = process.cwd()
const bundleRoot = join(repoRoot, "resources", "hyperframes-templates")

describe("template hover previews", () => {
  test("every selectable template has a hover preview source", async () => {
    const templates = await listRippleTemplateViews({ bundleRoot })

    expect(templates).toHaveLength(47)
    expect(templates.every(templateHasHoverPreview)).toBe(true)
    expect(templates.every(templateHasMotionPreview)).toBe(true)
    expect(templates.every((template) => template.previewVideoPath)).toBe(true)
    expect(templates.every((template) => template.previewVideoDataUrl)).toBe(true)
  })

  test("template cards expose hover and focus motion preview hooks", async () => {
    const componentSource = await readFile(
      join(repoRoot, "src/renderer/features/templates/TemplateChooserDialog.tsx"),
      "utf8",
    )
    const cssSource = await readFile(
      join(repoRoot, "src/renderer/styles/globals.css"),
      "utf8",
    )

    expect(componentSource).toContain("template-hover-preview-active")
    expect(componentSource).toContain("template-hover-preview-video")
    expect(componentSource).toContain("video.play()")
    expect(componentSource).toContain("requestAnimationFrame")
    expect(componentSource).toContain("timelineProgressRef")
    expect(componentSource).toContain("template-hover-preview-timeline")
    expect(cssSource).toContain("@keyframes template-preview-pan")
    expect(cssSource).toContain("--template-preview-progress")
    expect(cssSource).toContain("template-hover-preview-progress-fallback")
    expect(cssSource).toContain(".group:hover .template-hover-preview-active")
    expect(cssSource).toContain(".group:focus-visible .template-hover-preview-active")
    expect(cssSource).toContain("@media (prefers-reduced-motion: reduce)")
  })

  test("New Project templates use actual catalog posters and preview videos", async () => {
    const templates = await listRippleTemplateViews({
      target: "new-project",
      bundleRoot,
    })

    expect(templates).toHaveLength(47)
    expect(templates.every(templateHasMotionPreview)).toBe(true)
    expect(templates.some((template) => template.id === "yt-lower-third")).toBe(true)
    expect(templates.some((template) => template.id === "warm-grain")).toBe(false)
    expect(templates.every((template) => template.previewPosterPath.endsWith(".png"))).toBe(true)
  })

  test("Logo Outro uses the active Ripple tray mark", async () => {
    const source = await readFile(
      join(bundleRoot, "catalog/logo-outro/logo-outro.html"),
      "utf8",
    )

    expect(source).toContain('aria-label="Ripple logo"')
    expect(source).toContain("M197 213L139 280L197 347")
    expect(source).toContain("M363 213L421 280L363 347")
    expect(source).toContain('x="262" y="84" width="36" height="392"')
    expect(source).not.toContain("figma.com")
    expect(source).not.toContain("#F24E1E")
  })
})
