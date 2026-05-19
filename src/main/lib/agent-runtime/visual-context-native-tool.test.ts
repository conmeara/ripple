import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import {
  buildClaudeNativeVisualContextToolResult,
  buildCodexNativeVisualContextContentItems,
  buildRippleVisualDynamicToolSpecs,
  buildRippleVisualCommandArgs,
  isRippleVisualDynamicToolCall,
  loadNativeVisualContextArtifact,
  runNativeVisualContextTool,
  summarizeNativeVisualContextResult,
} from "./visual-context-native-tool"

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

describe("native visual context tool", () => {
  test("loads a snapshot artifact and adapts it to provider-native image blocks", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-native-visual-"))
    try {
      await mkdir(join(projectPath, ".ripple", "visual-context", "snapshots", "snap_1"), { recursive: true })
      await writeFile(
        join(projectPath, ".ripple", "visual-context", "snapshots", "snap_1", "current.png"),
        ONE_BY_ONE_PNG,
      )

      const result = await loadNativeVisualContextArtifact({
        projectPath,
        payload: {
          ok: true,
          type: "snapshot",
          snapshot: {
            path: ".ripple/visual-context/snapshots/snap_1/current.png",
            sample: { timeMs: 500, frame: 15 },
            width: 1,
            height: 1,
          },
          context: {
            compositionPath: "compositions/main.html",
            samples: [{ timeMs: 500, frame: 15 }],
          },
          elapsedMs: 8,
        },
      })

      expect(result.relativePath).toBe(".ripple/visual-context/snapshots/snap_1/current.png")
      expect(result.mediaType).toBe("image/png")
      expect(result.base64Data).toBe(ONE_BY_ONE_PNG.toString("base64"))

      const codexItems = buildCodexNativeVisualContextContentItems(result)
      expect(codexItems[0]).toEqual({
        type: "inputText",
        text: summarizeNativeVisualContextResult(result),
      })
      expect(codexItems[1]).toEqual({
        type: "inputImage",
        imageUrl: `data:image/png;base64,${ONE_BY_ONE_PNG.toString("base64")}`,
      })

      const claudeResult = buildClaudeNativeVisualContextToolResult(result)
      expect(claudeResult.content).toEqual([
        {
          type: "text",
          text: summarizeNativeVisualContextResult(result),
        },
        {
          type: "image",
          data: ONE_BY_ONE_PNG.toString("base64"),
          mimeType: "image/png",
        },
      ])
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("rejects visual artifacts outside the project", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-native-visual-"))
    const outsidePath = await mkdtemp(join(tmpdir(), "ripple-native-outside-"))
    try {
      await writeFile(join(outsidePath, "escape.png"), ONE_BY_ONE_PNG)
      await expect(loadNativeVisualContextArtifact({
        projectPath,
        payload: {
          ok: true,
          type: "snapshot",
          snapshot: {
            path: relative(projectPath, join(outsidePath, "escape.png")),
          },
        },
      })).rejects.toThrow("Visual context artifact escaped the project")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(outsidePath, { recursive: true, force: true })
    }
  })

  test("maps dynamic tool calls back to reversible Ripple visual commands", () => {
    expect(isRippleVisualDynamicToolCall({
      namespace: "ripple",
      tool: "snapshot",
    })).toBe(true)
    expect(isRippleVisualDynamicToolCall({
      namespace: "ripple",
      tool: "frame_sheet",
    })).toBe(true)
    expect(isRippleVisualDynamicToolCall({
      namespace: null,
      tool: "shell",
    })).toBe(false)

    expect(buildRippleVisualCommandArgs({
      tool: "snapshot",
      arguments: {
        at: "current",
        composition: "Main",
      },
    })).toEqual([
      "snapshot",
      "--at",
      "current",
      "--json",
    ])

    expect(buildRippleVisualCommandArgs({
      tool: "snapshot",
      arguments: {
        at: "current",
        compositionPath: "compositions/main.html",
      },
    })).toEqual([
      "snapshot",
      "--at",
      "current",
      "--composition",
      "compositions/main.html",
      "--json",
    ])

    expect(buildRippleVisualCommandArgs({
      tool: "frame_sheet",
      arguments: {
        range: "0s..4s",
        samples: 8,
        columns: 4,
        composition: "Main",
      },
    })).toEqual([
      "frame-sheet",
      "--range",
      "0s..4s",
      "--samples",
      "8",
      "--columns",
      "4",
      "--json",
    ])
  })

  test("describes native visual tools as the obvious first visual-context path", () => {
    const specs = buildRippleVisualDynamicToolSpecs()
    const snapshot = specs.find((spec) => spec.name === "snapshot")
    const frameSheet = specs.find((spec) => spec.name === "frame_sheet")

    expect(snapshot?.description).toContain("Use this app-managed Ripple visual tool immediately")
    expect(snapshot?.description).toContain("returns the image directly")
    expect(snapshot?.description).toContain("do not use shell commands")
    expect(snapshot?.inputSchema).toMatchObject({
      properties: {
        at: {
          description: expect.stringContaining("visible app frame"),
        },
      },
    })
    expect(frameSheet?.description).toContain("Use this app-managed Ripple visual tool immediately")
    expect(frameSheet?.description).toContain("motion over time")
    expect(frameSheet?.description).toContain("do not use shell commands")
    expect(frameSheet?.inputSchema).toMatchObject({
      properties: {
        range: {
          description: expect.stringContaining("comment range"),
        },
      },
    })
  })

  test("captures a fresh current snapshot even when a comment frame attachment exists", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-native-visual-"))
    try {
      const attachmentDir = join(projectPath, ".ripple", "tmp", "agent-attachments", "run-1")
      await mkdir(attachmentDir, { recursive: true })
      await writeFile(join(attachmentDir, "frame.png"), ONE_BY_ONE_PNG)
      const freshDir = join(projectPath, ".ripple", "visual-context", "snapshots", "fresh")
      await mkdir(freshDir, { recursive: true })
      await writeFile(join(freshDir, "current.png"), ONE_BY_ONE_PNG)
      let commandWasRun = false

      const result = await runNativeVisualContextTool({
        cwd: projectPath,
        env: {},
        tool: "snapshot",
        arguments: { at: "current" },
        runVisualCommand: async () => {
          commandWasRun = true
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              type: "snapshot",
              snapshot: { path: ".ripple/visual-context/snapshots/fresh/current.png" },
            }),
            stderr: "",
          }
        },
      })

      expect(commandWasRun).toBe(true)
      expect(result.kind).toBe("snapshot")
      expect(result.relativePath).toBe(".ripple/visual-context/snapshots/fresh/current.png")
      expect(result.base64Data).toBe(ONE_BY_ONE_PNG.toString("base64"))
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("captures a fresh frame sheet even when the requested range matches an attached comment sheet", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-native-sheet-"))
    try {
      const attachmentDir = join(projectPath, ".ripple", "tmp", "agent-attachments", "run-1")
      await mkdir(attachmentDir, { recursive: true })
      await writeFile(join(attachmentDir, "sheet.png"), ONE_BY_ONE_PNG)
      const freshDir = join(projectPath, ".ripple", "frame-sheets", "fresh")
      await mkdir(freshDir, { recursive: true })
      await writeFile(join(freshDir, "sheet.png"), ONE_BY_ONE_PNG)
      let commandWasRun = false

      const result = await runNativeVisualContextTool({
        cwd: projectPath,
        env: {},
        tool: "frame_sheet",
        arguments: { range: "1000ms..3000ms" },
        runVisualCommand: async () => {
          commandWasRun = true
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              type: "sheet",
              sheet: { path: ".ripple/frame-sheets/fresh/sheet.png" },
            }),
            stderr: "",
          }
        },
      })

      expect(commandWasRun).toBe(true)
      expect(result.kind).toBe("frame_sheet")
      expect(result.relativePath).toBe(".ripple/frame-sheets/fresh/sheet.png")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("captures a fresh frame sheet when the requested range differs from the comment sheet", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-native-sheet-"))
    try {
      const freshDir = join(projectPath, ".ripple", "frame-sheets", "fresh")
      await mkdir(freshDir, { recursive: true })
      await writeFile(join(freshDir, "sheet.png"), ONE_BY_ONE_PNG)
      let commandWasRun = false

      const result = await runNativeVisualContextTool({
        cwd: projectPath,
        env: {},
        tool: "frame_sheet",
        arguments: { range: "4000ms..6000ms" },
        runVisualCommand: async () => {
          commandWasRun = true
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              type: "sheet",
              sheet: { path: ".ripple/frame-sheets/fresh/sheet.png" },
            }),
            stderr: "",
          }
        },
      })

      expect(commandWasRun).toBe(true)
      expect(result.kind).toBe("frame_sheet")
      expect(result.relativePath).toBe(".ripple/frame-sheets/fresh/sheet.png")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("native visual tools keep backend selection app-owned", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-native-backend-owned-"))
    try {
      const outputDir = join(projectPath, ".ripple", "visual-context", "snapshots", "snap_fast")
      await mkdir(outputDir, { recursive: true })
      await writeFile(join(outputDir, "000.png"), ONE_BY_ONE_PNG)
      let observedArgs: string[] = []

      await runNativeVisualContextTool({
        cwd: projectPath,
        env: {},
        tool: "snapshot",
        arguments: {
          at: "0.5s",
          backend: "engine",
        },
        runVisualCommand: async (args) => {
          observedArgs = args
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              type: "snapshot",
              snapshot: { path: ".ripple/visual-context/snapshots/snap_fast/000.png" },
            }),
            stderr: "",
          }
        },
      })

      expect(observedArgs).toEqual([
        "snapshot",
        "--at",
        "0.5s",
        "--json",
      ])
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
