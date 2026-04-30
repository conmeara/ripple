import { describe, expect, test } from "bun:test"
import {
  shouldRenderRippleShell,
  shouldShowTrafficLightsForRippleShell,
} from "./ripple-shell-routing"

describe("Ripple shell routing", () => {
  test("uses the Ripple shell only for selected local motion projects", () => {
    expect(
      shouldRenderRippleShell({
        canUseHyperframesProjectPane: true,
        hasSelectedProject: true,
        hasSelectedChat: true,
        hasNewChatSurface: false,
        hasDesktopView: false,
      }),
    ).toBe(true)

    expect(
      shouldRenderRippleShell({
        canUseHyperframesProjectPane: false,
        hasSelectedProject: true,
        hasSelectedChat: true,
        hasNewChatSurface: false,
        hasDesktopView: false,
      }),
    ).toBe(false)

    expect(
      shouldRenderRippleShell({
        canUseHyperframesProjectPane: true,
        hasSelectedProject: false,
        hasSelectedChat: true,
        hasNewChatSurface: false,
        hasDesktopView: false,
      }),
    ).toBe(false)

    expect(
      shouldRenderRippleShell({
        canUseHyperframesProjectPane: true,
        hasSelectedProject: true,
        hasSelectedChat: false,
        hasNewChatSurface: false,
        hasDesktopView: false,
      }),
    ).toBe(true)

    expect(
      shouldRenderRippleShell({
        canUseHyperframesProjectPane: true,
        hasSelectedProject: true,
        hasSelectedChat: true,
        hasNewChatSurface: false,
        hasDesktopView: true,
      }),
    ).toBe(false)
  })

  test("does not require a legacy chat or draft to show the project shell", () => {
    expect(
      shouldRenderRippleShell({
        canUseHyperframesProjectPane: true,
        hasSelectedProject: true,
        hasSelectedChat: false,
        hasNewChatSurface: true,
        hasDesktopView: false,
      }),
    ).toBe(true)
  })

  test("keeps macOS traffic lights visible for the Ripple shell", () => {
    expect(
      shouldShowTrafficLightsForRippleShell({
        sidebarOpen: false,
        shouldUseRippleShell: true,
      }),
    ).toBe(true)

    expect(
      shouldShowTrafficLightsForRippleShell({
        sidebarOpen: true,
        shouldUseRippleShell: false,
      }),
    ).toBe(true)

    expect(
      shouldShowTrafficLightsForRippleShell({
        sidebarOpen: false,
        shouldUseRippleShell: false,
      }),
    ).toBe(false)
  })
})
