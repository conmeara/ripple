import { describe, expect, test } from "bun:test"
import {
  applyRippleShellShortcut,
  defaultRippleShellState,
  getRippleReviewContentKey,
  getRippleRightPaneContentKind,
  isRippleUtilityMode,
  RIPPLE_UTILITY_MODES,
  resolveRippleShellState,
  setRippleRightPaneMode,
  toggleRippleShellPanel,
} from "./ripple-shell-layout"

describe("Ripple shell layout state", () => {
  test("uses safe defaults for missing or stale stored state", () => {
    expect(resolveRippleShellState(null)).toEqual(defaultRippleShellState)
    expect(
      resolveRippleShellState({
        assetsPanelOpen: false,
        reviewPaneOpen: false,
        rightPaneMode: "unknown" as never,
      }),
    ).toEqual({
      assetsPanelOpen: false,
      centerStageOpen: true,
      reviewPaneOpen: false,
      rightPaneMode: "chat",
    })
  })

  test("treats panels as visible or gone", () => {
    const withoutAssets = toggleRippleShellPanel(defaultRippleShellState, "assets")
    expect(withoutAssets).toEqual({
      assetsPanelOpen: false,
      centerStageOpen: true,
      reviewPaneOpen: true,
      rightPaneMode: "chat",
    })

    expect(toggleRippleShellPanel(withoutAssets, "assets").assetsPanelOpen).toBe(true)

    const withoutCenter = toggleRippleShellPanel(defaultRippleShellState, "center")
    expect(withoutCenter).toEqual({
      assetsPanelOpen: true,
      centerStageOpen: false,
      reviewPaneOpen: true,
      rightPaneMode: "chat",
    })

    expect(toggleRippleShellPanel(withoutCenter, "center").centerStageOpen).toBe(true)
  })

  test("selecting a right pane mode restores the review pane", () => {
    const hiddenReview = {
      assetsPanelOpen: true,
      centerStageOpen: true,
      reviewPaneOpen: false,
      rightPaneMode: "chat" as const,
    }

    expect(setRippleRightPaneMode(hiddenReview, "comments")).toEqual({
      assetsPanelOpen: true,
      centerStageOpen: true,
      reviewPaneOpen: true,
      rightPaneMode: "comments",
    })
  })

  test("classifies review and utility content modes", () => {
    expect(getRippleRightPaneContentKind("chat")).toBe("chat")
    expect(getRippleRightPaneContentKind("comments")).toBe("comments")

    for (const utilityMode of RIPPLE_UTILITY_MODES) {
      expect(isRippleUtilityMode(utilityMode)).toBe(true)
      expect(getRippleRightPaneContentKind(utilityMode)).toBe("utility")
    }

    expect(isRippleUtilityMode("chat")).toBe(false)
    expect(isRippleUtilityMode("comments")).toBe(false)
    expect(isRippleUtilityMode("unknown")).toBe(false)
  })

  test("returns from utility modes to the embedded chat surface", () => {
    const detailsState = setRippleRightPaneMode(
      defaultRippleShellState,
      "details",
    )
    expect(getRippleRightPaneContentKind(detailsState.rightPaneMode)).toBe(
      "utility",
    )

    const chatState = setRippleRightPaneMode(detailsState, "chat")
    expect(chatState).toEqual({
      assetsPanelOpen: true,
      centerStageOpen: true,
      reviewPaneOpen: true,
      rightPaneMode: "chat",
    })
    expect(getRippleRightPaneContentKind(chatState.rightPaneMode)).toBe("chat")
  })

  test("remounts embedded review content when entering and leaving utilities", () => {
    const chatKey = getRippleReviewContentKey("chat-1", "chat")
    const commentsKey = getRippleReviewContentKey("chat-1", "comments")
    const detailsKey = getRippleReviewContentKey("chat-1", "details")
    const filesKey = getRippleReviewContentKey("chat-1", "files")

    expect(chatKey).toBe("ripple-review-chat-1:review")
    expect(commentsKey).toBe(chatKey)
    expect(detailsKey).toBe("ripple-review-chat-1:utility:details")
    expect(filesKey).toBe("ripple-review-chat-1:utility:files")
    expect(detailsKey).not.toBe(chatKey)
    expect(filesKey).not.toBe(detailsKey)
  })

  test("keyboard shortcuts share the same panel transitions", () => {
    const hiddenAssets = applyRippleShellShortcut(
      defaultRippleShellState,
      "toggle-assets",
    )
    expect(hiddenAssets.assetsPanelOpen).toBe(false)

    const hiddenCenter = applyRippleShellShortcut(hiddenAssets, "toggle-center")
    expect(hiddenCenter.centerStageOpen).toBe(false)

    const hiddenReview = applyRippleShellShortcut(hiddenCenter, "toggle-review")
    expect(hiddenReview.reviewPaneOpen).toBe(false)

    expect(applyRippleShellShortcut(hiddenReview, "show-chat")).toEqual({
      assetsPanelOpen: false,
      centerStageOpen: false,
      reviewPaneOpen: true,
      rightPaneMode: "chat",
    })
  })

  test("shortcuts recover hidden review modes without losing panel state", () => {
    const hiddenEverything = {
      assetsPanelOpen: false,
      centerStageOpen: false,
      reviewPaneOpen: false,
      rightPaneMode: "details" as const,
    }

    expect(applyRippleShellShortcut(hiddenEverything, "show-comments")).toEqual({
      assetsPanelOpen: false,
      centerStageOpen: false,
      reviewPaneOpen: true,
      rightPaneMode: "comments",
    })

    expect(applyRippleShellShortcut(hiddenEverything, "show-chat")).toEqual({
      assetsPanelOpen: false,
      centerStageOpen: false,
      reviewPaneOpen: true,
      rightPaneMode: "chat",
    })
  })
})
