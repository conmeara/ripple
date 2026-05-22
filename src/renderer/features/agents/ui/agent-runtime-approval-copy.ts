type ApprovalLine = { label: string; value: string }

function stringifyApprovalValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return null
}

export function approvalCommandAction(command: string | null): string {
  const normalized = command?.toLowerCase() ?? ""
  if (normalized.includes("export")) return "export a preview"
  if (normalized.includes("render")) return "render a preview"
  if (normalized.includes("ripple snapshot")) return "check the current frame"
  if (normalized.includes("ripple frame-sheet")) return "review motion over time"
  if (
    normalized.includes("lint") ||
    normalized.includes("validate") ||
    normalized.includes("test") ||
    normalized.includes("check")
  ) {
    return "check the project"
  }
  return "continue with a project operation"
}

export function approvalSummaryLines(payload: Record<string, any>): ApprovalLine[] {
  const lines: ApprovalLine[] = []
  const reason = stringifyApprovalValue(payload.reason)
  const command = stringifyApprovalValue(payload.command)
  const description = stringifyApprovalValue(payload.description)

  if (payload.kind === "command") {
    lines.push({ label: "Action", value: approvalCommandAction(command) })
  } else if (payload.kind === "file_change") {
    lines.push({ label: "Action", value: "update the project" })
  }
  if (reason) lines.push({ label: "Reason", value: reason })
  if (description && description !== reason) lines.push({ label: "Details", value: description })
  return lines.slice(0, 5)
}

export function approvalTechnicalLines(payload: Record<string, any>): ApprovalLine[] {
  const lines: ApprovalLine[] = []
  const providerName = stringifyApprovalValue(payload.providerName)
  const toolName = stringifyApprovalValue(payload.toolName)
  const command = stringifyApprovalValue(payload.command)
  const cwd = stringifyApprovalValue(payload.cwd)
  const blockedPath = stringifyApprovalValue(payload.blockedPath)
  const serverName = stringifyApprovalValue(payload.serverName)
  const url = stringifyApprovalValue(payload.url)
  const networkHost = stringifyApprovalValue(payload.networkApprovalContext?.host)
  const paths = Array.isArray(payload.paths)
    ? payload.paths.filter((path: unknown): path is string => typeof path === "string")
    : []
  const requestedPaths = Array.isArray(payload.requestedPermissionPaths)
    ? payload.requestedPermissionPaths.filter((path: unknown): path is string => typeof path === "string")
    : []

  if (providerName) lines.push({ label: "Agent", value: providerName })
  if (serverName) lines.push({ label: "Source", value: serverName })
  if (toolName) lines.push({ label: "Tool", value: toolName })
  if (command) lines.push({ label: "Command", value: command })
  if (url) lines.push({ label: "URL", value: url })
  if (networkHost) lines.push({ label: "Network", value: networkHost })
  if (blockedPath) lines.push({ label: "Path", value: blockedPath })
  if (cwd) lines.push({ label: "Location", value: cwd })
  if (paths.length > 0) lines.push({ label: "Files", value: paths.slice(0, 3).join(", ") })
  if (requestedPaths.length > 0) {
    lines.push({ label: "Access", value: requestedPaths.slice(0, 3).join(", ") })
  }
  return lines.slice(0, 8)
}

export function approvalTitle(payload: Record<string, any>, statusOverride?: string | null): string {
  const status = statusOverride ?? stringifyApprovalValue(payload.status)
  switch (status) {
    case "approved":
      return "Permission approved"
    case "denied":
      return "Permission denied"
    case "cancelled":
      return "Permission request cancelled"
    case "unavailable":
      return "Permission request unavailable"
  }

  switch (payload.kind) {
    case "network":
      return "Approval needed to connect to the web"
    case "command":
      return `Approval needed to ${approvalCommandAction(stringifyApprovalValue(payload.command))}`
    case "file_change":
      return "Approval needed to update the project"
    case "permission":
      return "Approval needed for project access"
    case "user_input":
      return "Input needed"
    default:
      return "Approval needed"
  }
}

export function shouldHideResolvedProjectLocalApproval(payload: Record<string, any>): boolean {
  if (payload.kind === "network" || payload.kind === "user_input") return false
  if (stringifyApprovalValue(payload.status) !== "approved") return false
  if (stringifyApprovalValue(payload.approvalWarning)) return false
  if (payload.requestedNetwork === true) return false
  if (payload.networkApprovalContext) return false
  if (stringifyApprovalValue(payload.url)) return false

  return payload.kind === "command" ||
    payload.kind === "file_change" ||
    payload.kind === "permission"
}
