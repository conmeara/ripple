import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HYPERFRAMES_SOURCE_WATCHED_EXTENSIONS } from "../../../shared/hyperframes-source-watch"
import {
  HyperframesSourceWatcher,
  type HyperframesSourceWatchBatchEvent,
  isHyperframesSourceWatchPath,
  shouldIgnoreHyperframesSourceWatchPath,
} from "./source-watcher"

const tempDirs: string[] = []

async function makeProjectDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ripple-hf-source-watch-"))
  tempDirs.push(dir)
  await mkdir(join(dir, "compositions"), { recursive: true })
  await mkdir(join(dir, "assets"), { recursive: true })
  await writeFile(join(dir, "index.html"), "<h1>hello</h1>", "utf-8")
  await writeFile(join(dir, "styles.css"), "body { color: black; }", "utf-8")
  await writeFile(join(dir, "hyperframes.json"), "{}", "utf-8")
  await writeFile(join(dir, "compositions", "lower-third.html"), "<template></template>", "utf-8")
  return dir
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForEventCount(
  events: HyperframesSourceWatchBatchEvent[],
  count: number,
): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 2_000) {
    if (events.length >= count) return
    await sleep(25)
  }
  throw new Error(`Timed out waiting for ${count} source watcher event(s). Saw ${events.length}.`)
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("HyperFrames source watcher", () => {
  test("matches HyperFrames Studio source extensions", () => {
    expect(HYPERFRAMES_SOURCE_WATCHED_EXTENSIONS).toEqual([
      ".html",
      ".css",
      ".js",
      ".json",
    ])

    expect(isHyperframesSourceWatchPath("index.html")).toBe(true)
    expect(isHyperframesSourceWatchPath("styles/theme.css")).toBe(true)
    expect(isHyperframesSourceWatchPath("scripts/timeline.js")).toBe(true)
    expect(isHyperframesSourceWatchPath("hyperframes.json")).toBe(true)
    expect(isHyperframesSourceWatchPath("renders/output.mp4")).toBe(false)
    expect(isHyperframesSourceWatchPath("assets/poster.png")).toBe(false)
  })

  test("keeps generated and dependency folders out of the live preview watcher", () => {
    expect(shouldIgnoreHyperframesSourceWatchPath(".git/index")).toBe(true)
    expect(shouldIgnoreHyperframesSourceWatchPath("node_modules/pkg/index.html")).toBe(true)
    expect(shouldIgnoreHyperframesSourceWatchPath(".ripple/worktrees/chat/index.html")).toBe(true)
    expect(shouldIgnoreHyperframesSourceWatchPath("compositions/lower-third.html")).toBe(false)
  })

  test("emits debounced batches for source edits without waiting for Git state", async () => {
    const projectDir = await makeProjectDir()
    const watcher = new HyperframesSourceWatcher({
      projectPath: projectDir,
      debounceMs: 40,
    })
    await watcher.waitForReady()

    const events: HyperframesSourceWatchBatchEvent[] = []
    watcher.on("change", (event: HyperframesSourceWatchBatchEvent) => {
      events.push(event)
    })

    try {
      await writeFile(join(projectDir, "index.html"), "<h1>goodbye</h1>", "utf-8")
      await waitForEventCount(events, 1)

      expect(events[0]?.projectPath).toBe(projectDir)
      expect(events[0]?.changes).toEqual(
        expect.arrayContaining([{ path: "index.html", type: "change" }]),
      )
      expect(
        events[0]?.changes.every((change) => isHyperframesSourceWatchPath(change.path)),
      ).toBe(true)

      const countAfterSourceEdit = events.length
      await writeFile(join(projectDir, "README.md"), "notes", "utf-8")
      await writeFile(join(projectDir, "assets", "poster.png"), "not really png", "utf-8")
      await sleep(200)
      expect(events.length).toBe(countAfterSourceEdit)

      await writeFile(join(projectDir, "index.html"), "<h1>again</h1>", "utf-8")
      await writeFile(join(projectDir, "styles.css"), "body { color: white; }", "utf-8")
      await writeFile(join(projectDir, "hyperframes.json"), "{\"updated\":true}", "utf-8")
      await waitForEventCount(events, countAfterSourceEdit + 1)

      const latestEvent = events.at(-1)
      expect(latestEvent?.changes).toEqual(
        expect.arrayContaining([
          { path: "index.html", type: "change" },
          { path: "styles.css", type: "change" },
          { path: "hyperframes.json", type: "change" },
        ]),
      )
      expect(latestEvent?.changes).toHaveLength(3)
    } finally {
      await watcher.dispose()
    }
  })
})
