import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  loadAgentVisualContextHandoffAttachments,
  shouldPrepareAgentVisualContextHandoff,
} from "./visual-context-handoff"

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

describe("visual context handoff startup policy", () => {
  test("does not eagerly capture visual context unless explicitly enabled", () => {
    expect(shouldPrepareAgentVisualContextHandoff({})).toBe(false)
    expect(shouldPrepareAgentVisualContextHandoff({
      RIPPLE_EAGER_AGENT_VISUAL_CONTEXT: "0",
    })).toBe(false)
    expect(shouldPrepareAgentVisualContextHandoff({
      RIPPLE_EAGER_AGENT_VISUAL_CONTEXT: "1",
    })).toBe(true)
  })

  test("loads prepared snapshot and sheet artifacts as native runtime image attachments", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-visual-handoff-"))
    try {
      await mkdir(join(projectPath, ".ripple", "agent-visual-context", "run-1", "snapshot"), { recursive: true })
      await mkdir(join(projectPath, ".ripple", "frame-sheets", "sheet-1"), { recursive: true })
      await writeFile(
        join(projectPath, ".ripple", "agent-visual-context", "run-1", "snapshot", "current.png"),
        ONE_BY_ONE_PNG,
      )
      await writeFile(
        join(projectPath, ".ripple", "frame-sheets", "sheet-1", "sheet.png"),
        ONE_BY_ONE_PNG,
      )

      const attachments = await loadAgentVisualContextHandoffAttachments({
        projectPath,
        snapshot: {
          path: ".ripple/agent-visual-context/run-1/snapshot/current.png",
          timeMs: 500,
          frame: 15,
          width: 1,
          height: 1,
          backend: "preview",
          elapsedMs: 9,
        },
        sheet: {
          id: "sheet-1",
          path: ".ripple/frame-sheets/sheet-1/sheet.png",
          manifestPath: ".ripple/frame-sheets/sheet-1/manifest.json",
          sampleCount: 8,
          summary: "8 samples.",
          backend: "fast-browser",
          elapsedMs: 120,
        },
      })

      expect(attachments).toEqual([
        {
          type: "image",
          base64Data: ONE_BY_ONE_PNG.toString("base64"),
          mediaType: "image/png",
          filename: "current.png",
          size: ONE_BY_ONE_PNG.byteLength,
        },
        {
          type: "image",
          base64Data: ONE_BY_ONE_PNG.toString("base64"),
          mediaType: "image/png",
          filename: "sheet.png",
          size: ONE_BY_ONE_PNG.byteLength,
        },
      ])
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
