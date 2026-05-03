import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

describe("Claude runtime capabilities source contract", () => {
  test("uses app policy append with native CLAUDE.md discovery and managed skills", async () => {
    const source = await readFile(
      "src/main/lib/agent-runtime/providers/claude-runtime-capabilities.ts",
      "utf8",
    )

    expect(source).toContain("CLAUDE.md")
    expect(source).toContain("settingSources")
    expect(source).toContain("runContext.appPolicy")
    expect(source).toContain("skills: \"all\"")
    expect(source).toContain("getClaudeHyperframesPluginRoot")
    expect(source).not.toContain("AGENTS.md")
  })
})
