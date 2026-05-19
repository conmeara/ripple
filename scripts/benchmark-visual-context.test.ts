import { describe, expect, test } from "bun:test"
import {
  summarizeAgentVisualInjectionSavings,
  summarizeVisualContextPipelineTimings,
} from "./benchmark-visual-context"

describe("visual context benchmark summary", () => {
  test("reports direct native visual return savings over a path-only follow-up lookup", () => {
    expect(summarizeAgentVisualInjectionSavings({
      nativeVisualReturnMs: 12,
      pathOnlyReturnMs: 3,
      followupImageLookupMs: 297,
    })).toEqual({
      comparison: "on-demand-native-image-vs-path-only-followup",
      nativeVisualReturnMs: 12,
      pathOnlyReturnMs: 3,
      followupImageLookupMs: 297,
      pathOnlyTotalMs: 300,
      savedMs: 288,
      savedPercent: 96,
      nativeVisualLocalOverheadMs: 0,
      localTimingWinner: "native-image",
      measuredModelTurnLatencyMs: null,
      agentTurnsSaved: 1,
    })
  })

  test("reports capture and handoff stages as separate pipeline totals", () => {
    expect(summarizeVisualContextPipelineTimings({
      warmEngineFramesMs: 147.04,
      warmEngineSheetMs: 399.87,
      coldCliSnapshotMs: 7397.81,
      nativeVisualReturnMs: 0.61,
      pathOnlyReturnMs: 0.02,
      followupImageLookupMs: 0.12,
    })).toEqual({
      captureStage: {
        warmEngineFramesMs: 147.04,
        warmEngineSheetMs: 399.87,
        coldCliSnapshotMs: 7397.81,
      },
      runtimeHandoffStage: {
        comparison: "on-demand-native-image-vs-path-only-followup",
        nativeVisualReturnMs: 0.61,
        pathOnlyReturnMs: 0.02,
        followupImageLookupMs: 0.12,
        pathOnlyTotalMs: 0.14,
        savedMs: 0,
        savedPercent: 0,
        nativeVisualLocalOverheadMs: 0.47,
        localTimingWinner: "path-only",
        measuredModelTurnLatencyMs: null,
        agentTurnsSaved: 1,
      },
      localPipelineTotals: {
        warmFramesNativeImageMs: 147.65,
        warmSheetNativeImageMs: 400.48,
        coldCliPathOnlyLocalMs: 7397.95,
      },
      caveat: "Local file adaptation timings do not include the extra provider/model turn required when the agent receives only a path and must ask to inspect the image.",
    })
  })
})
