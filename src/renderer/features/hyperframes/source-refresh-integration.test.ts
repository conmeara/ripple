import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("HyperFrames source refresh integration", () => {
  test("reloads the center preview through the existing adapter path", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx",
      "utf8",
    )

    expect(source).toContain("useHyperframesSourceChangeListener")
    expect(source).toContain("sourceRefreshSeekTimeRef.current = displayTime")
    expect(source).toContain("adapter.reload({ seekTime: sourceRefreshSeekTimeRef.current })")
  })

  test("threads source refresh versions into composition thumbnails", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesProjectPane.tsx",
      "utf8",
    )

    expect(source).toContain("useHyperframesSourceChangeListener")
    expect(source).toContain("setSourceRefreshVersion((version) => version + 1)")
    expect(source).toContain("buildHyperframesPlayerFetchUrl(narrowedSourceUrl, refreshVersion)")
  })
})
