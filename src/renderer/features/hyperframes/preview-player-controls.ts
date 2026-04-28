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

export interface PreviewPlaybackKeyboardShortcutEvent {
  key?: string
  code?: string
  repeat?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  defaultPrevented?: boolean
  target?: EventTarget | null
}

const PREVIEW_SPACEBAR_RESERVED_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "button",
  "a[href]",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='menuitem']",
  "[role='option']",
  "[role='radio']",
  "[role='searchbox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  "[role='textbox']",
  "[data-preview-spacebar-ignore]",
].join(",")

export function shouldRenderPreviewCloseControl(
  onClose: (() => void) | null | undefined,
): boolean {
  return typeof onClose === "function"
}

function getTargetElement(target: EventTarget | null | undefined): Element | null {
  if (!target || typeof target !== "object") return null

  const candidate = target as Partial<Element> & {
    parentElement?: Element | null
  }

  if (typeof candidate.closest === "function") {
    return candidate as Element
  }

  const parentElement = candidate.parentElement
  return parentElement && typeof parentElement.closest === "function"
    ? parentElement
    : null
}

function isReservedSpacebarTarget(target: EventTarget | null | undefined): boolean {
  const maybeEditable = target as { isContentEditable?: boolean } | null | undefined
  if (maybeEditable?.isContentEditable) return true

  return Boolean(
    getTargetElement(target)?.closest(PREVIEW_SPACEBAR_RESERVED_TARGET_SELECTOR),
  )
}

export function shouldTogglePreviewPlaybackForSpacebar(
  event: PreviewPlaybackKeyboardShortcutEvent,
): boolean {
  const isSpacebar = event.code === "Space" || event.key === " " || event.key === "Spacebar"
  if (!isSpacebar) return false
  if (event.defaultPrevented || event.repeat) return false
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false

  return !isReservedSpacebarTarget(event.target)
}
