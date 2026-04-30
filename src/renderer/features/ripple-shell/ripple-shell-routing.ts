export interface RippleShellRouteInput {
  canUseHyperframesProjectPane: boolean
  hasSelectedProject: boolean
  hasSelectedChat: boolean
  hasNewChatSurface?: boolean
  hasDesktopView: boolean
}

export function shouldRenderRippleShell({
  canUseHyperframesProjectPane,
  hasSelectedProject,
  hasDesktopView,
}: RippleShellRouteInput): boolean {
  return (
    canUseHyperframesProjectPane &&
    hasSelectedProject &&
    !hasDesktopView
  )
}

export function shouldShowTrafficLightsForRippleShell({
  sidebarOpen,
  shouldUseRippleShell,
}: {
  sidebarOpen: boolean
  shouldUseRippleShell: boolean
}): boolean {
  return sidebarOpen || shouldUseRippleShell
}
