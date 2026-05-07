import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildProjectServerEntryUrl,
  resolveProjectServerFile,
  resolveFrameSheetTimestamps,
  runFrameSheetCommand,
} from "./frame-sheet"

async function makeProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-frame-sheet-project-"))
  await writeFile(join(projectDir, "hyperframes.json"), JSON.stringify({
    name: "Frame Sheet Test",
    entry: "index.html",
    fps: 24,
    width: 1280,
    height: 720,
    duration: 8,
  }))
  await writeFile(join(projectDir, "index.html"), "<!doctype html><body></body>")
  return projectDir
}

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

describe("ripple frame-sheet sampling", () => {
  test("sorts and dedupes explicit timestamps", () => {
    const result = resolveFrameSheetTimestamps({
      at: [3000, 1000, 1000, 1500],
      range: null,
      samples: null,
      everyMs: null,
      everyFrames: null,
      fps: 30,
    })

    expect(result.timestampsMs).toEqual([1000, 1500, 3000])
    expect(result.rangeMs).toBeNull()
  })

  test("samples a time range with endpoints", () => {
    const result = resolveFrameSheetTimestamps({
      at: null,
      range: [2000, 8000],
      samples: 4,
      everyMs: null,
      everyFrames: null,
      fps: 30,
    })

    expect(result.timestampsMs).toEqual([2000, 4000, 6000, 8000])
    expect(result.rangeMs).toEqual([2000, 8000])
  })

  test("samples with time and frame intervals", () => {
    expect(resolveFrameSheetTimestamps({
      at: null,
      range: [0, 3000],
      samples: null,
      everyMs: 1000,
      everyFrames: null,
      fps: 30,
    }).timestampsMs).toEqual([0, 1000, 2000, 3000])

    expect(resolveFrameSheetTimestamps({
      at: null,
      range: [0, 1000],
      samples: null,
      everyMs: null,
      everyFrames: 15,
      fps: 30,
    }).timestampsMs).toEqual([0, 500, 1000])
  })

  test("enforces the v1 sample cap", () => {
    expect(() => resolveFrameSheetTimestamps({
      at: null,
      range: [0, 12_000],
      samples: 13,
      everyMs: null,
      everyFrames: null,
      fps: 30,
    })).toThrow("capped")
  })
})

