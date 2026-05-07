export type RippleRightPaneMode =
  | "chat"
  | "comments"
  | "renders"
  | "details"
  | "files"
  | "changes"
  | "plan"
  | "terminal"
  | "mcp"

export type RippleShellPanel = "assets" | "center" | "review"

export type RippleRightPaneContentKind = "chat" | "comments" | "utility"

export type RippleShellShortcut =
  | "toggle-assets"
  | "toggle-center"
  | "toggle-review"
  | "show-chat"
  | "show-comments"

export interface RippleShellState {
  assetsPanelOpen: boolean
  centerStageOpen: boolean
  reviewPaneOpen: boolean
  rightPaneMode: RippleRightPaneMode
}

export const RIPPLE_PANEL_ANIMATION_SECONDS = 0.18
export const RIPPLE_CENTER_REVIEW_DIVIDER_WIDTH = 1
export const RIPPLE_CENTER_STAGE_MIN_WIDTH = 420
export const RIPPLE_CENTER_STAGE_COMPACT_MIN_WIDTH = 240
export const RIPPLE_REVIEW_PANE_MIN_WIDTH = 300
export const RIPPLE_REVIEW_PANE_MAX_WIDTH = 520
export const RIPPLE_REVIEW_PANE_DEFAULT_WIDTH = 360

export const RIPPLE_REVIEW_MODES = ["chat", "comments"] as const

export const RIPPLE_UTILITY_MODES = [
  "details",
  "files",
  "changes",
  "plan",
  "terminal",
  "mcp",
] as const satisfies readonly RippleRightPaneMode[]

export type RippleUtilityMode = (typeof RIPPLE_UTILITY_MODES)[number]

export const defaultRippleShellState: RippleShellState = {
  assetsPanelOpen: true,
  centerStageOpen: true,
  reviewPaneOpen: true,
  rightPaneMode: "chat",
}

export function isRippleRightPaneMode(value: unknown): value is RippleRightPaneMode {
  return (
    value === "chat" ||
    value === "comments" ||
    value === "renders" ||
    value === "details" ||
    value === "files" ||
    value === "changes" ||
    value === "plan" ||
    value === "terminal" ||
    value === "mcp"
  )
}

export function isRippleUtilityMode(
  value: unknown,
): value is RippleUtilityMode {
  return RIPPLE_UTILITY_MODES.includes(value as RippleUtilityMode)
}

export function getRippleRightPaneContentKind(
  mode: RippleRightPaneMode,
): RippleRightPaneContentKind {
  if (mode === "chat") return "chat"
  if (mode === "comments") return "comments"
  return "utility"
}

export function getRippleReviewContentKey(
  chatId: string,
  mode: RippleRightPaneMode,
): string {
  const contentKind = getRippleRightPaneContentKind(mode)
  if (contentKind === "utility") {
    return `ripple-review-${chatId}:utility:${mode}`
  }

  return `ripple-review-${chatId}:review`
}

export function resolveRippleShellState(
  input: Partial<RippleShellState> | null | undefined,
): RippleShellState {
  if (!input) return defaultRippleShellState

  return {
    assetsPanelOpen:
      typeof input.assetsPanelOpen === "boolean"
        ? input.assetsPanelOpen
        : defaultRippleShellState.assetsPanelOpen,
    centerStageOpen:
      typeof input.centerStageOpen === "boolean"
        ? input.centerStageOpen
        : defaultRippleShellState.centerStageOpen,
    reviewPaneOpen:
      typeof input.reviewPaneOpen === "boolean"
        ? input.reviewPaneOpen
        : defaultRippleShellState.reviewPaneOpen,
    rightPaneMode: isRippleRightPaneMode(input.rightPaneMode)
      ? input.rightPaneMode
      : defaultRippleShellState.rightPaneMode,
  }
}

export function toggleRippleShellPanel(
  state: RippleShellState,
  panel: RippleShellPanel,
): RippleShellState {
  const resolved = resolveRippleShellState(state)

  if (panel === "assets") {
    return {
      ...resolved,
      assetsPanelOpen: !resolved.assetsPanelOpen,
    }
  }

  if (panel === "center") {
    return {
      ...resolved,
      centerStageOpen: !resolved.centerStageOpen,
    }
  }

  return {
    ...resolved,
    reviewPaneOpen: !resolved.reviewPaneOpen,
  }
}

