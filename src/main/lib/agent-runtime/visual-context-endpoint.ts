import {
  attachVisualContextSourceInvalidation,
  createVisualContextEndpoint,
  createVisualContextService,
  type VisualContextService,
  type VisualCurrentFrameSnapshot,
  type VisualContextSourceInvalidationHandle,
  type VisualContextEndpointHandle,
} from "../visual-context"

export interface AgentVisualContextEndpoint {
  endpoint: string
  token: string
  close(): Promise<void>
}

export interface AgentVisualContextEndpointOptions {
  service?: VisualContextService
  resolveCurrentFrameSnapshot?: (request: Record<string, unknown>) => Promise<VisualCurrentFrameSnapshot | null>
}

export async function createAgentVisualContextEndpoint(
  workspaceRoot: string,
  options: AgentVisualContextEndpointOptions = {},
): Promise<AgentVisualContextEndpoint | null> {
  const service = options.service ?? createVisualContextService()
  let endpoint: VisualContextEndpointHandle | null = null
  let sourceInvalidation: VisualContextSourceInvalidationHandle | null = null
  try {
    endpoint = await createVisualContextEndpoint({
      service,
      workspaceRoot,
      resolveCurrentFrameSnapshot: options.resolveCurrentFrameSnapshot,
    })
    sourceInvalidation = await attachVisualContextSourceInvalidation({
      service,
      projectPath: workspaceRoot,
    }).catch((error) => {
      console.warn("[Ripple] Could not attach visual context source invalidation:", error)
      return null
    })
    return {
      endpoint: endpoint.endpoint,
      token: endpoint.token,
      close: async () => {
        await endpoint?.close().catch(() => undefined)
        await sourceInvalidation?.close().catch(() => undefined)
        await service.shutdown().catch(() => undefined)
      },
    }
  } catch (error) {
    await endpoint?.close().catch(() => undefined)
    await sourceInvalidation?.close().catch(() => undefined)
    await service.shutdown().catch(() => undefined)
    console.warn("[Ripple] Could not start visual context endpoint:", error)
    return null
  }
}
