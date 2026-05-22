"use client"

import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState } from "react"
import {
  buildAgentRuntimeAssistantProjection,
  type RuntimeEventLike,
} from "../../../../shared/agent-runtime-ui-projection"
import { selectedProjectAtom } from "../atoms"
import { AssistantMessageItem } from "../main/assistant-message-item"

export const AGENT_RUNTIME_UI_E2E_FIXTURE_STORAGE_KEY =
  "ripple:agent-runtime-ui-e2e-fixture"

type FixtureCheckpoint = {
  name: string
  eventCount: number
  live: boolean
}

type RuntimeUiFixture = {
  name?: string
  projectPath?: string
  source?: {
    provider?: string
    status?: string
  }
  events: RuntimeEventLike[]
  checkpoints: FixtureCheckpoint[]
}

type HarnessPayload = {
  fixture: RuntimeUiFixture
  checkpointIndex?: number
  checkpointName?: string
}

declare global {
  interface Window {
    __RIPPLE_AGENT_UI_SET_CHECKPOINT__?: (input: number | string) => void
  }
}

type ParsedHarnessPayload =
  | {
    ok: true
    payload: HarnessPayload
    checkpoint: FixtureCheckpoint
    checkpointIndex: number
  }
  | {
    ok: false
    message: string
  }

function readHarnessPayload(): ParsedHarnessPayload {
  const raw = window.localStorage.getItem(AGENT_RUNTIME_UI_E2E_FIXTURE_STORAGE_KEY)
  if (!raw) return { ok: false, message: "No fixture payload found." }

  try {
    const payload = JSON.parse(raw) as HarnessPayload
    const checkpoints = payload.fixture?.checkpoints
    if (!payload.fixture || !Array.isArray(payload.fixture.events) || !Array.isArray(checkpoints)) {
      return { ok: false, message: "Fixture payload is malformed." }
    }

    const checkpointIndex =
      typeof payload.checkpointName === "string"
        ? checkpoints.findIndex((candidate) => candidate.name === payload.checkpointName)
        : typeof payload.checkpointIndex === "number"
          ? payload.checkpointIndex
          : checkpoints.length - 1
    const checkpoint = checkpoints[checkpointIndex]

    if (!checkpoint) {
      return { ok: false, message: "Fixture checkpoint was not found." }
    }

    return { ok: true, payload, checkpoint, checkpointIndex }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not parse fixture payload.",
    }
  }
}

export function shouldShowAgentRuntimeUiE2EHarness(): boolean {
  return Boolean(
    window.__RIPPLE_E2E__ === true &&
    window.location.hash.startsWith("#agent-runtime-ui-fixture"),
  )
}

export function AgentRuntimeUiE2EHarness() {
  const parsed = useMemo(readHarnessPayload, [])
  const [checkpointIndex, setCheckpointIndex] = useState(() =>
    parsed.ok ? parsed.checkpointIndex : 0
  )
  const setSelectedProject = useSetAtom(selectedProjectAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  useEffect(() => {
    if (!parsed.ok) return

    const setTemporalCheckpoint = (input: number | string) => {
      const checkpoints = parsed.payload.fixture.checkpoints
      const nextIndex = typeof input === "number"
        ? input
        : checkpoints.findIndex((checkpoint) => checkpoint.name === input)
      if (nextIndex < 0 || nextIndex >= checkpoints.length) return
      setCheckpointIndex(nextIndex)
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ checkpointIndex?: number; checkpointName?: string }>).detail
      if (typeof detail?.checkpointIndex === "number") {
        setTemporalCheckpoint(detail.checkpointIndex)
      } else if (typeof detail?.checkpointName === "string") {
        setTemporalCheckpoint(detail.checkpointName)
      }
    }

    window.__RIPPLE_AGENT_UI_SET_CHECKPOINT__ = setTemporalCheckpoint
    window.addEventListener("ripple-agent-ui:set-checkpoint", handler)
    return () => {
      if (window.__RIPPLE_AGENT_UI_SET_CHECKPOINT__ === setTemporalCheckpoint) {
        delete window.__RIPPLE_AGENT_UI_SET_CHECKPOINT__
      }
      window.removeEventListener("ripple-agent-ui:set-checkpoint", handler)
    }
  }, [parsed])

  const projectPath = parsed.ok
    ? parsed.payload.fixture.projectPath ?? "/Users/motion/Ripple Projects/Fixture Project"
    : null
  const project = useMemo(() => {
    if (!projectPath) return null
    return {
      id: "agent-runtime-ui-e2e-project",
      name: "Fixture Project",
      path: projectPath,
      localPath: projectPath,
      setupStatus: "ready" as const,
    }
  }, [projectPath])

  useEffect(() => {
    if (project) setSelectedProject(project)
  }, [project, setSelectedProject])

  const message = useMemo(() => {
    if (!parsed.ok) return null
    const checkpoint = parsed.payload.fixture.checkpoints[checkpointIndex] ?? parsed.checkpoint
    const projection = buildAgentRuntimeAssistantProjection({
      events: parsed.payload.fixture.events.slice(0, checkpoint.eventCount),
      fallbackText: "",
      finalize: !checkpoint.live,
      includeFallback: false,
      messageId: `agent-runtime-ui-e2e-${checkpoint.eventCount}`,
    })
    return projection
  }, [checkpointIndex, parsed])

  if (!parsed.ok) {
    return (
      <main
        data-testid="agent-runtime-ui-e2e-harness"
        className="h-full w-full overflow-auto bg-background p-6 text-foreground"
      >
        <div role="alert" className="text-sm text-destructive">{parsed.message}</div>
      </main>
    )
  }

  const projectReady = Boolean(projectPath && selectedProject?.path === projectPath)
  const checkpoint = parsed.payload.fixture.checkpoints[checkpointIndex] ?? parsed.checkpoint
  const status = checkpoint.live
    ? "streaming"
    : parsed.payload.fixture.source?.status ?? "completed"

  return (
    <main
      data-testid="agent-runtime-ui-e2e-harness"
      data-fixture-provider={parsed.payload.fixture.source?.provider ?? "unknown"}
      data-fixture-checkpoint={checkpoint.name}
      data-fixture-checkpoint-index={checkpointIndex}
      className="h-full w-full overflow-auto bg-background p-6 text-foreground"
    >
      <div className="mx-auto max-w-3xl">
        {projectReady && message ? (
          <AssistantMessageItem
            message={message}
            isLastMessage={true}
            isStreaming={checkpoint.live}
            status={status}
            isMobile={false}
            subChatId="agent-runtime-ui-e2e-sub-chat"
            chatId="agent-runtime-ui-e2e-chat"
            sandboxSetupStatus="ready"
          />
        ) : (
          <div className="text-sm text-muted-foreground">Loading fixture...</div>
        )}
      </div>
    </main>
  )
}
