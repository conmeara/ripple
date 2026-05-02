import { describe, expect, test } from "bun:test"
import {
  acknowledgeCompositionActivity,
  getCompositionActivityBadgeState,
} from "./composition-activity-badges"

const summary = {
  projectId: "project-1",
  scopeKind: "composition" as const,
  scopeId: "comp-1",
  working: 1,
  ready: 0,
  needsAttention: 0,
  open: 1,
  latestActivityAt: "2026-05-02T12:00:00.000Z",
  activitySignature:
    "2026-05-02T12:00:00.000Z|working:1|ready:0|needs:0|open:1",
}

describe("composition activity badges", () => {
  test("hides an acknowledged working badge until the signature changes", () => {
    expect(getCompositionActivityBadgeState({
      summary,
      acknowledgementRecords: {},
    })).toBe("working")

    const acknowledged = acknowledgeCompositionActivity({
      summary,
      acknowledgementRecords: {},
    })
    expect(getCompositionActivityBadgeState({
      summary,
      acknowledgementRecords: acknowledged,
    })).toBeNull()

    expect(getCompositionActivityBadgeState({
      summary: {
        ...summary,
        working: 0,
        ready: 1,
        latestActivityAt: "2026-05-02T12:05:00.000Z",
        activitySignature:
          "2026-05-02T12:05:00.000Z|working:0|ready:1|needs:0|open:1",
      },
      acknowledgementRecords: acknowledged,
    })).toBe("ready")
  })

  test("prioritizes needs-attention badges", () => {
    expect(getCompositionActivityBadgeState({
      summary: {
        ...summary,
        working: 1,
        ready: 1,
        needsAttention: 1,
      },
      acknowledgementRecords: {},
    })).toBe("needsAttention")
  })
})
