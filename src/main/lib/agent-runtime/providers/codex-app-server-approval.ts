import { resolve } from "node:path"
import { isProjectLocalPath } from "./approval-path-boundary"

type CodexAppServerApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel"
  | { applyNetworkPolicyAmendment: { network_policy_amendment: unknown } }
  | { acceptWithExecpolicyAmendment: { execpolicy_amendment: unknown } }

type CodexAppServerApprovalResponse = {
  decision: CodexAppServerApprovalDecision
  reason?: string
}

type CodexAppServerApprovalAssessment = {
  approveResponse: CodexAppServerApprovalResponse
  denyResponse: CodexAppServerApprovalResponse
  approvalWarning: string | null
  canApprove: boolean
  requestedNetwork: boolean
  requestedPermissionPaths: string[]
  unsupportedPermissionReferences: string[]
}

const AUTO_APPROVED_VISUAL_COMMAND =
  /^ripple\s+(?:snapshot|frame-sheet)(?:\s|$)/
const SHELL_CONTROL_CHARS = new Set([";", "&", "|", "<", ">", "\n", "\r"])

function isWorkspacePath(value: unknown, cwd: string): boolean {
  if (typeof value !== "string" || !value.trim()) return false
  const candidate = resolve(cwd, value)
  return isProjectLocalPath({
    workspaceRoot: cwd,
    candidatePath: candidate,
  })
}

function hasShellControlOperator(command: string): boolean {
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    const next = command[index + 1]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (char === "\"" && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (!inSingleQuote && char === "`") return true
    if (!inSingleQuote && char === "$" && next === "(") return true
    if (!inSingleQuote && !inDoubleQuote && SHELL_CONTROL_CHARS.has(char)) {
      return true
    }
  }

  return false
}

function collectPermissionPathReferences(value: unknown): {
  paths: string[]
  unsupportedReferences: string[]
} {
  if (!value || typeof value !== "object") {
    return { paths: [], unsupportedReferences: [] }
  }

  const permissions = value as Record<string, any>
  const fileSystem = permissions.fileSystem
  if (!fileSystem || typeof fileSystem !== "object") {
    return { paths: [], unsupportedReferences: [] }
  }

  const paths: string[] = []
  const unsupportedReferences: string[] = []
  for (const key of ["read", "write"]) {
    const entries = fileSystem[key]
    if (Array.isArray(entries)) {
      paths.push(...entries.filter((entry): entry is string => typeof entry === "string"))
    }
  }

  if (Array.isArray(fileSystem.entries)) {
    for (const entry of fileSystem.entries) {
      const path = entry?.path
      if (path?.type === "path" && typeof path.path === "string") {
        paths.push(path.path)
      } else if (path?.type === "glob_pattern" && typeof path.pattern === "string") {
        paths.push(path.pattern)
      } else if (path?.type === "special") {
        unsupportedReferences.push(`special:${String(path.value ?? "unknown")}`)
      }
    }
  }

  return {
    paths: Array.from(new Set(paths)),
    unsupportedReferences: Array.from(new Set(unsupportedReferences)),
  }
}

function requestedNetworkPermission(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const permissions = value as Record<string, any>
  return permissions.network?.enabled === true
}

function hasNetworkPolicyAmendment(value: unknown): boolean {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return false
}

export function approvalBoundaryWarning(
  paths: string[],
  cwd: string,
  unsupportedReferences: string[] = [],
): string | null {
  if (unsupportedReferences.length > 0) {
    return `Approval request asks for a filesystem permission Ripple cannot confine to this project: ${unsupportedReferences.join(", ")}`
  }
  for (const candidate of paths) {
    if (!isWorkspacePath(candidate, cwd)) {
      return `Approval request references a path outside the Ripple workspace: ${candidate}`
    }
  }
  return null
}

function stringDecisionOptions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function objectDecisionOptions(value: unknown): Record<string, any>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, any> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    )
    : []
}

function selectAcceptDecision(
  params: any,
): CodexAppServerApprovalDecision | null {
  const availableDecisions = params?.availableDecisions
  const decisions = stringDecisionOptions(availableDecisions)
  if (decisions.length === 0 || decisions.includes("acceptForSession")) return "acceptForSession"
  if (decisions.includes("accept")) return "accept"
  const objectDecisions = objectDecisionOptions(availableDecisions)
  if (
    params?.proposedNetworkPolicyAmendments?.[0] &&
    objectDecisions.some((decision) => "applyNetworkPolicyAmendment" in decision)
  ) {
    return {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: params.proposedNetworkPolicyAmendments[0],
      },
    }
  }
  if (
    params?.proposedExecpolicyAmendment &&
    objectDecisions.some((decision) => "acceptWithExecpolicyAmendment" in decision)
  ) {
    return {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: params.proposedExecpolicyAmendment,
      },
    }
  }
  return null
}

