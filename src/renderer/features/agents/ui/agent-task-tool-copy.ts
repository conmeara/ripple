import {
  designerFacingAgentRuntimeLine,
  titleForAgentRuntimeSummaryPart,
} from "../../../../shared/agent-runtime-summary"

export const AGENT_TASK_INTERRUPTED_NAME = "Agent"

export function agentTaskToolTitle(isPending: boolean): string {
  return isPending ? "Working on project" : "Project work complete"
}

export function agentTaskToolSubtitle(input: {
  isPending: boolean
  nestedTools: any[]
  description?: string | null
  maxLength?: number
}): string {
  if (input.isPending && input.nestedTools.length > 0) {
    const lastTool = input.nestedTools[input.nestedTools.length - 1]
    if (lastTool) return titleForAgentRuntimeSummaryPart(lastTool)
  }

  if (!input.description) return ""

  const maxLength = input.maxLength ?? 60
  const safeDescription = designerFacingAgentRuntimeLine(input.description)
  return safeDescription.length > maxLength
    ? `${safeDescription.slice(0, Math.max(0, maxLength - 3))}...`
    : safeDescription
}
