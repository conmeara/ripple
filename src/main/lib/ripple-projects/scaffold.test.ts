import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { writeRippleProjectScaffold } from "./scaffold"
import type { ScaffoldMetadata } from "./types"

const metadata: ScaffoldMetadata = {
  projectName: "Launch Video",
  slug: "launch-video",
  aspectRatioPreset: "wide-16-9",
  templateId: "starter-title-card",
  width: 1920,
  height: 1080,
  fps: 30,
}

describe("Ripple project scaffold", () => {
  test("writes an offline HyperFrames starter project", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-scaffold-"))
    try {
      const result = await writeRippleProjectScaffold(root, metadata)
      expect(result.compositions.map((composition) => composition.filePath)).toEqual([
        "index.html",
        "compositions/lower-third.html",
      ])

      await stat(join(root, "index.html"))
      await stat(join(root, "compositions", "lower-third.html"))
      await stat(join(root, "assets", "vendor", "gsap.min.js"))
      await stat(join(root, "exports"))
      await stat(join(root, "hyperframes.json"))
      await stat(join(root, "meta.json"))

      const indexHtml = await readFile(join(root, "index.html"), "utf8")
      expect(indexHtml).toContain('<link rel="icon" href="data:," />')
      expect(indexHtml).toContain('data-composition-id="main"')
      expect(indexHtml).toContain('data-width="1920"')
      expect(indexHtml).toContain('data-height="1080"')
      expect(indexHtml).toContain('class="clip title-card"')
      expect(indexHtml).toContain('data-start="0"')
      expect(indexHtml).toContain('data-duration="6"')
      expect(indexHtml).toContain('data-composition-src="./compositions/lower-third.html"')
      expect(indexHtml).toContain('data-start="2.4"')
      expect(indexHtml).toContain('data-duration="3.2"')
      expect(indexHtml).toContain("window.__timelines.main")
      expect(indexHtml).toContain("./assets/vendor/gsap.min.js")
      expect(indexHtml).not.toContain("https://")
      expect(indexHtml).not.toContain("http://")

      const gsapRuntime = await readFile(
        join(root, "assets", "vendor", "gsap.min.js"),
        "utf8",
      )
      expect(gsapRuntime).toContain("totalTime")
      expect(gsapRuntime).toContain("seek")

      const hyperframesJson = JSON.parse(
        await readFile(join(root, "hyperframes.json"), "utf8"),
      )
      expect(hyperframesJson).toMatchObject({
        name: "Launch Video",
        entry: "index.html",
        width: 1920,
        height: 1080,
        fps: 30,
      })

      const lowerThird = await readFile(
        join(root, "compositions", "lower-third.html"),
        "utf8",
      )
      expect(lowerThird).toContain("<template>")
      expect(lowerThird).toContain('data-composition-id="lower-third"')
      expect(lowerThird).toContain('class="clip lower-third-panel"')
      expect(lowerThird).toContain('window.__timelines["lower-third"]')
      expect(lowerThird).toContain("../assets/vendor/gsap.min.js")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("does not overwrite unrelated folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-scaffold-"))
    try {
      await mkdir(root, { recursive: true })
      await writeFile(join(root, "notes.txt"), "keep me", "utf8")

      await expect(writeRippleProjectScaffold(root, metadata)).rejects.toThrow(
        "unrelated files",
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("is idempotent when generated files are unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-scaffold-"))
    try {
      await writeRippleProjectScaffold(root, metadata)
      await expect(writeRippleProjectScaffold(root, metadata)).resolves.toEqual({
        projectPath: root,
        compositions: [
          {
            name: "Main",
            filePath: "index.html",
            dataCompositionId: "main",
            width: 1920,
            height: 1080,
            kind: "root",
          },
          {
            name: "Lower Third",
            filePath: "compositions/lower-third.html",
            dataCompositionId: "lower-third",
            width: 1920,
            height: 220,
            kind: "external",
            parentDataCompositionId: "main",
          },
        ],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
