export interface RippleShellRouteInput {
  canUseHyperframesProjectPane: boolean
  hasSelectedProject: boolean
  hasSelectedChat: boolean
  hasNewChatSurface?: boolean
  hasWorkspaceBoardView?: boolean
  hasDesktopView: boolean
}

export function getRippleShellMountKey(input: {
  chatSourceMode: string
  projectId: string
}): string {
  return `${input.chatSourceMode}-${input.projectId}`
}

export function shouldRenderRippleShell({
  canUseHyperframesProjectPane,
  hasSelectedProject,
  hasWorkspaceBoardView = false,
  hasDesktopView,
}: RippleShellRouteInput): boolean {
  return (
    canUseHyperframesProjectPane &&
    hasSelectedProject &&
    !hasWorkspaceBoardView &&
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
