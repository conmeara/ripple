import { join } from "node:path"
import {
  attachVisualContextSourceInvalidation,
  createVisualContextFileBridge,
  createVisualContextService,
  type VisualContextFileBridgeHandle,
  type VisualContextService,
  type VisualCurrentFrameSnapshot,
  type VisualContextSourceInvalidationHandle,
} from "../visual-context"

export interface AgentVisualContextFileBridge {
  requestDir: string
  token: string
  close(): Promise<void>
}

export interface AgentVisualContextFileBridgeOptions {
  runId: string
  service?: VisualContextService
  resolveCurrentFrameSnapshot?: (request: Record<string, unknown>) => Promise<VisualCurrentFrameSnapshot | null>
}

export async function createAgentVisualContextFileBridge(
  workspaceRoot: string,
  options: AgentVisualContextFileBridgeOptions,
): Promise<AgentVisualContextFileBridge | null> {
  const service = options.service ?? createVisualContextService()
  let bridge: VisualContextFileBridgeHandle | null = null
  let sourceInvalidation: VisualContextSourceInvalidationHandle | null = null
  try {
    bridge = await createVisualContextFileBridge({
      service,
      workspaceRoot,
      requestDir: join(workspaceRoot, ".ripple", "agent-visual-context", options.runId, "requests"),
      resolveCurrentFrameSnapshot: options.resolveCurrentFrameSnapshot,
    })
    sourceInvalidation = await attachVisualContextSourceInvalidation({
      service,
      projectPath: workspaceRoot,
    }).catch((error) => {
      console.warn("[Ripple] Could not attach visual context bridge source invalidation:", error)
      return null
    })
    return {
      requestDir: bridge.requestDir,
      token: bridge.token,
      close: async () => {
        await bridge?.close().catch(() => undefined)
        await sourceInvalidation?.close().catch(() => undefined)
        await service.shutdown().catch(() => undefined)
      },
    }
  } catch (error) {
    await bridge?.close().catch(() => undefined)
    await sourceInvalidation?.close().catch(() => undefined)
    await service.shutdown().catch(() => undefined)
    console.warn("[Ripple] Could not start visual context file bridge:", error)
    return null
  }
}
