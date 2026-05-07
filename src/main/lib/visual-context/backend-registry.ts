import { hyperframesEngineVisualBackend } from "./backends/hyperframes-engine"
import { fastBrowserVisualBackend } from "./backends/fast-browser"
import { hyperframesCliVisualBackend } from "./backends/hyperframes-cli"
import { producerCaptureVisualBackend } from "./backends/producer-capture"
import type { VisualCaptureBackend, VisualContextBackendId } from "./types"

const implementedBackends: Partial<Record<VisualContextBackendId, VisualCaptureBackend>> = {
  engine: hyperframesEngineVisualBackend,
  "producer-capture": producerCaptureVisualBackend,
  "fast-browser": fastBrowserVisualBackend,
  "hyperframes-cli": hyperframesCliVisualBackend,
}

export function getVisualCaptureBackend(id: VisualContextBackendId): VisualCaptureBackend | null {
  return implementedBackends[id] ?? null
}

export function listImplementedVisualCaptureBackends(): VisualCaptureBackend[] {
  return Object.values(implementedBackends)
}
