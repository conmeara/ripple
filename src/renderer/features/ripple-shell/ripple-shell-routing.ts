export interface RippleShellRouteInput {
  canUseHyperframesProjectPane: boolean
  hasSelectedProject: boolean
  hasSelectedChat: boolean
  hasDesktopView: boolean
}

export function shouldRenderRippleShell({
  canUseHyperframesProjectPane,
  hasSelectedProject,
  hasSelectedChat,
  hasDesktopView,
}: RippleShellRouteInput): boolean {
  return (
    canUseHyperframesProjectPane &&
    hasSelectedProject &&
    hasSelectedChat &&
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
