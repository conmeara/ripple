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
  templateId: "blank",
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
      ])

      await stat(join(root, "index.html"))
      await stat(join(root, "compositions"))
      await stat(join(root, "assets", "vendor", "gsap.min.js"))
      await stat(join(root, "exports"))
      await stat(join(root, "hyperframes.json"))
      await stat(join(root, "meta.json"))
      await stat(join(root, ".gitignore"))
      await stat(join(root, "AGENTS.md"))
      await stat(join(root, "CLAUDE.md"))
      await stat(join(root, ".ripple", "agent-notes.json"))
      expect(result.agentNotes?.files.map((file) => file.status)).toEqual([
        "created",
        "created",
      ])

      const indexHtml = await readFile(join(root, "index.html"), "utf8")
      expect(indexHtml).toContain('<link rel="icon" href="data:," />')
      expect(indexHtml).toContain('data-composition-id="main"')
      expect(indexHtml).toContain('data-width="1920"')
      expect(indexHtml).toContain('data-height="1080"')
      expect(indexHtml).toContain('class="clip ripple-template-content"')
      expect(indexHtml).toContain('data-start="0"')
      expect(indexHtml).toContain('data-duration="6"')
      expect(indexHtml).not.toContain("data-composition-src")
      expect(indexHtml).not.toContain("lower-third")
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
        templateId: "blank",
        compositions: ["index.html"],
      })

      const metaJson = JSON.parse(await readFile(join(root, "meta.json"), "utf8"))
      expect(metaJson).toMatchObject({
        app: "Ripple",
        projectName: "Launch Video",
        templateId: "blank",
        createdWith: "ripple-phase-12",
      })

      const gitignore = await readFile(join(root, ".gitignore"), "utf8")
      expect(gitignore).toContain("exports/")
      expect(gitignore).toContain("snapshots/")
      expect(gitignore).toContain(".ripple/tmp/")
      expect(gitignore).toContain(".ripple/agent-attachments/")

      const agentsMd = await readFile(join(root, "AGENTS.md"), "utf8")
      const claudeMd = await readFile(join(root, "CLAUDE.md"), "utf8")
      expect(agentsMd).toContain("Ripple Project Notes For Codex")
      expect(claudeMd).toContain("Ripple Project Notes For Claude")
      expect(agentsMd).not.toContain("Treat compositions as plain HyperFrames")
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
      const second = await writeRippleProjectScaffold(root, metadata)
      expect(second).toMatchObject({
        projectPath: root,
        agentNotes: {
          files: expect.arrayContaining([
            expect.objectContaining({ fileName: "AGENTS.md", status: "present" }),
            expect.objectContaining({ fileName: "CLAUDE.md", status: "present" }),
          ]),
        },
        compositions: [
          {
            name: "Main",
            filePath: "index.html",
            dataCompositionId: "main",
            width: 1920,
            height: 1080,
            kind: "root",
          },
        ],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("writes a selected project template with offline metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-scaffold-"))
    try {
      const result = await writeRippleProjectScaffold(root, {
        ...metadata,
        templateId: "yt-lower-third",
      })

      expect(result.compositions[0]).toMatchObject({
        filePath: "index.html",
        width: 1920,
        height: 1080,
      })

      const indexHtml = await readFile(join(root, "index.html"), "utf8")
      expect(indexHtml).toContain('data-composition-id="main"')
      expect(indexHtml).toContain('data-width="1920"')
      expect(indexHtml).toContain('data-height="1080"')
      expect(indexHtml).toContain("assets/hyperframes-catalog/yt-lower-third/avatar.jpg")
      expect(indexHtml).not.toContain("https://")
      await stat(join(root, "assets", "hyperframes-catalog", "yt-lower-third", "avatar.jpg"))

      const hyperframesJson = JSON.parse(
        await readFile(join(root, "hyperframes.json"), "utf8"),
      )
      expect(hyperframesJson).toMatchObject({
        templateId: "yt-lower-third",
        width: 1920,
        height: 1080,
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("honors caller dimensions for the blank project starter", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-scaffold-"))
    try {
      const result = await writeRippleProjectScaffold(root, {
        ...metadata,
        aspectRatioPreset: "square-1-1",
        templateId: "blank",
        width: 1080,
        height: 1080,
      })

      expect(result.compositions[0]).toMatchObject({
        filePath: "index.html",
        width: 1080,
        height: 1080,
      })

      const indexHtml = await readFile(join(root, "index.html"), "utf8")
      expect(indexHtml).toContain('data-width="1080"')
      expect(indexHtml).toContain('data-height="1080"')

      const hyperframesJson = JSON.parse(
        await readFile(join(root, "hyperframes.json"), "utf8"),
      )
      expect(hyperframesJson).toMatchObject({
        templateId: "blank",
        width: 1080,
        height: 1080,
      })

      const metaJson = JSON.parse(await readFile(join(root, "meta.json"), "utf8"))
      expect(metaJson).toMatchObject({
        templateId: "blank",
        width: 1080,
        height: 1080,
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
