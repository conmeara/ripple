/**
 * API fetch helper for optional hosted Ripple services.
 *
 * Renderer CSP stays local-first; hosted requests go through the main process
 * where the configured API base can be validated before any network work.
 */

let cachedBaseUrl: string | null | undefined = undefined

/**
 * Get the optional hosted API base URL (cached after first call).
 */
export async function getApiBaseUrl(): Promise<string | null> {
  if (cachedBaseUrl !== undefined) return cachedBaseUrl
  cachedBaseUrl = await window.desktopApi.getApiBaseUrl()
  return cachedBaseUrl
}

function generateStreamId(): string {
  return `hosted_api_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function serializeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const serialized: Record<string, string> = {}
    headers.forEach((value, key) => {
      serialized[key] = value
    })
    return serialized
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return { ...headers }
}

function serializeBody(body?: BodyInit | null): string | undefined {
  if (body == null) return undefined
  if (typeof body === "string") return body
  if (body instanceof URLSearchParams) return body.toString()
  throw new Error("Hosted API fetch only supports string request bodies")
}

function makeAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError")
  }
  const error = new Error("The operation was aborted.")
  error.name = "AbortError"
  return error
}

function createHostedApiStream(streamId: string, signal?: AbortSignal | null) {
  let cleanupChunk: (() => void) | undefined
  let cleanupDone: (() => void) | undefined
  let cleanupError: (() => void) | undefined
  let cleanupAbort: (() => void) | undefined
  let settled = false

  const cleanup = () => {
    cleanupChunk?.()
    cleanupDone?.()
    cleanupError?.()
    cleanupAbort?.()
    cleanupChunk = undefined
    cleanupDone = undefined
    cleanupError = undefined
    cleanupAbort = undefined
  }

  const abortMainFetch = () => {
    window.desktopApi.abortHostedApiFetch?.(streamId).catch(() => {})
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      cleanupChunk = window.desktopApi.onStreamChunk(streamId, (chunk) => {
        if (!settled) controller.enqueue(new Uint8Array(chunk))
      })
      cleanupDone = window.desktopApi.onStreamDone(streamId, () => {
        if (settled) return
        settled = true
        cleanup()
        controller.close()
      })
      cleanupError = window.desktopApi.onStreamError(streamId, (error) => {
        if (settled) return
        settled = true
        cleanup()
        controller.error(new Error(error))
      })

      if (signal) {
        const abort = () => {
          if (settled) return
          settled = true
          abortMainFetch()
          cleanup()
          controller.error(makeAbortError())
        }
        signal.addEventListener("abort", abort, { once: true })
        cleanupAbort = () => signal.removeEventListener("abort", abort)
        if (signal.aborted) abort()
      }
    },
    cancel() {
      if (settled) return
      settled = true
      abortMainFetch()
      cleanup()
    },
  })

  return { stream, cleanup }
}

/**
 * Fetch a relative hosted API path through the main process.
 *
 * @param path - API path (e.g., "/api/tts")
 * @param init - Fetch init options
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
  _options?: { withCredentials?: boolean }
): Promise<Response> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Hosted API fetch requires a relative API path")
  }

  const baseUrl = await getApiBaseUrl()
  if (!baseUrl) {
    throw new Error("Hosted API is not configured for this Ripple build")
  }

  if (!window.desktopApi?.hostedApiFetch) {
    throw new Error("Hosted API bridge is not available")
  }

  const streamId = generateStreamId()
  const { stream, cleanup } = createHostedApiStream(streamId, init?.signal)

  if (init?.signal?.aborted) {
    cleanup()
    throw makeAbortError()
  }

  const result = await window.desktopApi.hostedApiFetch(streamId, path, {
    method: init?.method,
    headers: serializeHeaders(init?.headers),
    body: serializeBody(init?.body),
  })

  if (init?.signal?.aborted) {
    cleanup()
    throw makeAbortError()
  }

  if (result.status === 0) {
    cleanup()
    throw new Error(result.error || "Hosted API request failed")
  }

  if (result.error) {
    cleanup()
    return new Response(result.error, {
      status: result.status,
      headers: result.headers,
    })
  }

  const responseBody = [204, 205, 304].includes(result.status) ? null : stream
  return new Response(responseBody, {
    status: result.status,
    headers: result.headers,
  })
}
