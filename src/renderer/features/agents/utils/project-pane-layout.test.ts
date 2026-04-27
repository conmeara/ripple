import { describe, expect, test } from "bun:test"
import {
  resolveRippleProjectPaneHeaderControls,
  resolveRippleProjectPaneLayout,
} from "./project-pane-layout"

describe("Ripple project pane layout", () => {
  test("keeps the legacy chats pane hidden when a local project pane is closed", () => {
    expect(
      resolveRippleProjectPaneLayout({
        canShowHyperframesPreview: true,
        hasDesktopView: false,
        isProjectRailOpen: false,
        isMobile: false,
        isSubChatsSidebarOpen: true,
        projectPaneOpen: false,
      }),
    ).toEqual({
      canUseHyperframesProjectPane: true,
      isHyperframesProjectPaneOpen: false,
      showProjectRailOpenButton: false,
      shouldShowSubChatsSidebar: false,
    })

    expect(
      resolveRippleProjectPaneHeaderControls({
        chatSourceMode: "local",
        hasSelectedProject: true,
        isMobile: false,
        projectPaneOpen: false,
        subChatsSidebarMode: "tabs",
      }),
    ).toEqual({
      showChatTabControls: true,
      showProjectPaneOpenButton: true,
      showSubChatsPaneOpenButton: false,
    })
  })

  test("preserves the old chats pane controls outside Ripple local projects", () => {
    expect(
      resolveRippleProjectPaneLayout({
        canShowHyperframesPreview: false,
        hasDesktopView: false,
        isProjectRailOpen: false,
        isMobile: false,
        isSubChatsSidebarOpen: true,
        projectPaneOpen: false,
      }),
    ).toEqual({
      canUseHyperframesProjectPane: false,
      isHyperframesProjectPaneOpen: false,
      showProjectRailOpenButton: false,
      shouldShowSubChatsSidebar: true,
    })

    expect(
      resolveRippleProjectPaneHeaderControls({
        chatSourceMode: "sandbox",
        hasSelectedProject: false,
        isMobile: false,
        projectPaneOpen: false,
        subChatsSidebarMode: "tabs",
      }),
    ).toEqual({
      showChatTabControls: true,
      showProjectPaneOpenButton: false,
      showSubChatsPaneOpenButton: true,
    })
  })

  test("keeps chat tab controls visible when the project pane replaces the chats pane", () => {
    expect(
      resolveRippleProjectPaneHeaderControls({
        chatSourceMode: "local",
        hasSelectedProject: true,
        isMobile: false,
        projectPaneOpen: true,
        subChatsSidebarMode: "sidebar",
      }),
    ).toEqual({
      showChatTabControls: true,
      showProjectPaneOpenButton: false,
      showSubChatsPaneOpenButton: false,
    })
  })

  test("shows a project rail recovery button while the local project pane is visible", () => {
    expect(
      resolveRippleProjectPaneLayout({
        canShowHyperframesPreview: true,
        hasDesktopView: false,
        isProjectRailOpen: false,
        isMobile: false,
        isSubChatsSidebarOpen: false,
        projectPaneOpen: true,
      }),
    ).toMatchObject({
      isHyperframesProjectPaneOpen: true,
      showProjectRailOpenButton: true,
    })

    expect(
      resolveRippleProjectPaneLayout({
        canShowHyperframesPreview: true,
        hasDesktopView: false,
        isProjectRailOpen: true,
        isMobile: false,
        isSubChatsSidebarOpen: false,
        projectPaneOpen: true,
      }).showProjectRailOpenButton,
    ).toBe(false)
  })
})
