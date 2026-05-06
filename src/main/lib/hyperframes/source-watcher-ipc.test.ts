import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("HyperFrames source watcher IPC", () => {
  test("subscribes to the resolved preview context instead of only the selected project", () => {
    const source = readFileSync(
      "src/main/lib/hyperframes/source-watcher-ipc.ts",
      "utf8",
    )

    expect(source).toContain("resolveHyperframesPreviewContext(input)")
    expect(source).toContain("assertHyperframesProjectFiles(context.projectPath)")
    expect(source).toContain("hyperframesSourceWatcherRegistry.subscribe(")
    expect(source).toContain("context.projectPath")
    expect(source).toContain("context.key")
  })

  test("deduplicates repeated window subscriptions and cleans up on unsubscribe", () => {
    const source = readFileSync(
      "src/main/lib/hyperframes/source-watcher-ipc.ts",
      "utf8",
    )

    expect(source).toContain("existing.count += 1")
    expect(source).toContain("subscription.count -= 1")
    expect(source).toContain("if (subscription.count > 0) return")
    expect(source).toContain("cleanupHyperframesSourceWindowSubscriptions")
    expect(source).toContain("cleanupHyperframesSourceWatchers")
  })
})
