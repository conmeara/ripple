import { describe, expect, test } from "bun:test"
import {
  buildRippleActivitySignature,
  getRippleRevisionActivityState,
  hasRippleActivityBadge,
  summarizeRippleActivity,
} from "./ripple-activity"

describe("Ripple activity summaries", () => {
  test("maps revision statuses to badge states", () => {
    expect(getRippleRevisionActivityState("queued")).toBe("working")
    expect(getRippleRevisionActivityState("running")).toBe("working")
    expect(getRippleRevisionActivityState("proposed")).toBe("ready")
    expect(getRippleRevisionActivityState("failed")).toBe("needsAttention")
    expect(getRippleRevisionActivityState("needs_update")).toBe("needsAttention")
    expect(getRippleRevisionActivityState("answered")).toBeNull()
    expect(getRippleRevisionActivityState("accepted")).toBeNull()
    expect(getRippleRevisionActivityState("rejected")).toBeNull()
  })

  test("summarizes comment activity by composition", () => {
    const summaries = summarizeRippleActivity([
      {
        projectId: "project-1",
        scopeKind: "composition",
        scopeId: "comp-a",
        threadStatus: "open",
        threadUpdatedAt: "2026-05-02T12:00:00.000Z",
        latestRevisionStatus: "running",
        latestRevisionUpdatedAt: "2026-05-02T12:01:00.000Z",
      },
      {
        projectId: "project-1",
        scopeKind: "composition",
        scopeId: "comp-a",
        threadStatus: "open",
        threadUpdatedAt: "2026-05-02T12:05:00.000Z",
        latestRevisionStatus: "proposed",
        latestRevisionUpdatedAt: "2026-05-02T12:06:00.000Z",
      },
      {
        projectId: "project-1",
        scopeKind: "composition",
        scopeId: "comp-b",
        threadStatus: "resolved",
        threadUpdatedAt: "2026-05-02T12:03:00.000Z",
        latestRevisionStatus: "failed",
      },
    ])

    expect(summaries).toHaveLength(2)
    expect(summaries[0]).toMatchObject({
      scopeId: "comp-a",
      working: 1,
      ready: 1,
      needsAttention: 0,
      open: 2,
      latestActivityAt: "2026-05-02T12:06:00.000Z",
    })
    expect(summaries[1]).toMatchObject({
      scopeId: "comp-b",
      working: 0,
      ready: 0,
      needsAttention: 1,
      open: 0,
    })
    expect(hasRippleActivityBadge(summaries[0])).toBe(true)
    expect(hasRippleActivityBadge({
      projectId: "project-1",
      scopeKind: "composition",
      scopeId: "comp-c",
      working: 0,
      ready: 0,
      needsAttention: 0,
      open: 3,
      latestActivityAt: "2026-05-02T12:00:00.000Z",
      activitySignature: "",
    })).toBe(false)
  })

  test("changes the signature when activity status changes", () => {
    const acknowledgedWorking = buildRippleActivitySignature({
      latestActivityAt: "2026-05-02T12:00:00.000Z",
      working: 1,
      ready: 0,
      needsAttention: 0,
      open: 1,
    })
    const changesReady = buildRippleActivitySignature({
      latestActivityAt: "2026-05-02T12:05:00.000Z",
      working: 0,
      ready: 1,
      needsAttention: 0,
      open: 1,
    })

    expect(changesReady).not.toBe(acknowledgedWorking)
  })

  test("does not change the signature for timestamp-only working progress", () => {
    const acknowledgedWorking = buildRippleActivitySignature({
      latestActivityAt: "2026-05-02T12:00:00.000Z",
      working: 1,
      ready: 0,
      needsAttention: 0,
      open: 1,
    })
    const stillWorking = buildRippleActivitySignature({
      latestActivityAt: "2026-05-02T12:05:00.000Z",
      working: 1,
      ready: 0,
      needsAttention: 0,
      open: 1,
    })

    expect(stillWorking).toBe(acknowledgedWorking)
  })
})
