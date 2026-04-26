export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export const ZOOM_OPTIONS = [
  { value: "fit", label: "Fit" },
  { value: "50", label: "50%" },
  { value: "75", label: "75%" },
  { value: "100", label: "100%" },
  { value: "125", label: "125%" },
  { value: "150", label: "150%" },
] as const

export const PREVIEW_SETTINGS_CONTROLS = [
  "zoom",
  "reload-preview",
] as const

export type ZoomValue = (typeof ZOOM_OPTIONS)[number]["value"]
export type PreviewSettingsControl = (typeof PREVIEW_SETTINGS_CONTROLS)[number]

export function shouldRenderPreviewCloseControl(
  onClose: (() => void) | null | undefined,
): boolean {
  return typeof onClose === "function"
}
