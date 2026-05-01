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
