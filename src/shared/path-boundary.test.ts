import { describe, expect, test } from "bun:test"
import { win32 } from "node:path"
import {
  isPathInsideDirectory,
  isRelativePathInsideDirectory,
} from "./path-boundary"

describe("path boundary helpers", () => {
  test("rejects Windows cross-drive relative results", () => {
    const result = win32.relative("C:\\Ripple\\Project", "D:\\Secrets\\asset.png")

    expect(result).toBe("D:\\Secrets\\asset.png")
    expect(isRelativePathInsideDirectory(result, {
      isAbsolute: win32.isAbsolute,
      sep: win32.sep,
    })).toBe(false)
    expect(isPathInsideDirectory(
      "C:\\Ripple\\Project",
      "D:\\Secrets\\asset.png",
      win32,
    )).toBe(false)
  })

  test("accepts descendants and rejects siblings", () => {
    expect(isPathInsideDirectory(
      "C:\\Ripple\\Project",
      "C:\\Ripple\\Project\\assets\\logo.png",
      win32,
    )).toBe(true)
    expect(isPathInsideDirectory(
      "C:\\Ripple\\Project",
      "C:\\Ripple\\Other\\logo.png",
      win32,
    )).toBe(false)
  })
})
