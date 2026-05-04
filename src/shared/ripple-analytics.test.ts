import { describe, expect, test } from "bun:test"
import {
  AnalyticsPayloadError,
  bucketCount,
  bucketSeconds,
  categorizeError,
  sanitizeAnalyticsEventPayload,
} from "./ripple-analytics"

describe("Ripple analytics event sanitizer", () => {
  test("accepts documented Ripple events with coarse properties", () => {
    expect(
      sanitizeAnalyticsEventPayload({
        name: "ripple_export_succeeded",
        properties: {
          format: "mp4",
          quality_preset: "standard",
          duration_bucket: "15_60s",
          render_time_bucket: "1_5m",
          app_version: "0.0.72",
          platform: "darwin",
          environment: "production",
        },
      }),
    ).toEqual({
      name: "ripple_export_succeeded",
      properties: {
        format: "mp4",
        quality_preset: "standard",
        duration_bucket: "15_60s",
        render_time_bucket: "1_5m",
        app_version: "0.0.72",
        platform: "darwin",
        environment: "production",
      },
    })
  })

  test("rejects unknown inherited event names", () => {
    expect(() =>
      sanitizeAnalyticsEventPayload({
        name: "desktop_opened",
        properties: { first_launch: true },
      }),
    ).toThrow(AnalyticsPayloadError)
  })

  test("rejects raw identifiers and unknown properties", () => {
    expect(() =>
      sanitizeAnalyticsEventPayload({
        name: "ripple_project_opened",
        properties: {
          open_source: "project_entry",
          project_kind: "local",
          project_id: "project_123",
        },
      }),
    ).toThrow(/project_id/)
  })

  test("rejects emails, paths, repo URLs, logs, and token-shaped values", () => {
    const forbiddenValues = [
      "person@example.com",
      "/Users/conmeara/Ripple/Launch/index.html",
      "failed at /Users/alice/Ripple/index.html",
      "failed at /tmp/render.log",
      "failed at C:\\Users\\Alice\\Ripple\\index.html",
      "https://github.com/conmeara/ripple.git",
      "line one\nline two",
      "phc_12345678901234567890",
    ]

    for (const value of forbiddenValues) {
      expect(() =>
        sanitizeAnalyticsEventPayload({
          name: "ripple_preview_failed",
          properties: {
            preview_source: "center_preview",
            error_category: value,
          },
        }),
      ).toThrow(AnalyticsPayloadError)
    }
  })

  test("requires event-specific required properties", () => {
    expect(() =>
      sanitizeAnalyticsEventPayload({
        name: "ripple_export_started",
        properties: { format: "mp4" },
      }),
    ).toThrow(/quality_preset/)
  })

  test("provides stable coarse buckets and error categories", () => {
    expect(bucketCount(0)).toBe("0")
    expect(bucketCount(2)).toBe("2-3")
    expect(bucketCount(11)).toBe("11+")
    expect(bucketSeconds(4)).toBe("under_5s")
    expect(bucketSeconds(60)).toBe("1_5m")
    expect(categorizeError(new Error("FFmpeg not found"))).toBe("missing_dependency")
    expect(categorizeError(new Error("request timed out"))).toBe("timeout")
  })
})
