import { describe, expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  resolveVisualCompositionTarget,
  VisualCompositionTargetError,
} from "./composition-targeting"

async function makeProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "ripple-visual-target-"))
  await mkdir(join(projectPath, "compositions"), { recursive: true })
  await mkdir(join(projectPath, "assets"), { recursive: true })
  await writeFile(join(projectPath, "hyperframes.json"), JSON.stringify({
    entry: "index.html",
  }))
  await writeFile(join(projectPath, "index.html"), "<html><body>Main</body></html>")
  await writeFile(
    join(projectPath, "compositions", "lower-third.html"),
    '<html><body><img src="../assets/logo.png">Lower third</body></html>',
  )
  await writeFile(join(projectPath, "assets", "logo.png"), "placeholder")
  return projectPath
}

function expectVisualTargetError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(VisualCompositionTargetError)
  expect((error as VisualCompositionTargetError).code).toBe(code)
}

async function expectRejectedTargetError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise
  } catch (error) {
    expectVisualTargetError(error, code)
    return
  }
  throw new Error(`Expected visual composition target error ${code}.`)
}

describe("visual composition targeting", () => {
  test("targets the default entry composition", async () => {
    const projectPath = await makeProject()
    try {
      const target = await resolveVisualCompositionTarget({ projectPath })

      expect(target.compositionPath).toBe("index.html")
      expect(target.entryPath).toBe("index.html")
      expect(target.isEntryComposition).toBe(true)
      expect(target.compositionFilePath).toBe(resolve(projectPath, "index.html"))
      expect(target.fallbackReason).toBeNull()
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("targets a non-entry composition without claiming entry-only support", async () => {
    const projectPath = await makeProject()
    try {
      const target = await resolveVisualCompositionTarget({
        projectPath,
        compositionPath: "compositions/lower-third.html",
      })

      expect(target.compositionPath).toBe("compositions/lower-third.html")
      expect(target.entryPath).toBe("index.html")
      expect(target.isEntryComposition).toBe(false)
      expect(target.compositionRealPath).toBe(
        await realpath(resolve(projectPath, "compositions/lower-third.html")),
      )
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("falls back to index.html when hyperframes.json is missing", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-visual-target-"))
    try {
      await writeFile(join(projectPath, "index.html"), "<html><body>Main</body></html>")

      const target = await resolveVisualCompositionTarget({ projectPath })

      expect(target.entryPath).toBe("index.html")
      expect(target.compositionPath).toBe("index.html")
      expect(target.isEntryComposition).toBe(true)
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("rejects path traversal composition targets", async () => {
    const projectPath = await makeProject()
    try {
      await expectRejectedTargetError(resolveVisualCompositionTarget({
        projectPath,
        compositionPath: "../outside.html",
      }), "COMPOSITION_PATH_ESCAPE")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("rejects symlinked composition escapes", async () => {
    if (process.platform === "win32") return

    const projectPath = await makeProject()
    const outsidePath = await mkdtemp(join(tmpdir(), "ripple-visual-target-outside-"))
    try {
      await writeFile(join(outsidePath, "escape.html"), "<html>outside</html>")
      await symlink(
        join(outsidePath, "escape.html"),
        join(projectPath, "compositions", "escape.html"),
      )

      await expectRejectedTargetError(resolveVisualCompositionTarget({
        projectPath,
        compositionPath: "compositions/escape.html",
      }), "COMPOSITION_SYMLINK_ESCAPE")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(outsidePath, { recursive: true, force: true })
    }
  })

  test("rejects renderer composition identity mismatches", async () => {
    const projectPath = await makeProject()
    try {
      await expectRejectedTargetError(resolveVisualCompositionTarget({
        projectPath,
        compositionPath: "index.html",
        rendererIdentity: {
          projectPath,
          sourcePath: projectPath,
          compositionPath: "compositions/lower-third.html",
          dirtyGeneration: "generation-1",
        },
      }), "RENDERER_IDENTITY_MISMATCH")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("keeps renderer dirty generation when identity matches", async () => {
    const projectPath = await makeProject()
    try {
      const target = await resolveVisualCompositionTarget({
        projectPath,
        compositionPath: "index.html",
        rendererIdentity: {
          projectPath,
          sourcePath: projectPath,
          compositionPath: "index.html",
          dirtyGeneration: "generation-2",
        },
      })

      expect(target.rendererDirtyGeneration).toBe("generation-2")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("falls back to canonical project when generated-change workspace is gone", async () => {
    const projectPath = await makeProject()
    const sourcePath = `${projectPath}-missing-workspace`
    try {
      const target = await resolveVisualCompositionTarget({
        projectPath,
        sourcePath,
        allowMissingSourceFallback: true,
        sourceRevisionId: "revision-1",
      })

      expect(target.sourcePath).toBe(resolve(projectPath))
      expect(target.sourceRevisionId).toBe("revision-1")
      expect(target.fallbackReason).toBe("source-workspace-missing")
      expect(target.compositionPath).toBe("index.html")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("targets an existing generated-change workspace separately from canonical storage", async () => {
    const projectPath = await makeProject()
    const sourcePath = await mkdtemp(join(tmpdir(), "ripple-visual-target-source-"))
    try {
      await cp(projectPath, sourcePath, { recursive: true })
      await writeFile(join(sourcePath, "index.html"), "<html><body>Changed</body></html>")

      const target = await resolveVisualCompositionTarget({
        projectPath,
        sourcePath,
        sourceRevisionId: "revision-2",
      })

      expect(target.projectRealPath).toBe(await realpath(projectPath))
      expect(target.sourceRealPath).toBe(await realpath(sourcePath))
      expect(target.sourceRevisionId).toBe("revision-2")
      expect(target.compositionFilePath).toBe(resolve(sourcePath, "index.html"))
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(sourcePath, { recursive: true, force: true })
    }
  })
})
