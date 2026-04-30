import { describe, expect, test } from "bun:test"
import {
  BUILTIN_SLASH_COMMANDS,
  COMMAND_PROMPTS,
  filterBuiltinCommands,
  isPromptCommand,
} from "./builtin-commands"

describe("builtin slash commands", () => {
  test("keeps chat-facing commands available without legacy sub-chat language", () => {
    const clear = BUILTIN_SLASH_COMMANDS.find((command) => command.command === "/clear")
    const plan = BUILTIN_SLASH_COMMANDS.find((command) => command.command === "/plan")
    const agent = BUILTIN_SLASH_COMMANDS.find((command) => command.command === "/agent")

    expect(clear?.description).toBe("Start a new chat")
    expect(plan?.description).toContain("Plan mode")
    expect(agent?.description).toContain("Agent mode")
    expect(BUILTIN_SLASH_COMMANDS.map((command) => command.description).join(" "))
      .not.toMatch(/sub-chat|subchat/i)
  })

  test("filters built-in slash commands by name and description", () => {
    expect(filterBuiltinCommands("security").map((command) => command.command))
      .toEqual(["/security-review"])
    expect(filterBuiltinCommands("release").map((command) => command.command))
      .toEqual(["/release-notes"])
    expect(filterBuiltinCommands("")).toHaveLength(BUILTIN_SLASH_COMMANDS.length)
  })

  test("marks prompt commands that should be sent into the active agent chat", () => {
    expect(isPromptCommand("review")).toBe(true)
    expect(isPromptCommand("commit")).toBe(true)
    expect(isPromptCommand("project-setup")).toBe(true)
    expect(isPromptCommand("clear")).toBe(false)
    expect(COMMAND_PROMPTS["project-setup"]).toContain(".ripple/worktree.json")
  })
})
