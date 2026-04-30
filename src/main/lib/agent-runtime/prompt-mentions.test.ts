import { describe, expect, test } from "bun:test"
import { prepareAgentRuntimePrompt } from "./prompt-mentions"

describe("prepareAgentRuntimePrompt", () => {
  test("turns skill, agent, and MCP mentions into provider-readable instructions", () => {
    const prepared = prepareAgentRuntimePrompt(
      '@[skill:oracle] @[agent:reviewer] @[tool:mcp__linear__search] Check @[file:local:compositions/title.html]',
    )

    expect(prepared.skillMentions).toEqual(["oracle"])
    expect(prepared.agentMentions).toEqual(["reviewer"])
    expect(prepared.toolMentions).toEqual(["mcp__linear__search"])
    expect(prepared.prompt).toContain("Use the mcp__linear__search tool")
    expect(prepared.prompt).toContain("Use the reviewer agent(s)")
    expect(prepared.prompt).toContain('Use the "oracle" skill(s)')
    expect(prepared.prompt).toContain("Check compositions/title.html")
    expect(prepared.prompt).not.toContain("@[skill:")
  })

  test("ignores unsafe tool mention names instead of passing them to providers", () => {
    const prepared = prepareAgentRuntimePrompt(
      "@[tool:bad/tool] @[tool:good_server] Use the right source.",
    )

    expect(prepared.toolMentions).toEqual(["good_server"])
    expect(prepared.prompt).toContain("Use tools from the good_server MCP server")
    expect(prepared.prompt).not.toContain("bad/tool")
  })

  test("preserves file and folder context while stripping provider-only mention markup", () => {
    const prepared = prepareAgentRuntimePrompt(
      "Update @[folder:local:compositions] using @[file:external:brand/brief.md] with @[skill:motion-review].",
    )

    expect(prepared.folderMentions).toEqual(["local:compositions"])
    expect(prepared.fileMentions).toEqual(["external:brand/brief.md"])
    expect(prepared.skillMentions).toEqual(["motion-review"])
    expect(prepared.cleanedPrompt).toBe(
      "Update compositions using brand/brief.md with .",
    )
    expect(prepared.prompt).toContain('Use the "motion-review" skill(s)')
    expect(prepared.prompt).toContain("Update compositions using brand/brief.md")
    expect(prepared.prompt).not.toContain("@[")
  })
})
