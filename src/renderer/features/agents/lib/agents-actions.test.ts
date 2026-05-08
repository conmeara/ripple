import { describe, expect, test } from "bun:test"
import { executeAgentAction } from "./agents-actions"

describe("agent actions", () => {
  test("routes New Project shortcuts to the project entry flow", async () => {
    const calls: string[] = []
    const selectedProject = {
      id: "project-1",
      name: "Launch Video",
      path: "/Users/example/Ripple/launch-video",
    }

    const result = await executeAgentAction(
      "create-new-agent",
      {
        selectedChatId: "chat-1",
        selectedProject,
        releaseSelectedChat: async (id) => {
          calls.push(`release:${id}`)
        },
        setProjectEntryReturnProject: (project) => {
          calls.push(`return:${project?.id ?? "null"}`)
        },
        setSelectedProject: (project) => {
          calls.push(`project:${project?.id ?? "null"}`)
        },
        setSelectedChatId: (id) => {
          calls.push(`chat:${id ?? "null"}`)
        },
        setSelectedDraftId: (id) => {
          calls.push(`draft:${id ?? "null"}`)
        },
        setShowNewChatForm: (show) => {
          calls.push(`form:${String(show)}`)
        },
        setDesktopView: (view) => {
          calls.push(`view:${view ?? "null"}`)
        },
      },
      "hotkey",
    )

    expect(result).toEqual({ success: true })
    expect(calls).toEqual([
      "release:chat-1",
      "return:project-1",
      "project:null",
      "chat:null",
      "draft:null",
      "form:true",
      "view:null",
    ])
  })

  test("does not release ownership when no chat is selected", async () => {
    let releaseCount = 0

    await executeAgentAction(
      "create-new-agent",
      {
        selectedChatId: null,
        releaseSelectedChat: async () => {
          releaseCount += 1
        },
      },
      "hotkey",
    )

    expect(releaseCount).toBe(0)
  })

  test("opens the Kanban board from another surface", async () => {
    const calls: string[] = []

    const result = await executeAgentAction(
      "open-kanban",
      {
        selectedChatId: "chat-1",
        selectedDraftId: "draft-1",
        showNewChatForm: true,
        desktopView: "inbox",
        setSelectedChatId: (id) => {
          calls.push(`chat:${id ?? "null"}`)
        },
        setSelectedDraftId: (id) => {
          calls.push(`draft:${id ?? "null"}`)
        },
        setShowNewChatForm: (show) => {
          calls.push(`form:${String(show)}`)
        },
        setDesktopView: (view) => {
          calls.push(`view:${view ?? "null"}`)
        },
      },
      "hotkey",
    )

    expect(result).toEqual({ success: true })
    expect(calls).toEqual([
      "chat:null",
      "draft:null",
      "form:false",
      "view:null",
    ])
  })

  test("closes the Kanban board when it is already open", async () => {
    const calls: string[] = []

    const result = await executeAgentAction(
      "open-kanban",
      {
        selectedChatId: null,
        selectedDraftId: null,
        showNewChatForm: false,
        desktopView: null,
        setSelectedChatId: (id) => {
          calls.push(`chat:${id ?? "null"}`)
        },
        setSelectedDraftId: (id) => {
          calls.push(`draft:${id ?? "null"}`)
        },
        setShowNewChatForm: (show) => {
          calls.push(`form:${String(show)}`)
        },
        setDesktopView: (view) => {
          calls.push(`view:${view ?? "null"}`)
        },
      },
      "ui_button",
    )

    expect(result).toEqual({ success: true })
    expect(calls).toEqual([
      "chat:null",
      "draft:null",
      "form:true",
      "view:null",
    ])
  })
})
