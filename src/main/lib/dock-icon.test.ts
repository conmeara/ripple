import { describe, expect, test } from "bun:test"
import {
  DOCK_ICON_DARK_ASSET,
  DOCK_ICON_LIGHT_ASSET,
  getDockIconAssetName,
} from "./dock-icon"

describe("macOS dock icon appearance assets", () => {
  test("uses the light icon in light mode", () => {
    expect(getDockIconAssetName(false)).toBe(DOCK_ICON_LIGHT_ASSET)
  })

  test("uses the dark icon in dark mode", () => {
    expect(getDockIconAssetName(true)).toBe(DOCK_ICON_DARK_ASSET)
  })
})
