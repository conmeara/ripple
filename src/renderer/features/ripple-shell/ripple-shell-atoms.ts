import { atomWithStorage } from "jotai/utils"
import { atomWithWindowStorage } from "../../lib/window-storage"
import {
  RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
  type RippleRightPaneMode,
} from "./ripple-shell-layout"

export const rippleShellAssetsPanelOpenAtom = atomWithWindowStorage<boolean>(
  "ripple-shell:assets-panel-open",
  true,
  { getOnInit: true },
)

export const rippleShellCenterStageOpenAtom = atomWithWindowStorage<boolean>(
  "ripple-shell:center-stage-open",
  true,
  { getOnInit: true },
)

export const rippleShellReviewPaneOpenAtom = atomWithWindowStorage<boolean>(
  "ripple-shell:review-pane-open",
  true,
  { getOnInit: true },
)

export const rippleShellRightPaneModeAtom =
  atomWithWindowStorage<RippleRightPaneMode>(
    "ripple-shell:right-pane-mode",
    "chat",
    { getOnInit: true },
  )

export const rippleShellReviewPaneWidthAtom = atomWithStorage<number>(
  "ripple-shell:review-pane-width",
  RIPPLE_REVIEW_PANE_DEFAULT_WIDTH,
  undefined,
  { getOnInit: true },
)
