import {
  HyperframesEngineVisualBackend,
  hyperframesEngineVisualBackend,
} from "./backends/hyperframes-engine"
import {
  FastBrowserVisualBackend,
  fastBrowserVisualBackend,
} from "./backends/fast-browser"
import {
  HyperframesCliVisualBackend,
  hyperframesCliVisualBackend,
} from "./backends/hyperframes-cli"
import {
  ProducerCaptureVisualBackend,
  producerCaptureVisualBackend,
} from "./backends/producer-capture"
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

export function createVisualCaptureBackend(id: VisualContextBackendId): VisualCaptureBackend | null {
  if (id === "engine") return new HyperframesEngineVisualBackend()
  if (id === "producer-capture") return new ProducerCaptureVisualBackend()
  if (id === "fast-browser") return new FastBrowserVisualBackend()
  if (id === "hyperframes-cli") return new HyperframesCliVisualBackend()
  return null
}

export function listImplementedVisualCaptureBackends(): VisualCaptureBackend[] {
  return Object.values(implementedBackends)
}