export function setRippleRightPaneMode(
  state: RippleShellState,
  mode: RippleRightPaneMode,
): RippleShellState {
  return {
    ...resolveRippleShellState(state),
    reviewPaneOpen: true,
    rightPaneMode: mode,
  }
}

export function applyRippleShellShortcut(
  state: RippleShellState,
  shortcut: RippleShellShortcut,
): RippleShellState {
  switch (shortcut) {
    case "toggle-assets":
      return toggleRippleShellPanel(state, "assets")
    case "toggle-center":
      return toggleRippleShellPanel(state, "center")
    case "toggle-review":
      return toggleRippleShellPanel(state, "review")
    case "show-chat":
      return setRippleRightPaneMode(state, "chat")
    case "show-comments":
      return setRippleRightPaneMode(state, "comments")
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return max
  return Math.max(min, Math.min(max, value))
}

export function getRippleReviewPaneWidthBounds(
  containerWidth?: number,
): { min: number; max: number } {
  if (
    typeof containerWidth !== "number" ||
    !Number.isFinite(containerWidth) ||
    containerWidth <= 0
  ) {
    return {
      min: RIPPLE_REVIEW_PANE_MIN_WIDTH,
      max: RIPPLE_REVIEW_PANE_MAX_WIDTH,
    }
  }

  const availableWidth = Math.max(
    0,
    containerWidth - RIPPLE_CENTER_REVIEW_DIVIDER_WIDTH,
  )
  if (availableWidth <= 0) return { min: 0, max: 0 }

  const roomyMax = Math.min(
    RIPPLE_REVIEW_PANE_MAX_WIDTH,
    availableWidth - RIPPLE_CENTER_STAGE_MIN_WIDTH,
  )
  if (roomyMax >= RIPPLE_REVIEW_PANE_MIN_WIDTH) {
    return {
      min: RIPPLE_REVIEW_PANE_MIN_WIDTH,
      max: roomyMax,
    }
  }

  const compactCenterMin = Math.min(
    RIPPLE_CENTER_STAGE_MIN_WIDTH,
    Math.max(
      RIPPLE_CENTER_STAGE_COMPACT_MIN_WIDTH,
      availableWidth * 0.55,
    ),
  )
  const compactMax = Math.max(0, availableWidth - compactCenterMin)
  const compactMin = Math.min(RIPPLE_REVIEW_PANE_MIN_WIDTH, compactMax)

  return {
    min: compactMin,
    max: compactMax,
  }
}

export function clampRippleReviewPaneWidth({
  width,
  containerWidth,
}: {
  width: number
  containerWidth?: number
}): number {
  const bounds = getRippleReviewPaneWidthBounds(containerWidth)
  return clampNumber(width, bounds.min, bounds.max)
}

export function getRippleCenterReviewLayout({
  containerWidth,
  reviewPaneWidth,
  centerStageOpen,
  reviewPaneOpen,
}: {
  containerWidth: number
  reviewPaneWidth: number
  centerStageOpen: boolean
  reviewPaneOpen: boolean
}): {
  centerWidth: number
  reviewWidth: number
  dividerWidth: number
} {
  const width = Math.max(0, containerWidth)

  if (!centerStageOpen && !reviewPaneOpen) {
    return { centerWidth: 0, reviewWidth: 0, dividerWidth: 0 }
  }

  if (centerStageOpen && !reviewPaneOpen) {
    return { centerWidth: width, reviewWidth: 0, dividerWidth: 0 }
  }

  if (!centerStageOpen && reviewPaneOpen) {
    return { centerWidth: 0, reviewWidth: width, dividerWidth: 0 }
  }

  const dividerWidth = Math.min(RIPPLE_CENTER_REVIEW_DIVIDER_WIDTH, width)
  const reviewWidth = clampRippleReviewPaneWidth({
    width: reviewPaneWidth,
    containerWidth: width,
  })
  const centerWidth = Math.max(0, width - dividerWidth - reviewWidth)

  return {
    centerWidth,
    reviewWidth,
    dividerWidth,
  }
}
