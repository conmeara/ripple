import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Ripple timeline player adapter source changes", () => {
  test("clears runtime timeline data before loading a changed source", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/timeline-player-adapter.ts",
      "utf8",
    )
    const sourceLoadEffectStart = source.indexOf("useEffect(() => {\n    setTimelineModel(null)")
    const sourceLoadEffectEnd = source.indexOf(
      "  useEffect(() => {\n    const player = playerRef.current",
      sourceLoadEffectStart,
    )
    const sourceLoadEffect = source.slice(sourceLoadEffectStart, sourceLoadEffectEnd)

    expect(sourceLoadEffectStart).toBeGreaterThan(-1)
    expect(sourceLoadEffectEnd).toBeGreaterThan(sourceLoadEffectStart)
    expect(sourceLoadEffect.indexOf("setTimelineModel(null)")).toBeLessThan(
      sourceLoadEffect.indexOf("fetch(sourceUrl"),
    )
    expect(sourceLoadEffect.indexOf("player.pause()")).toBeLessThan(
      sourceLoadEffect.indexOf("fetch(sourceUrl"),
    )
    expect(sourceLoadEffect.indexOf('player.removeAttribute("src")')).toBeLessThan(
      sourceLoadEffect.indexOf("fetch(sourceUrl"),
    )
    expect(sourceLoadEffect).toContain("duration: 0")
  })

  test("revokes stale preview blob URLs after source handoffs", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/timeline-player-adapter.ts",
      "utf8",
    )
    const sourceLoadEffectStart = source.indexOf("useEffect(() => {\n    setTimelineModel(null)")
    const sourceLoadEffectEnd = source.indexOf(
      "  useEffect(() => {\n    const player = playerRef.current",
      sourceLoadEffectStart,
    )
    const sourceLoadEffect = source.slice(sourceLoadEffectStart, sourceLoadEffectEnd)

    expect(source).toContain("objectUrlsRef.current.delete(objectUrl)")
    expect(source).toContain("URL.revokeObjectURL(objectUrl)")
    expect(sourceLoadEffect).toContain("revokeObjectUrl(current.objectUrl)")
    expect(sourceLoadEffect.indexOf("revokeObjectUrl(current.objectUrl)")).toBeLessThan(
      sourceLoadEffect.indexOf("fetch(sourceUrl"),
    )
  })
})
