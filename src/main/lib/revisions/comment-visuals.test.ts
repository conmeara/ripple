import { describe, expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  captureCommentVisualForAnchor,
  prepareCanonicalVisualDir,
  resolveCommentVisualAttachmentsForRun,
} from "./comment-visuals"
import { prepareRuntimeAttachments } from "../agent-runtime/runtime-attachments"
import type {
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
  VisualContextService,
} from "../visual-context"

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

async function copyVisualQaProject(): Promise<{ root: string; projectPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "ripple-comment-visual-qa-"))
  const projectPath = join(root, "project")
  await cp("test/fixtures/hyperframes/visual-capture-qa", projectPath, { recursive: true })
  await rm(join(projectPath, ".ripple"), { recursive: true, force: true })
  return { root, projectPath }
}

async function makeNonEntryProject(): Promise<{ root: string; projectPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "ripple-comment-visual-non-entry-"))
  const projectPath = join(root, "project")
  await mkdir(join(projectPath, "compositions"), { recursive: true })
  await writeFile(join(projectPath, "hyperframes.json"), JSON.stringify({
    entry: "index.html",
    width: 320,
    height: 180,
    fps: 30,
  }))
  await writeFile(join(projectPath, "index.html"), "<!doctype html><title>Main</title>")
  await writeFile(join(projectPath, "compositions", "app-showcase.html"), `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #111827; }
      main { width: 320px; height: 180px; background: #8b5cf6; }
    </style>
  </head>
  <body>
    <main data-composition-id="app-showcase"></main>
    <script>
      window.__hf = {
        duration: 1,
        seek: function () {}
      };
    </script>
  </body>
</html>`)
  return { root, projectPath }
}

