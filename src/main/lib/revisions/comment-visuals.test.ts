import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  canCaptureCompositionWithHyperframesSnapshot,
  prepareCanonicalVisualDir,
  resolveCommentVisualAttachmentsForRun,
} from "./comment-visuals"

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

function fakeDbReturning(thread: any) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => thread,
        }),
      }),
    }),
  } as any
}

describe("comment visual context", () => {
  test("only claims HyperFrames snapshot correctness for the project entry composition", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-comment-visual-project-"))
    try {
      await writeFile(join(projectPath, "hyperframes.json"), JSON.stringify({
        entry: "index.html",
      }))

      await expect(canCaptureCompositionWithHyperframesSnapshot({
        projectPath,
        composition: { filePath: "index.html" } as any,
      })).resolves.toBe(true)
      await expect(canCaptureCompositionWithHyperframesSnapshot({
        projectPath,
        composition: { filePath: "compositions/lower-third.html" } as any,
      })).resolves.toBe(false)
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("loads stored comment visuals as runtime-only image attachments", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-comment-visual-project-"))
    try {
      const visualDir = join(projectPath, ".ripple", "comment-visuals", "thread-1")
      await mkdir(visualDir, { recursive: true })
      await writeFile(join(visualDir, "frame.png"), ONE_BY_ONE_PNG)

      const resolved = await resolveCommentVisualAttachmentsForRun({
        db: fakeDbReturning({
          id: "thread-1",
          screenshotPath: ".ripple/comment-visuals/thread-1/frame.png",
          startTime: 250,
          startFrame: 8,
        }),
        run: { threadId: "thread-1" },
        projectPath,
      })

      expect(resolved.attachments).toHaveLength(1)
      expect(resolved.attachments[0].type).toBe("image")
      expect(resolved.attachments[0].filename).toBe("frame.png")
      expect(resolved.promptContext).toContain("current-frame screenshot")
      expect(resolved.promptContext).toContain("frame 8")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("rejects comment visual storage symlinks before creating out-of-project directories", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-comment-visual-project-"))
    const outsidePath = await mkdtemp(join(tmpdir(), "ripple-comment-visual-outside-"))
    try {
      await symlink(outsidePath, join(projectPath, ".ripple"), "dir")

      await expect(prepareCanonicalVisualDir({
        projectPath,
        threadId: "thread-escape",
      })).rejects.toThrow("outside the project")

      await expect(readdir(outsidePath)).resolves.toEqual([])
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(outsidePath, { recursive: true, force: true })
    }
  })

  test("rejects comment-visuals symlinks before writing thread artifacts outside the project", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-comment-visual-project-"))
    const outsidePath = await mkdtemp(join(tmpdir(), "ripple-comment-visual-outside-"))
    try {
      await mkdir(join(projectPath, ".ripple"), { recursive: true })
      await symlink(outsidePath, join(projectPath, ".ripple", "comment-visuals"), "dir")

      await expect(prepareCanonicalVisualDir({
        projectPath,
        threadId: "thread-escape",
      })).rejects.toThrow("outside the project")

      await expect(readdir(outsidePath)).resolves.toEqual([])
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(outsidePath, { recursive: true, force: true })
    }
  })
})
