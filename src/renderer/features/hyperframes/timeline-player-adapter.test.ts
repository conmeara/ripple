import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Ripple timeline player adapter source changes", () => {
  test("loads changed sources in a hidden player before swapping the preview", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/timeline-player-adapter.ts",
      "utf8",
    )
    const handoffEffectStart = source.indexOf(
      "useEffect(() => {\n    const container = containerRef.current",
    )
    const handoffEffectEnd = source.indexOf(
      "  const play = useCallback",
      handoffEffectStart,
    )
    const handoffEffect = source.slice(handoffEffectStart, handoffEffectEnd)

    expect(handoffEffectStart).toBeGreaterThan(-1)
    expect(handoffEffectEnd).toBeGreaterThan(handoffEffectStart)
    expect(source).toContain("opacity-0 transition-opacity")
    expect(handoffEffect).toContain("const previousPlayer = playerRef.current")
    expect(handoffEffect).toContain("claimedPrewarmedPlayer")
    expect(handoffEffect).toContain("fromPrewarm")
    expect(handoffEffect).toContain("waitForPendingSeekThenActivate")
    expect(handoffEffect).toContain("player:seek-settled")
    expect(handoffEffect).toContain("PENDING_SEEK_SETTLE_TIMEOUT_MS")
    expect(handoffEffect.indexOf("createTimelinePlayerElement()")).toBeLessThan(
      handoffEffect.indexOf("configureTimelinePlayerSource(pendingPlayer"),
    )
    expect(handoffEffect.indexOf("container.appendChild(pendingPlayer)")).toBeLessThan(
      handoffEffect.indexOf("configureTimelinePlayerSource(pendingPlayer"),
    )
    expect(handoffEffect.indexOf("requestAnimationFrame")).toBeLessThan(
      handoffEffect.indexOf("pendingPlayer.style.opacity = \"1\""),
    )
    expect(handoffEffect).toContain("previousActivePlayer.style.opacity = \"0\"")
    expect(handoffEffect).toContain("revokeObjectUrl(previousObjectUrl)")
  })

  test("revokes stale preview blob URLs after source handoffs", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/timeline-player-adapter.ts",
      "utf8",
    )
    const sourceLoadEffectStart = source.indexOf(
      "useEffect(() => {\n    const hasExistingPreview",
    )
    const sourceLoadEffectEnd = source.indexOf(
      "  useEffect(() => {\n    const container = containerRef.current",
      sourceLoadEffectStart,
    )
    const sourceLoadEffect = source.slice(sourceLoadEffectStart, sourceLoadEffectEnd)

    expect(source).toContain("getRipplePreparedPreviewDocument")
    expect(source).toContain("takeRipplePrewarmedPreviewPlayer")
    expect(source).toContain("resolveSeekTime(value, maxDuration)")
    expect(source).toContain("objectUrlsRef.current.delete(objectUrl)")
    expect(source).toContain("URL.revokeObjectURL(objectUrl)")
    expect(sourceLoadEffect).toContain(
      "const prewarmedPlayer = takeRipplePrewarmedPreviewPlayer(sourceUrl)",
    )
    expect(sourceLoadEffect).toContain("readySeekTimeRef.current === null")
    expect(sourceLoadEffect).toContain(
      "const preparedDocument = await getRipplePreparedPreviewDocument(sourceUrl",
    )
    expect(sourceLoadEffect).toContain("new Blob([preparedDocument.documentHtml]")
    expect(sourceLoadEffect).toContain("revokeObjectUrl(current.objectUrl)")
    expect(sourceLoadEffect.lastIndexOf("revokeObjectUrl(current.objectUrl)")).toBeGreaterThan(
      sourceLoadEffect.indexOf("getRipplePreparedPreviewDocument(sourceUrl"),
    )
    expect(sourceLoadEffect).toContain("return { sourceUrl, objectUrl }")
  })
})