function selectDeclineDecision(availableDecisions: unknown): CodexAppServerApprovalDecision {
  const decisions = stringDecisionOptions(availableDecisions)
  if (decisions.length === 0 || decisions.includes("decline")) return "decline"
  if (decisions.includes("cancel")) return "cancel"
  return "decline"
}

export function assessCodexAppServerApprovalRequest(input: {
  params: any
  workspaceRoot: string
}): CodexAppServerApprovalAssessment {
  const params = input.params ?? {}
  const cwd = params.cwd
  const additionalPermissions = params.additionalPermissions
  const requestedPermissions = params.permissions
  const additionalPermissionReferences = collectPermissionPathReferences(additionalPermissions)
  const requestedPermissionReferences = collectPermissionPathReferences(requestedPermissions)
  const requestedPermissionPaths = Array.from(new Set([
    ...additionalPermissionReferences.paths,
    ...requestedPermissionReferences.paths,
  ]))
  const unsupportedPermissionReferences = Array.from(new Set([
    ...additionalPermissionReferences.unsupportedReferences,
    ...requestedPermissionReferences.unsupportedReferences,
  ]))
  const requestedNetwork =
    Boolean(params.networkApprovalContext) ||
    requestedNetworkPermission(additionalPermissions) ||
    requestedNetworkPermission(requestedPermissions) ||
    hasNetworkPolicyAmendment(params.proposedNetworkPolicyAmendments)
  const cwdBoundaryWarning = isWorkspacePath(cwd, input.workspaceRoot)
    ? null
    : `Approval requested outside the Ripple workspace: ${cwd ?? "unknown cwd"}`
  const permissionBoundaryWarning = approvalBoundaryWarning(
    requestedPermissionPaths,
    input.workspaceRoot,
    unsupportedPermissionReferences,
  )
  const networkWarning = requestedNetwork
    ? "Network access is outside Ripple's project-local sandbox for this run."
    : null
  const approvalWarning = cwdBoundaryWarning ?? networkWarning ?? permissionBoundaryWarning
  const approveDecision = selectAcceptDecision(params)

  if (!approveDecision) {
    const decisionError = "Codex did not offer an approval decision Ripple can send."
    return {
      approveResponse: {
        decision: selectDeclineDecision(params.availableDecisions),
        reason: decisionError,
      },
      denyResponse: {
        decision: selectDeclineDecision(params.availableDecisions),
        reason: decisionError,
      },
      approvalWarning: approvalWarning ?? decisionError,
      canApprove: false,
      requestedNetwork,
      requestedPermissionPaths,
      unsupportedPermissionReferences,
    }
  }

  return {
    approveResponse: { decision: approveDecision },
    denyResponse: {
      decision: selectDeclineDecision(params.availableDecisions),
      reason: "Denied by user.",
    },
    approvalWarning,
    canApprove: true,
    requestedNetwork,
    requestedPermissionPaths,
    unsupportedPermissionReferences,
  }
}

export function isCodexAppServerAutoApprovedVisualCommand(input: {
  params: any
  workspaceRoot: string
  assessment?: CodexAppServerApprovalAssessment
}): boolean {
  const params = input.params ?? {}
  const command = typeof params.command === "string" ? params.command.trim() : ""
  if (!command || hasShellControlOperator(command)) return false
  if (!AUTO_APPROVED_VISUAL_COMMAND.test(command)) return false
  if (!isWorkspacePath(params.cwd, input.workspaceRoot)) return false

  const assessment = input.assessment ??
    assessCodexAppServerApprovalRequest({
      params,
      workspaceRoot: input.workspaceRoot,
    })
  return assessment.canApprove &&
    !assessment.approvalWarning &&
    !assessment.requestedNetwork &&
    assessment.requestedPermissionPaths.length === 0 &&
    assessment.unsupportedPermissionReferences.length === 0
}

export function isCodexAppServerProjectLocalAutoApprovedRequest(input: {
  params: any
  workspaceRoot: string
  assessment?: CodexAppServerApprovalAssessment
  paths?: string[]
}): boolean {
  const assessment = input.assessment ??
    assessCodexAppServerApprovalRequest({
      params: input.params,
      workspaceRoot: input.workspaceRoot,
    })

  if (!assessment.canApprove) return false
  if (assessment.approvalWarning) return false
  if (assessment.requestedNetwork) return false
  if (assessment.unsupportedPermissionReferences.length > 0) return false

  const paths = input.paths ?? []
  if (approvalBoundaryWarning(paths, input.workspaceRoot)) return false

  return true
}

export function buildCodexPermissionApprovalResponse(input: {
  params: any
  approved: boolean
}): Record<string, unknown> {
  if (!input.approved) {
    return {
      permissions: {},
      scope: "turn",
      strictAutoReview: true,
    }
  }

  const permissions = input.params?.permissions ?? {}
  return {
    permissions: {
      ...(permissions.network ? { network: permissions.network } : {}),
      ...(permissions.fileSystem ? { fileSystem: permissions.fileSystem } : {}),
    },
    scope: "turn",
    strictAutoReview: true,
  }
}
