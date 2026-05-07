import { describe, expect, test } from "bun:test"
import {
  applyRippleShellShortcut,
  clampRippleReviewPaneWidth,
  defaultRippleShellState,
  getRippleCenterReviewLayout,
  getRippleReviewContentKey,
  getRippleReviewPaneWidthBounds,
  getRippleRightPaneContentKind,
  isRippleUtilityMode,
  RIPPLE_CENTER_REVIEW_DIVIDER_WIDTH,
  RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
  RIPPLE_REVIEW_PANE_MAX_WIDTH,
  RIPPLE_REVIEW_PANE_MIN_WIDTH,
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
    expect(getRippleRightPaneContentKind("renders")).toBe("utility")

    for (const utilityMode of RIPPLE_UTILITY_MODES) {
      expect(isRippleUtilityMode(utilityMode)).toBe(true)
      expect(getRippleRightPaneContentKind(utilityMode)).toBe("utility")
    }

    expect(isRippleUtilityMode("chat")).toBe(false)
    expect(isRippleUtilityMode("comments")).toBe(false)
    expect(isRippleUtilityMode("renders")).toBe(false)
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
    const rendersKey = getRippleReviewContentKey("chat-1", "renders")
    const detailsKey = getRippleReviewContentKey("chat-1", "details")
    const filesKey = getRippleReviewContentKey("chat-1", "files")

    expect(chatKey).toBe("ripple-review-chat-1:review")
    expect(commentsKey).toBe(chatKey)
    expect(rendersKey).toBe("ripple-review-chat-1:utility:renders")
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

  test("clamps the resizable review pane to leave room for the center stage", () => {
    expect(clampRippleReviewPaneWidth({ width: 100 })).toBe(
      RIPPLE_REVIEW_PANE_MIN_WIDTH,
    )
    expect(clampRippleReviewPaneWidth({ width: 9999 })).toBe(
      RIPPLE_REVIEW_PANE_MAX_WIDTH,
    )

    const bounds = getRippleReviewPaneWidthBounds(1000)
    expect(bounds).toEqual({
      min: RIPPLE_REVIEW_PANE_MIN_WIDTH,
      max: RIPPLE_REVIEW_PANE_MAX_WIDTH,
    })

    const constrainedBounds = getRippleReviewPaneWidthBounds(760)
    expect(constrainedBounds.min).toBe(RIPPLE_REVIEW_PANE_MIN_WIDTH)
    expect(constrainedBounds.max).toBeLessThan(RIPPLE_REVIEW_PANE_MAX_WIDTH)
    expect(
      clampRippleReviewPaneWidth({
        width: RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
        containerWidth: 760,
      }),
    ).toBe(constrainedBounds.max)
  })

  test("computes animated center and review widths from panel state", () => {
    expect(
      getRippleCenterReviewLayout({
        containerWidth: 1000,
        reviewPaneWidth: RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
        centerStageOpen: true,
        reviewPaneOpen: true,
      }),
    ).toEqual({
      centerWidth:
        1000 -
        RIPPLE_CENTER_REVIEW_DIVIDER_WIDTH -
        RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
      reviewWidth: RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
      dividerWidth: RIPPLE_CENTER_REVIEW_DIVIDER_WIDTH,
    })

    expect(
      getRippleCenterReviewLayout({
        containerWidth: 1000,
        reviewPaneWidth: RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
        centerStageOpen: true,
        reviewPaneOpen: false,
      }),
    ).toEqual({
      centerWidth: 1000,
      reviewWidth: 0,
      dividerWidth: 0,
    })

    expect(
      getRippleCenterReviewLayout({
        containerWidth: 1000,
        reviewPaneWidth: RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
        centerStageOpen: false,
        reviewPaneOpen: true,
      }),
    ).toEqual({
      centerWidth: 0,
      reviewWidth: 1000,
      dividerWidth: 0,
    })
  })
})
