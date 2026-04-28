import { protocol, session, type Protocol } from "electron"
import { existsSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import {
  normalizeProjectRelativePath,
  resolveHyperframesPreviewContext,
  resolveProjectRelativePath,
} from "./project-context"
import {
  HYPERFRAMES_PLAYER_GSAP_PATH,
  HYPERFRAMES_PLAYER_PROTOCOL,
  HYPERFRAMES_PLAYER_PREVIEW_COMP_PREFIX,
  HYPERFRAMES_PLAYER_PREVIEW_ROOT_PATH,
  HYPERFRAMES_PLAYER_RUNTIME_PATH,
  buildHyperframesPreparedPreviewDocument,
  getHyperframesPlayerMimeType,
  loadHyperframesPlayerBundledGsapSource,
  loadHyperframesPlayerRuntimeSource,
  upgradeLegacyRippleStarterHtmlForPreview,
} from "./player-source"

let privilegesRegistered = false
const registeredProtocolScopes = new Set<string>()

function response(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

function parsePreviewUrl(rawUrl: string): {
  projectId: string
  relativePath: string
  isRuntime: boolean
  isBundledGsap: boolean
  preparedFilePath: string | null
  preparedKind: "root" | "external" | null
} {
  const url = new URL(rawUrl)
  const projectId = decodeURIComponent(url.hostname)
  const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "index.html"
  const isPreparedRoot = relativePath === HYPERFRAMES_PLAYER_PREVIEW_ROOT_PATH
  const isPreparedComposition = relativePath.startsWith(
    HYPERFRAMES_PLAYER_PREVIEW_COMP_PREFIX,
  )

  return {
    projectId,
    relativePath,
    isRuntime: relativePath === HYPERFRAMES_PLAYER_RUNTIME_PATH,
    isBundledGsap: relativePath === HYPERFRAMES_PLAYER_GSAP_PATH,
    preparedFilePath: isPreparedRoot
      ? "index.html"
      : isPreparedComposition
        ? relativePath.slice(HYPERFRAMES_PLAYER_PREVIEW_COMP_PREFIX.length)
        : null,
    preparedKind: isPreparedRoot ? "root" : isPreparedComposition ? "external" : null,
  }
}

function buildStaticHeaders(input: {
  contentType: string
  contentLength: number
  status?: number
  contentRange?: string
}): Headers {
  const headers = new Headers({
    "Content-Type": input.contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": String(input.contentLength),
    "Cache-Control": "no-store",
  })

  if (input.contentRange) {
    headers.set("Content-Range", input.contentRange)
  }

  return headers
}

function createStaticResponse(input: {
  request: Request
  buffer: Buffer
  contentType: string
}): Response {
  const rangeHeader = input.request.headers.get("range")

  if (rangeHeader) {
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader)
    if (match) {
      const start = parseInt(match[1]!, 10)
      const requestedEnd = match[2] ? parseInt(match[2], 10) : input.buffer.length - 1
      const end = Math.min(requestedEnd, input.buffer.length - 1)

      if (start <= end) {
        const chunk = input.buffer.slice(start, end + 1)
        const headers = buildStaticHeaders({
          contentType: input.contentType,
          contentLength: chunk.length,
          status: 206,
          contentRange: `bytes ${start}-${end}/${input.buffer.length}`,
        })

        return new Response(
          input.request.method === "HEAD" ? null : new Uint8Array(chunk),
          { status: 206, headers },
        )
      }
    }
  }

  return new Response(
    input.request.method === "HEAD" ? null : new Uint8Array(input.buffer),
    {
      headers: buildStaticHeaders({
        contentType: input.contentType,
        contentLength: input.buffer.length,
      }),
    },
  )
}

async function handleHyperframesPlayerRequest(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return response(405, "Method not allowed.")
  }

  try {
    const {
      projectId,
      relativePath,
      isRuntime,
      isBundledGsap,
      preparedFilePath,
      preparedKind,
    } = parsePreviewUrl(request.url)
    if (!projectId) return response(404, "Project not found.")

    if (isRuntime) {
      const runtime = Buffer.from(loadHyperframesPlayerRuntimeSource(), "utf-8")
      return createStaticResponse({
        request,
        buffer: runtime,
        contentType: "application/javascript; charset=utf-8",
      })
    }

    if (isBundledGsap) {
      const gsap = loadHyperframesPlayerBundledGsapSource(HYPERFRAMES_PLAYER_GSAP_PATH)
      if (!gsap) return response(404, "File not found.")

      const buffer = Buffer.from(gsap, "utf-8")
      return createStaticResponse({
        request,
        buffer,
        contentType: "application/javascript; charset=utf-8",
      })
    }

    const context = await resolveHyperframesPreviewContext({ projectId })

    if (preparedFilePath && preparedKind) {
      const html = await buildHyperframesPreparedPreviewDocument({
        context,
        filePath: preparedFilePath,
        kind: preparedKind,
      })
      const buffer = Buffer.from(html, "utf-8")

      return createStaticResponse({
        request,
        buffer,
        contentType: "text/html; charset=utf-8",
      })
    }

    const normalizedPath = normalizeProjectRelativePath(relativePath)
    const absolutePath = resolveProjectRelativePath(context, normalizedPath)

    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      return response(404, "File not found.")
    }

    const legacyGsap = loadHyperframesPlayerBundledGsapSource(normalizedPath)
    if (legacyGsap) {
      const buffer = Buffer.from(legacyGsap, "utf-8")
      return createStaticResponse({
        request,
        buffer,
        contentType: "application/javascript; charset=utf-8",
      })
    }

    let buffer = await readFile(absolutePath)
    if (getHyperframesPlayerMimeType(normalizedPath).startsWith("text/html")) {
      buffer = Buffer.from(
        upgradeLegacyRippleStarterHtmlForPreview(buffer.toString("utf-8")),
        "utf-8",
      )
    }

    return createStaticResponse({
      request,
      buffer,
      contentType: getHyperframesPlayerMimeType(normalizedPath),
    })
  } catch (error) {
    console.warn("[HyperFramesPlayerProtocol] Request failed:", error)
    return response(404, "File not found.")
  }
}

export function registerHyperframesPlayerProtocolPrivileges(): void {
  if (privilegesRegistered) return

  protocol.registerSchemesAsPrivileged([
    {
      scheme: HYPERFRAMES_PLAYER_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
  privilegesRegistered = true
}

export function registerHyperframesPlayerSourceProtocol(): void {
  registerProtocolHandler(protocol, "default")
  registerProtocolHandler(session.fromPartition("persist:main").protocol, "persist:main")
}

function registerProtocolHandler(protocolApi: Protocol, scope: string): void {
  if (registeredProtocolScopes.has(scope)) return

  try {
    protocolApi.handle(HYPERFRAMES_PLAYER_PROTOCOL, handleHyperframesPlayerRequest)
    registeredProtocolScopes.add(scope)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes("registered")) {
      throw error
    }
    registeredProtocolScopes.add(scope)
  }
}