describe("ripple frame-sheet command", () => {
  test("writes JSON, a manifest, frames, and a nonzero sheet under .ripple/frame-sheets", async () => {
    const projectDir = await makeProject()
    try {
      const result = await runFrameSheetCommand([
        "--dir",
        projectDir,
        "--range",
        "2s..4s",
        "--samples",
        "3",
        "--columns",
        "3",
        "--json",
      ], {
        idFactory: () => "fs_test",
        captureFrames: async ({ timestampsMs }) => {
          const framePaths: string[] = []
          for (const [index] of timestampsMs.entries()) {
            const path = join(projectDir, `snapshot-${index}.png`)
            await writeFile(path, ONE_BY_ONE_PNG)
            framePaths.push(path)
          }
          return { framePaths, cleanupPaths: framePaths }
        },
        assembleSheet: async ({ outputPath }) => {
          await writeFile(outputPath, ONE_BY_ONE_PNG)
        },
      })

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(true)
      expect(payload.sheet.path).toBe(".ripple/frame-sheets/fs_test/sheet.png")
      const manifest = JSON.parse(
        await readFile(join(projectDir, payload.sheet.manifestPath), "utf8"),
      )
      expect(manifest.version).toBe(1)
      expect(manifest.fps).toBe(24)
      expect(manifest.columns).toBe(3)
      expect(manifest.rows).toBe(1)
      expect(manifest.samples.map((sample: any) => sample.timeMs)).toEqual([
        2000,
        3000,
        4000,
      ])
      expect(manifest.samples.map((sample: any) => sample.frame)).toEqual([
        48,
        72,
        96,
      ])
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("uses fast agent-sized capture defaults before tiling", async () => {
    const projectDir = await makeProject()
    try {
      let captureInput: any = null
      const result = await runFrameSheetCommand([
        "--dir",
        projectDir,
        "--range",
        "0s..8s",
        "--json",
      ], {
        idFactory: () => "fs_agent",
        captureFrames: async (input) => {
          captureInput = input
          const framePaths: string[] = []
          for (const [index] of input.timestampsMs.entries()) {
            const path = join(projectDir, `agent-snapshot-${index}.png`)
            await writeFile(path, ONE_BY_ONE_PNG)
            framePaths.push(path)
          }
          return { framePaths, cleanupPaths: framePaths }
        },
        assembleSheet: async ({ outputPath, columns, rows, maxSheetWidth }) => {
          expect(columns).toBe(4)
          expect(rows).toBe(2)
          expect(maxSheetWidth).toBe(1440)
          await writeFile(outputPath, ONE_BY_ONE_PNG)
        },
      })

      expect(result.exitCode).toBe(0)
      expect(captureInput.captureMode).toBe("fast")
      expect(captureInput.settleMs).toBe(0)
      expect(captureInput.columns).toBe(4)
      expect(captureInput.rows).toBe(2)
      expect(captureInput.maxSheetWidth).toBe(1440)
      expect(captureInput.env.WS_NO_BUFFER_UTIL).toBe("1")
      expect(captureInput.env.WS_NO_UTF_8_VALIDATE).toBe("1")
      expect(captureInput.timestampsMs).toEqual([
        0,
        1143,
        2286,
        3429,
        4571,
        5714,
        6857,
        8000,
      ])
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("supports explicit hyperframes capture mode and fast settle controls", async () => {
    const projectDir = await makeProject()
    try {
      let captureInput: any = null
      const result = await runFrameSheetCommand([
        "--dir",
        projectDir,
        "--at",
        "0s,1s",
        "--capture",
        "hyperframes",
        "--settle",
        "0",
        "--max-sheet-width",
        "960",
        "--json",
      ], {
        idFactory: () => "fs_mode",
        captureFrames: async (input) => {
          captureInput = input
          const framePaths: string[] = []
          for (const [index] of input.timestampsMs.entries()) {
            const path = join(projectDir, `mode-snapshot-${index}.png`)
            await writeFile(path, ONE_BY_ONE_PNG)
            framePaths.push(path)
          }
          return { framePaths, cleanupPaths: framePaths }
        },
        assembleSheet: async ({ outputPath, maxSheetWidth }) => {
          expect(maxSheetWidth).toBe(960)
          await writeFile(outputPath, ONE_BY_ONE_PNG)
        },
      })

      expect(result.exitCode).toBe(0)
      expect(captureInput.captureMode).toBe("hyperframes")
      expect(captureInput.settleMs).toBe(0)
      expect(captureInput.maxSheetWidth).toBe(960)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  test("rejects --dir outside RIPPLE_AGENT_WORKSPACE_ROOT", async () => {
    const projectDir = await makeProject()
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ripple-frame-sheet-root-"))
    try {
      const result = await runFrameSheetCommand([
        "--dir",
        projectDir,
        "--at",
        "0s",
        "--json",
      ], {
        env: {
          RIPPLE_AGENT_WORKSPACE_ROOT: workspaceRoot,
        },
      })

      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stdout).error.code).toBe("WORKSPACE_OUTSIDE_AGENT_ROOT")
    } finally {
      await rm(projectDir, { recursive: true, force: true })
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  test("rejects frame-sheet output symlink escapes", async () => {
    const projectDir = await makeProject()
    const outside = await mkdtemp(join(tmpdir(), "ripple-frame-sheet-outside-"))
    try {
      await symlink(outside, join(projectDir, ".ripple"))
      const result = await runFrameSheetCommand([
        "--dir",
        projectDir,
        "--at",
        "0s",
        "--json",
      ], {
        captureFrames: async () => ({ framePaths: [] }),
      })

      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stdout).error.code).toBe("OUTPUT_PATH_ESCAPE")
    } finally {
      await rm(projectDir, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  test("rejects symlinked project server assets outside the project", async () => {
    const projectDir = await makeProject()
    const outside = await mkdtemp(join(tmpdir(), "ripple-frame-sheet-outside-"))
    try {
      await mkdir(join(projectDir, "assets"), { recursive: true })
      await writeFile(join(outside, "secret.png"), "secret")
      await symlink(join(outside, "secret.png"), join(projectDir, "assets", "logo.png"))

      await expect(resolveProjectServerFile(projectDir, "assets/logo.png")).resolves.toEqual({
        ok: false,
        status: 403,
      })
    } finally {
      await rm(projectDir, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  test("rejects symlinked project server entries outside the project", async () => {
    const projectDir = await makeProject()
    const outside = await mkdtemp(join(tmpdir(), "ripple-frame-sheet-outside-"))
    try {
      await writeFile(join(outside, "index.html"), "<!doctype html><body>outside</body>")
      await rm(join(projectDir, "index.html"), { force: true })
      await symlink(join(outside, "index.html"), join(projectDir, "index.html"))

      await expect(resolveProjectServerFile(projectDir, "index.html")).resolves.toEqual({
        ok: false,
        status: 403,
      })
    } finally {
      await rm(projectDir, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  test("serves nested entries at their own URL so relative assets resolve nearby", () => {
    const url = buildProjectServerEntryUrl(4321, "compositions/lower third.html")

    expect(url).toBe("http://127.0.0.1:4321/compositions/lower%20third.html")
    expect(new URL("./motion.js", url).pathname).toBe("/compositions/motion.js")
    expect(new URL("../assets/logo.png", url).pathname).toBe("/assets/logo.png")
    expect(() => buildProjectServerEntryUrl(4321, "../outside.html")).toThrow(
      "escapes the project",
    )
  })
})
