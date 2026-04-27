import { describe, expect, test } from "bun:test"
import {
  createRippleProjectAssetItem,
  formatAssetSize,
  getRippleProjectAssetKind,
  isGeneratedRippleProjectAssetPath,
  isImportableRippleProjectMediaPath,
  isVisibleRippleProjectAssetPath,
  markActiveRippleProjectCompositions,
  sortRippleProjectAssets,
  sortRippleProjectCompositions,
  toRippleProjectCompositionItem,
} from "../../../shared/hyperframes-project-model"

describe("Ripple HyperFrames project model", () => {
  test("classifies visible asset kinds by extension", () => {
    expect(getRippleProjectAssetKind("assets/poster.PNG")).toBe("image")
    expect(getRippleProjectAssetKind("assets/video/clip.webm")).toBe("video")
    expect(getRippleProjectAssetKind("assets/audio/chime.mp3")).toBe("audio")
    expect(getRippleProjectAssetKind("assets/fonts/display.woff2")).toBe("font")
    expect(getRippleProjectAssetKind("assets/data/notes.json")).toBe("other")
  })

  test("filters generated and unsupported asset paths", () => {
    expect(isGeneratedRippleProjectAssetPath("assets/vendor/gsap-lite.js")).toBe(true)
    expect(isGeneratedRippleProjectAssetPath("assets/.DS_Store")).toBe(true)
    expect(isVisibleRippleProjectAssetPath("assets/images/logo.svg")).toBe(true)
    expect(isVisibleRippleProjectAssetPath("assets/data/notes.json")).toBe(false)
    expect(isVisibleRippleProjectAssetPath("assets/vendor/logo.png")).toBe(false)
    expect(isImportableRippleProjectMediaPath("poster.jpg")).toBe(true)
    expect(isImportableRippleProjectMediaPath("display.woff2")).toBe(false)
  })

  test("creates display asset items and sorts by kind then label", () => {
    const assets = sortRippleProjectAssets([
      createRippleProjectAssetItem({
        projectId: "project_1",
        relativePath: "assets/audio/theme.wav",
        mimeType: "audio/wav",
        sizeBytes: 1024,
        modifiedAt: new Date("2026-04-26T12:00:00Z"),
        previewUrl: "ripple-preview://project_1/assets/audio/theme.wav",
      }),
      createRippleProjectAssetItem({
        projectId: "project_1",
        relativePath: "assets/images/hero-logo.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        modifiedAt: new Date("2026-04-26T12:00:00Z"),
        previewUrl: "ripple-preview://project_1/assets/images/hero-logo.png",
      }),
    ])

    expect(assets.map((asset) => asset.label)).toEqual(["Hero Logo", "Theme"])
    expect(assets[0]).toMatchObject({
      id: "project_1:assets/images/hero-logo.png",
      directory: "assets/images",
      extension: ".png",
      kind: "image",
    })
  })

  test("sorts compositions by stable file path without moving the active row", () => {
    const root = toRippleProjectCompositionItem({
      id: "root",
      name: "Index",
      filePath: "index.html",
      dataCompositionId: "main",
      width: 1920,
      height: 1080,
      parentCompositionId: null,
      kind: "root",
    }, "lower")
    const lower = toRippleProjectCompositionItem({
      id: "lower",
      name: "Lower Third",
      filePath: "compositions/lower-third.html",
      dataCompositionId: "lower-third",
      width: 1920,
      height: 240,
      parentCompositionId: "root",
      kind: "external",
    }, "lower")

    expect(sortRippleProjectCompositions([root, lower]).map((item) => item.id)).toEqual([
      "lower",
      "root",
    ])
    expect(root.aspectRatioLabel).toBe("1920x1080")
  })

  test("marks a selected composition active without reordering the list", () => {
    const compositions = [
      toRippleProjectCompositionItem({
        id: "lower",
        name: "Lower Third",
        filePath: "compositions/lower-third.html",
        dataCompositionId: "lower-third",
        width: 1920,
        height: 240,
        parentCompositionId: "root",
        kind: "external",
      }, "root"),
      toRippleProjectCompositionItem({
        id: "root",
        name: "Index",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
        parentCompositionId: null,
        kind: "root",
      }, "root"),
    ]

    const displayed = markActiveRippleProjectCompositions(compositions, "lower")

    expect(displayed.map((composition) => composition.id)).toEqual([
      "lower",
      "root",
    ])
    expect(
      displayed
        .filter((composition) => composition.isActive)
        .map((composition) => composition.id),
    ).toEqual(["lower"])
    expect(
      compositions
        .filter((composition) => composition.isActive)
        .map((composition) => composition.id),
    ).toEqual(["root"])
  })

  test("formats compact file sizes", () => {
    expect(formatAssetSize(0)).toBe("0 B")
    expect(formatAssetSize(512)).toBe("512 B")
    expect(formatAssetSize(1536)).toBe("1.5 KB")
    expect(formatAssetSize(1024 * 1024 * 12)).toBe("12 MB")
  })
})
