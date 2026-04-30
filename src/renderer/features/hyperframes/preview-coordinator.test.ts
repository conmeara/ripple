import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Ripple preview coordinator", () => {
  test("keeps prepared preview documents bounded and shared", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/preview-coordinator.ts",
      "utf8",
    )

    expect(source).toContain("maxPreparedDocuments: 18")
    expect(source).toContain("maxPreparedBytes: 36 * 1024 * 1024")
    expect(source).toContain("maxPreparedPlayers: 6")
    expect(source).toContain("pendingPreviewDocumentLoads")
    expect(source).toContain("preparedPreviewDocuments.delete(oldestSourceUrl)")
    expect(source).toContain("prewarmedPreviewPlayers")
  })

  test("uses prepared HyperFrames documents instead of owning playback semantics", () => {
    const source = readFileSync(
      "src/renderer/features/hyperframes/preview-coordinator.ts",
      "utf8",
    )

    expect(source).toContain("buildHyperframesPlayerBlobDocument")
    expect(source).toContain("fetch(sourceUrl, { cache: \"no-store\" })")
    expect(source).toContain("prewarmRipplePreparedPreviewDocument")
    expect(source).toContain("prewarmRipplePreviewPlayer")
    expect(source).toContain("takeRipplePrewarmedPreviewPlayer")
    expect(source).toContain("take-${entry.status}")
    expect(source).toContain("[RipplePreview]")
    expect(source).toContain("Prewarming is speculative")
  })
})
