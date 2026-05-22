import { describe, expect, test } from "bun:test"
import {
  approvalCommandAction,
  approvalSummaryLines,
  approvalTitle,
  shouldHideResolvedProjectLocalApproval,
} from "./agent-runtime-approval-copy"

describe("agent runtime approval copy", () => {
  test("keeps agent name while translating commands into product actions", () => {
    expect(approvalTitle({
      providerName: "Claude",
      kind: "command",
      command: "hyperframes export --output dist/",
    })).toBe("Claude needs permission to export a preview")

    expect(approvalSummaryLines({
      providerName: "Claude",
      kind: "command",
      command: "hyperframes export --output dist/",
      cwd: "/Users/me/project",
    })).toEqual([
      { label: "Action", value: "export a preview" },
    ])

    expect(approvalSummaryLines({
      providerName: "Claude",
      kind: "command",
      command: "hyperframes export --output dist/",
      cwd: "/Users/me/project",
      showTechnicalDetails: true,
    })).toEqual([
      { label: "Action", value: "export a preview" },
      { label: "Command", value: "hyperframes export --output dist/" },
      { label: "Location", value: "/Users/me/project" },
    ])
  })

  test("does not describe project checks as bash in the default approval card", () => {
    expect(approvalCommandAction("hyperframes lint")).toBe("check the project")
    expect(approvalCommandAction("hyperframes validate .")).toBe("check the project")
    expect(approvalTitle({
      providerName: "Codex",
      kind: "command",
      command: "hyperframes lint",
    })).toBe("Codex needs permission to check the project")

    const labels = approvalSummaryLines({
      providerName: "Codex",
      kind: "command",
      command: "hyperframes lint",
    }).map((line) => line.label)

    expect(labels).toContain("Action")
    expect(labels).not.toContain("Command")
  })

  test("hides only already-approved project-local approval cards", () => {
    expect(shouldHideResolvedProjectLocalApproval({
      providerName: "Claude",
      kind: "file_change",
      status: "approved",
      toolName: "Edit",
      reason: "index.html",
    })).toBe(true)

    expect(shouldHideResolvedProjectLocalApproval({
      providerName: "Codex",
      kind: "command",
      status: "approved",
      command: "bun test",
    })).toBe(true)

    expect(shouldHideResolvedProjectLocalApproval({
      providerName: "Claude",
      kind: "file_change",
      status: "pending",
      toolName: "Edit",
    })).toBe(false)

    expect(shouldHideResolvedProjectLocalApproval({
      providerName: "Claude",
      kind: "network",
      status: "approved",
      requestedNetwork: true,
    })).toBe(false)

    expect(shouldHideResolvedProjectLocalApproval({
      providerName: "Codex",
      kind: "permission",
      status: "approved",
      approvalWarning: "Approval request references a path outside the Ripple workspace: /Users/me/.ssh",
    })).toBe(false)
  })

  test("uses resolved approval titles once the request is no longer actionable", () => {
    expect(approvalTitle({
      providerName: "Claude",
      kind: "file_change",
      status: "cancelled",
    })).toBe("Claude permission request cancelled")

    expect(approvalTitle({
      providerName: "Codex",
      kind: "command",
      command: "hyperframes validate .",
    }, "denied")).toBe("Codex permission denied")
  })
})
