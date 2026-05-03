import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  checkRippleAgentInstructionFiles,
  ensureRippleAgentInstructionFiles,
  renderRippleAgentInstructions,
} from "./agent-instructions"

describe("Ripple agent instruction files", () => {
  test("creates short user-editable Codex and Claude project notes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-agent-instructions-"))
    try {
      const result = await ensureRippleAgentInstructionFiles(root)

      expect(result.files.map((file) => [file.fileName, file.status])).toEqual([
        ["AGENTS.md", "created"],
        ["CLAUDE.md", "created"],
      ])
      await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toContain(
        "Ripple Project Notes For Codex",
      )
      await expect(readFile(join(root, "CLAUDE.md"), "utf8")).resolves.toContain(
        "Ripple Project Notes For Claude",
      )
      expect(renderRippleAgentInstructions("AGENTS.md")).toContain(
        "Ripple supplies app-level motion-editing policy",
      )
      await expect(readFile(join(root, ".ripple", "agent-notes.json"), "utf8"))
        .resolves.toContain("templateHash")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("does not overwrite user-modified instruction files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-agent-instructions-"))
    try {
      await ensureRippleAgentInstructionFiles(root)
      await writeFile(join(root, "AGENTS.md"), "# Custom project policy\n", "utf8")

      const result = await ensureRippleAgentInstructionFiles(root)
      const checked = await checkRippleAgentInstructionFiles(root)

      expect(result.files.find((file) => file.fileName === "AGENTS.md")?.status)
        .toBe("user-modified")
      expect(checked.files.find((file) => file.fileName === "CLAUDE.md")?.status)
        .toBe("present")
      await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toBe(
        "# Custom project policy\n",
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
