/**
 * tRPC client for an optional hosted backend.
 * Uses signedFetch via IPC for authentication (no CORS issues)
 */
import { createTRPCClient, httpLink } from "@trpc/client"
import type { AppRouter } from "../../../../web/server/api/root"
import SuperJSON from "superjson"

// Placeholder URL - actual base is fetched dynamically from main process
const TRPC_PLACEHOLDER = "/__dynamic__/api/trpc"

// Cache the API base URL after first fetch
let cachedApiBase: string | null | undefined = undefined

async function getApiBase(): Promise<string | null> {
  if (cachedApiBase === undefined) {
    cachedApiBase = await window.desktopApi?.getApiBaseUrl() ?? null
  }
  return cachedApiBase
}

/**
 * Custom fetch that goes through Electron IPC
 * Automatically adds auth token and bypasses CORS
 * Replaces placeholder URL with actual API base from env
 */
const signedFetch: typeof fetch = async (input, init) => {
  if (typeof window === "undefined" || !window.desktopApi?.signedFetch) {
    throw new Error("Desktop API not available")
  }

  let url = typeof input === "string" ? input : input.toString()

  // Replace placeholder with actual API base
  if (url.startsWith("/__dynamic__")) {
    const apiBase = await getApiBase()
    if (!apiBase) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: "Hosted API is not configured" }),
        text: async () => JSON.stringify({ error: "Hosted API is not configured" }),
      } as Response
    }
    url = url.replace("/__dynamic__", apiBase)
  }

  const result = await window.desktopApi.signedFetch(url, {
    method: init?.method,
    body: init?.body as string | undefined,
    headers: init?.headers as Record<string, string> | undefined,
  })

  // Convert IPC result to Response-like object
  return {
    ok: result.ok,
    status: result.status,
    json: async () => result.data,
    text: async () => JSON.stringify(result.data),
  } as Response
}

/**
 * tRPC client connected to web backend
 * Fully typed, handles superjson automatically
 */
export const remoteTrpc = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: TRPC_PLACEHOLDER,
      fetch: signedFetch,
      transformer: SuperJSON,
    }),
  ],
})
