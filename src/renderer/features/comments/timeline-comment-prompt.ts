import type { RippleTimelineRangeSelection } from "../../../shared/hyperframes-timeline-model"
import type { RippleCommentAnchorInput } from "../../../shared/ripple-comments"

export function buildAnchorFromTimelineContext(input: {
  currentTime: number
  selection: RippleTimelineRangeSelection | null
}): RippleCommentAnchorInput {
  if (input.selection) {
    return {
      anchorType:
        input.selection.selector || input.selection.clipKey ? "element" : "range",
      startTime: input.selection.startTime,
      endTime: input.selection.endTime,
      startFrame: input.selection.startFrame,
      endFrame: input.selection.endFrame,
      elementSelector: input.selection.selector ?? null,
      clipKey: input.selection.clipKey ?? null,
      sourceFile: input.selection.sourceFile ?? null,
    }
  }

  return {
    anchorType: "frame",
    startTime: input.currentTime,
    endTime: null,
    startFrame: Math.max(0, Math.round(input.currentTime * 30)),
    endFrame: null,
  }
}
