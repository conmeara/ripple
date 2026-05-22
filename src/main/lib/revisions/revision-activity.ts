import { latestAgentRuntimeActivityLine } from "../../../shared/agent-runtime-summary"

export interface RevisionActivityEvent {
  type: string
  providerType?: string | null
  payloadJson?: string | null
  payload?: Record<string, unknown> | null
}

export function extractRevisionRunActivityLine(
  events: RevisionActivityEvent[],
): string | null {
  return latestAgentRuntimeActivityLine(events)
}
