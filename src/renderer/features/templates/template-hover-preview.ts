import type { RippleTemplateView } from "../../../shared/hyperframes-templates"

export function templateHasHoverPreview(
  template: Pick<RippleTemplateView, "previewPosterDataUrl" | "previewVideoDataUrl">,
): boolean {
  return Boolean(template.previewVideoDataUrl || template.previewPosterDataUrl)
}

export function templateHasMotionPreview(
  template: Pick<RippleTemplateView, "previewVideoDataUrl">,
): boolean {
  return Boolean(template.previewVideoDataUrl)
}
