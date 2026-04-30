export interface RippleProjectPaneLayoutInput {
  canShowHyperframesPreview: boolean
  hasDesktopView: boolean
  isProjectRailOpen: boolean
  isMobile: boolean
  isSubChatsSidebarOpen: boolean
  projectPaneOpen: boolean
  shouldSuppressProjectPane?: boolean
}

export interface RippleProjectPaneLayout {
  canUseHyperframesProjectPane: boolean
  isHyperframesProjectPaneOpen: boolean
  showProjectRailOpenButton: boolean
  shouldShowSubChatsSidebar: boolean
}

export function resolveRippleProjectPaneLayout({
  canShowHyperframesPreview,
  hasDesktopView,
  isProjectRailOpen,
  isMobile,
  isSubChatsSidebarOpen,
  projectPaneOpen,
  shouldSuppressProjectPane = false,
}: RippleProjectPaneLayoutInput): RippleProjectPaneLayout {
  const canUseHyperframesProjectPane =
    canShowHyperframesPreview && !isMobile && !hasDesktopView
  const isHyperframesProjectPaneOpen =
    canUseHyperframesProjectPane && projectPaneOpen && !shouldSuppressProjectPane

  return {
    canUseHyperframesProjectPane,
    isHyperframesProjectPaneOpen,
    showProjectRailOpenButton:
      isHyperframesProjectPaneOpen && !isProjectRailOpen,
    shouldShowSubChatsSidebar:
      !canUseHyperframesProjectPane && isSubChatsSidebarOpen,
  }
}

export interface RippleProjectPaneHeaderControlsInput {
  chatSourceMode: string
  hasSelectedProject: boolean
  isMobile: boolean
  projectPaneOpen: boolean
  subChatsSidebarMode: "tabs" | "sidebar"
}

export interface RippleProjectPaneHeaderControls {
  showChatTabControls: boolean
  showProjectPaneOpenButton: boolean
  showSubChatsPaneOpenButton: boolean
}

export function resolveRippleProjectPaneHeaderControls({
  chatSourceMode,
  hasSelectedProject,
  isMobile,
  projectPaneOpen,
  subChatsSidebarMode,
}: RippleProjectPaneHeaderControlsInput): RippleProjectPaneHeaderControls {
  const isRippleProjectContext = chatSourceMode === "local" && hasSelectedProject

  return {
    showChatTabControls:
      isMobile ||
      (!isMobile && (subChatsSidebarMode === "tabs" || isRippleProjectContext)),
    showProjectPaneOpenButton:
      !isMobile &&
      isRippleProjectContext &&
      !projectPaneOpen,
    showSubChatsPaneOpenButton:
      !isMobile &&
      subChatsSidebarMode === "tabs" &&
      chatSourceMode !== "local",
  }
}
