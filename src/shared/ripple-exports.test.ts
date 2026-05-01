import { describe, expect, test } from "bun:test"
import {
  clampRippleExportProgress,
  formatRippleExportDuration,
  formatRippleExportFileSize,
  getRippleExportDisplayPath,
  isRippleExportTerminalStatus,
  parseRippleExportSettingsJson,
} from "./ripple-exports"

describe("Ripple export helpers", () => {
  test("normalizes progress for render rows", () => {
    expect(clampRippleExportProgress(-10)).toBe(0)
    expect(clampRippleExportProgress(42.4)).toBe(42)
    expect(clampRippleExportProgress(101)).toBe(100)
    expect(clampRippleExportProgress(Number.NaN)).toBe(0)
  })

  test("chooses the product-visible path", () => {
    expect(getRippleExportDisplayPath({
      outputPath: "/project/exports/main.mp4",
      destinationPath: "/Desktop/main.mp4",
    })).toBe("/Desktop/main.mp4")
    expect(getRippleExportDisplayPath({
      outputPath: "/project/exports/main.mp4",
    })).toBe("/project/exports/main.mp4")
  })

  test("parses settings defensively", () => {
    expect(parseRippleExportSettingsJson('{"workers":1,"useGpu":false}'))
      .toEqual({ workers: 1, useGpu: false })
    expect(parseRippleExportSettingsJson("not-json")).toEqual({})
  })

  test("formats compact file facts", () => {
    expect(formatRippleExportFileSize(1536)).toBe("1.5 KB")
    expect(formatRippleExportDuration(62.2)).toBe("1:02")
    expect(isRippleExportTerminalStatus("running")).toBe(false)
    expect(isRippleExportTerminalStatus("completed")).toBe(true)
  })
})
