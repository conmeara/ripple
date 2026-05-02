export const rippleTemplateTargets = ["new-project", "new-composition"] as const
export type RippleTemplateTarget = (typeof rippleTemplateTargets)[number]

export const rippleTemplateCategories = [
  "Blank",
  "Project Starters",
  "Social Overlays",
  "Shader Transitions",
  "CSS Transitions",
  "Showcases",
  "Social",
  "Product",
  "Data",
  "Title Cards",
  "Lower Thirds",
  "Brand",
  "Overlays",
  "Effects",
  "Blocks",
] as const
export type RippleTemplateCategory = (typeof rippleTemplateCategories)[number]

export const rippleTemplateSourceKinds = [
  "ripple-blank",
  "official-example",
  "official-block",
  "official-component",
] as const
export type RippleTemplateSourceKind = (typeof rippleTemplateSourceKinds)[number]

export interface RippleTemplateVisual {
  eyebrow: string
  title: string
  subtitle: string
  background: string
  surface: string
  accent: string
  ink: string
  secondary: string
  motif: "minimal" | "grain" | "burst" | "grid" | "type" | "diagram" | "product" | "chart" | "card"
}

export interface RippleTemplateBundleFile {
  source: string
  target: string
  type: "composition" | "asset" | "metadata" | "snippet"
}

export interface RippleTemplateDefinition {
  id: string
  name: string
  description: string
  category: RippleTemplateCategory
  sourceKind: RippleTemplateSourceKind
  supportedTargets: RippleTemplateTarget[]
  width: number
  height: number
  fps: number
  durationSeconds: number
  previewPosterPath: string
  previewVideoPath?: string | null
  sourceUrl: string
  license: string
  compatibility: string
  version: string
  sourceFiles: RippleTemplateBundleFile[]
  requiredAssets: string[]
  visual: RippleTemplateVisual
}

export interface RippleTemplateManifest {
  version: string
  generatedAt: string
  templates: RippleTemplateDefinition[]
}

export interface RippleTemplateView extends RippleTemplateDefinition {
  aspectRatioLabel: string
  durationLabel: string
  previewPosterDataUrl: string | null
  previewVideoDataUrl: string | null
}

export function isRippleTemplateTarget(value: string): value is RippleTemplateTarget {
  return rippleTemplateTargets.includes(value as RippleTemplateTarget)
}

export function templateSupportsTarget(
  template: Pick<RippleTemplateDefinition, "supportedTargets">,
  target: RippleTemplateTarget,
): boolean {
  return template.supportedTargets.includes(target)
}

export function formatTemplateAspectRatio(width: number, height: number): string {
  if (width === height) return "1:1"
  if (width > height) return "16:9"
  return "9:16"
}

export function formatTemplateDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s"
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
}

export function toRippleTemplateView(
  template: RippleTemplateDefinition,
  previewPosterDataUrl: string | null,
  previewVideoDataUrl: string | null,
): RippleTemplateView {
  return {
    ...template,
    aspectRatioLabel: formatTemplateAspectRatio(template.width, template.height),
    durationLabel: formatTemplateDuration(template.durationSeconds),
    previewPosterDataUrl,
    previewVideoDataUrl,
  }
}

export function sortRippleTemplates(
  templates: RippleTemplateDefinition[],
  target?: RippleTemplateTarget,
): RippleTemplateDefinition[] {
  return [...templates]
    .filter((template) => !target || templateSupportsTarget(template, target))
    .sort((a, b) => {
      if (a.id === "blank") return -1
      if (b.id === "blank") return 1
      return a.name.localeCompare(b.name)
    })
}