describe("comment visual context", () => {
  test("captures point comments through the live preview surface when preview identity is available", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-comment-preview-frame-"))
    const requests: VisualCaptureFramesRequest[] = []
    const service: VisualContextService = {
      warmProject: async () => undefined,
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
      captureSnapshot: async () => {
        throw new Error("Not used.")
      },
      captureFrames: async (request): Promise<VisualCaptureFramesResult> => {
        requests.push(request)
        const outputDir = request.outputDir
        if (!outputDir) throw new Error("Expected an output directory.")
        await mkdir(outputDir, { recursive: true })
        const framePath = join(outputDir, "current.png")
        await writeFile(framePath, ONE_BY_ONE_PNG)
        return {
          backend: "preview",
          frames: [{
            index: 0,
            timeMs: request.timestampsMs[0],
            frame: Math.round((request.timestampsMs[0] / 1000) * request.fps),
            path: framePath,
            width: 1,
            height: 1,
            sizeBytes: ONE_BY_ONE_PNG.byteLength,
          }],
          elapsedMs: 8,
          timings: { previewCaptureMs: 8 },
          warnings: [],
          cleanupPaths: [],
        }
      },
    }

    try {
      const result = await captureCommentVisualForAnchor({
        db: fakeDbReturning(null),
        project: {
          id: "project-1",
          path: projectPath,
          localPath: projectPath,
        } as any,
        composition: { id: "composition-1", filePath: "index.html" } as any,
        anchor: {
          anchorType: "frame",
          startTime: 0.5,
          startFrame: 15,
        },
        threadId: "thread-preview-frame",
        previewSurfaceKey: "project-1:composition-1:main",
        service,
      })

      expect(result).toEqual({
        kind: "frame",
        relativePath: ".ripple/comment-visuals/thread-preview-frame/frame.png",
      })
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        intent: "current-frame",
        preferredBackend: "preview",
        previewSurfaceKey: "project-1:composition-1:main",
        expectedPreviewTimeMs: 500,
        projectId: "project-1",
        compositionId: "composition-1",
      })
      await expect(stat(join(projectPath, result!.relativePath))).resolves.toBeTruthy()
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("captures frame comments through the Visual Context Service into canonical comment visuals", async () => {
    const { root, projectPath } = await copyVisualQaProject()
    try {
      const result = await captureCommentVisualForAnchor({
        db: fakeDbReturning(null),
        project: {
          id: "project-1",
          path: projectPath,
          localPath: projectPath,
        } as any,
        composition: { filePath: "index.html" } as any,
        anchor: {
          anchorType: "frame",
          startTime: 0.5,
          startFrame: 15,
        },
        threadId: "thread-engine-frame",
        repoRoot: process.cwd(),
      })

      expect(result).toEqual({
        kind: "frame",
        relativePath: ".ripple/comment-visuals/thread-engine-frame/frame.png",
      })
      if (!result) throw new Error("Expected a captured comment frame.")
      const captured = await stat(join(projectPath, result.relativePath))
      expect(captured.isFile()).toBe(true)
      expect(captured.size).toBeGreaterThan(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("captures range comments as fast frame sheets in canonical comment visuals", async () => {
    const { root, projectPath } = await copyVisualQaProject()
    try {
      const result = await captureCommentVisualForAnchor({
        db: fakeDbReturning(null),
        project: {
          id: "project-1",
          path: projectPath,
          localPath: projectPath,
        } as any,
        composition: { filePath: "index.html" } as any,
        anchor: {
          anchorType: "range",
          startTime: 0,
          endTime: 1,
          startFrame: 0,
          endFrame: 30,
        },
        threadId: "thread-engine-range",
        repoRoot: process.cwd(),
      })

      expect(result).toEqual({
        kind: "range_sheet",
        relativePath: ".ripple/comment-visuals/thread-engine-range/sheet.png",
      })
      if (!result) throw new Error("Expected a captured comment frame sheet.")
      const captured = await stat(join(projectPath, result.relativePath))
      const manifest = await stat(join(projectPath, ".ripple/comment-visuals/thread-engine-range/manifest.json"))
      expect(captured.isFile()).toBe(true)
      expect(captured.size).toBeGreaterThan(0)
      expect(manifest.isFile()).toBe(true)
      expect(manifest.size).toBeGreaterThan(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("captures frame comments for external compositions instead of skipping automatic visuals", async () => {
    const { root, projectPath } = await makeNonEntryProject()
    try {
      const result = await captureCommentVisualForAnchor({
        db: fakeDbReturning(null),
        project: {
          id: "project-1",
          path: projectPath,
          localPath: projectPath,
        } as any,
        composition: { filePath: "compositions/app-showcase.html" } as any,
        anchor: {
          anchorType: "frame",
          startTime: 0.5,
          startFrame: 15,
        },
        threadId: "thread-external-frame",
        repoRoot: process.cwd(),
      })

      expect(result).toEqual({
        kind: "frame",
        relativePath: ".ripple/comment-visuals/thread-external-frame/frame.png",
      })
      if (!result) throw new Error("Expected a captured external composition frame.")
      const captured = await stat(join(projectPath, result.relativePath))
      expect(captured.isFile()).toBe(true)
      expect(captured.size).toBeGreaterThan(100)
    } finally {
      await rm(root, { recursive: true, force: true })
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

      const prepared = await prepareRuntimeAttachments({
        runId: "run-comment-visual",
        cwd: projectPath,
        attachments: resolved.attachments,
      })

      expect(prepared.imageContentBlocks).toEqual([
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: ONE_BY_ONE_PNG.toString("base64"),
          },
        },
      ])
      expect(prepared.promptSuffix).toContain(
        ".ripple/tmp/agent-attachments/run-comment-visual/frame.png",
      )
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("accepts project paths that resolve through a filesystem symlink", async () => {
    if (process.platform === "win32") return

    const projectPath = await mkdtemp(join(tmpdir(), "ripple-comment-visual-project-"))
    const linkRoot = await mkdtemp(join(tmpdir(), "ripple-comment-visual-link-"))
    const linkedProjectPath = join(linkRoot, "linked-project")
    try {
      await symlink(projectPath, linkedProjectPath, "dir")

      await expect(prepareCanonicalVisualDir({
        projectPath: linkedProjectPath,
        threadId: "thread-through-link",
      })).resolves.toBe(
        join(linkedProjectPath, ".ripple", "comment-visuals", "thread-through-link"),
      )
    } finally {
      await rm(linkRoot, { recursive: true, force: true })
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
