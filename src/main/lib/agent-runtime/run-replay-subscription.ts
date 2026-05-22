import { observable } from "@trpc/server/observable"
import { isActiveAgentRunStatus } from "./types"

type AgentRunReplayRun = {
  id: string
  status?: string | null
  provider?: string | null
  model?: string | null
}

type AgentRunReplayEvent = {
  id?: string | null
  agentRunId?: string | null
  sequence?: number | null
  type?: string | null
  payload?: Record<string, unknown> | null
  payloadJson?: string | null
}

export type AgentRunReplayMessage =
  | { type: "run"; run: AgentRunReplayRun; reused: true; replayed: true }
  | { type: "event"; event: AgentRunReplayEvent }
  | { type: "run-complete"; run: AgentRunReplayRun }
  | { type: "error"; runId: string; message: string }

export interface AgentRunReplayDependencies {
  getRun: (runId: string) => AgentRunReplayRun | null
  listEvents: (runId: string) => AgentRunReplayEvent[]
  subscribe: (
    runId: string,
    onEvent: (event: AgentRunReplayEvent) => void,
  ) => () => void
}

function eventPayload(event: AgentRunReplayEvent): Record<string, unknown> {
  if (event.payload && typeof event.payload === "object") return event.payload
  if (typeof event.payloadJson !== "string") return {}
  try {
    const parsed = JSON.parse(event.payloadJson || "{}")
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function isTerminalStatusEvent(event: AgentRunReplayEvent): boolean {
  if (event.type !== "status") return false
  const status = eventPayload(event).status
  return typeof status === "string" && !isActiveAgentRunStatus(status)
}

function eventDedupeKey(event: AgentRunReplayEvent): string | null {
  if (event.id) return event.id
  if (event.agentRunId && typeof event.sequence === "number") {
    return `${event.agentRunId}:${event.sequence}`
  }
  return null
}

export function createAgentRunReplayObservable(
  runId: string,
  deps: AgentRunReplayDependencies,
) {
  return observable<AgentRunReplayMessage>((emit) => {
    let active = true
    let unsubscribe: (() => void) | null = null

    const safeNext = (value: AgentRunReplayMessage) => {
      if (!active) return
      try {
        emit.next(value)
      } catch {
        active = false
      }
    }

    const safeComplete = () => {
      if (!active) return
      active = false
      unsubscribe?.()
      unsubscribe = null
      try {
        emit.complete()
      } catch {
        // Ignore double completion.
      }
    }

    const emittedEvents = new Set<string>()
    const safeEvent = (event: AgentRunReplayEvent) => {
      const key = eventDedupeKey(event)
      if (key && emittedEvents.has(key)) return
      if (key) emittedEvents.add(key)
      safeNext({ type: "event", event })
    }

    let replaying = true
    const bufferedLiveEvents: AgentRunReplayEvent[] = []

    const completeWithRun = () => {
      const run = deps.getRun(runId)
      if (run) safeNext({ type: "run-complete", run })
      safeComplete()
    }

    ;(async () => {
      try {
        const run = deps.getRun(runId)
        if (!run) {
          safeNext({
            type: "error",
            runId,
            message: "Agent run is no longer available.",
          })
          safeComplete()
          return
        }

        safeNext({ type: "run", run, reused: true, replayed: true })
        unsubscribe = deps.subscribe(runId, (event) => {
          if (replaying) {
            bufferedLiveEvents.push(event)
            return
          }
          safeEvent(event)
          if (isTerminalStatusEvent(event)) completeWithRun()
        })

        for (const event of deps.listEvents(runId)) {
          safeEvent(event)
          if (isTerminalStatusEvent(event)) {
            completeWithRun()
            return
          }
        }

        replaying = false
        for (const event of bufferedLiveEvents.sort((a, b) =>
          (typeof a.sequence === "number" ? a.sequence : 0) -
          (typeof b.sequence === "number" ? b.sequence : 0)
        )) {
          safeEvent(event)
          if (isTerminalStatusEvent(event)) {
            completeWithRun()
            return
          }
        }
        bufferedLiveEvents.length = 0

        const current = deps.getRun(runId)
        if (!current || !isActiveAgentRunStatus(current.status)) {
          completeWithRun()
        }
      } catch (error) {
        safeNext({
          type: "error",
          runId,
          message: error instanceof Error ? error.message : String(error),
        })
        safeComplete()
      }
    })()

    return () => {
      active = false
      unsubscribe?.()
      unsubscribe = null
    }
  })
}
