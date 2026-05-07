import { createServer, type Server } from "node:http"
import { readFile, realpath, stat } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { isPathInsideDirectory } from "../../../shared/path-boundary"
import {
  pathExists,
  resolvePackageJsonPath,
} from "../hyperframes/runtime"

export type VisualProjectFileResolution =
  | {
    ok: true
    path: string
    contentType: string
  }
  | {
    ok: false
    status: 403 | 404
  }

export interface VisualProjectServerHandle {
  server: Server
  url: string
  origin: string
  projectRealPath: string
}

async function resolveGsapRuntimePath(repoRoot?: string): Promise<string | null> {
  const candidates = [
    repoRoot ? resolve(repoRoot, "node_modules", "gsap", "dist", "gsap.min.js") : null,
    (() => {
      const packageJsonPath = resolvePackageJsonPath("gsap")
      return packageJsonPath ? resolve(dirname(packageJsonPath), "dist", "gsap.min.js") : null
    })(),
  ].filter((path): path is string => Boolean(path))

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }
  return null
}

function contentTypeForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith(".html")) return "text/html; charset=utf-8"
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (lower.endsWith(".css")) return "text/css; charset=utf-8"
  if (lower.endsWith(".json")) return "application/json; charset=utf-8"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  if (lower.endsWith(".mp4")) return "video/mp4"
  if (lower.endsWith(".webm")) return "video/webm"
  if (lower.endsWith(".mp3")) return "audio/mpeg"
  if (lower.endsWith(".wav")) return "audio/wav"
  return "application/octet-stream"
}

function normalizeVisualProjectRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "")
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    isAbsolute(normalized) ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    return null
  }
  return normalized
}

function isDeniedVisualProjectPath(path: string): boolean {
  const parts = path.split("/")
  if (parts.includes(".git") || parts.includes(".ripple")) return true
  const base = parts[parts.length - 1]?.toLowerCase() ?? ""
  if (base === ".env" || base.startsWith(".env.")) return true
  return base.endsWith(".pem") || base.endsWith(".key") || base.endsWith(".crt")
}

export async function resolveVisualProjectFile(
  projectDir: string,
  projectRelativePath: string,
): Promise<VisualProjectFileResolution> {
  const relativePath = normalizeVisualProjectRelativePath(projectRelativePath)
  if (!relativePath || isDeniedVisualProjectPath(relativePath)) {
    return { ok: false, status: 403 }
  }

  const projectRealPath = await realpath(projectDir)
  const candidatePath = resolve(projectRealPath, relativePath)
  if (!isPathInsideDirectory(projectRealPath, candidatePath)) {
    return { ok: false, status: 403 }
  }

  let candidateRealPath: string
  try {
    candidateRealPath = await realpath(candidatePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, status: 404 }
    }
    throw error
  }

  if (!isPathInsideDirectory(projectRealPath, candidateRealPath)) {
    return { ok: false, status: 403 }
  }

  const info = await stat(candidateRealPath)
  if (!info.isFile()) {
    return { ok: false, status: 404 }
  }

  return {
    ok: true,
    path: candidateRealPath,
    contentType: contentTypeForPath(candidateRealPath),
  }
}

export function buildVisualProjectEntryUrl(port: number, entry: string): string {
  const normalizedEntry = normalizeVisualProjectRelativePath(entry)
  if (!normalizedEntry) {
    throw new Error("Visual project entry must stay inside the project.")
  }
  const encodedEntry = normalizedEntry
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return `http://127.0.0.1:${port}/${encodedEntry}`
}

function normalizeRequestPath(pathname: string): string {
  return decodeURIComponent(pathname).replace(/^\/+/, "")
}

function getEntryBaseHref(entry: string): string {
  const directory = dirname(entry).replace(/\\/g, "/")
  if (!directory || directory === ".") return "/"
  return `/${directory.replace(/^\/+|\/+$/g, "")}/`
}

function injectHtmlBaseHref(body: Uint8Array, baseHref: string): Uint8Array {
  const html = Buffer.from(body).toString("utf8")
  if (/<base\b/i.test(html)) return body
  const baseTag = `<base href="${baseHref}">`
  if (/<head[^>]*>/i.test(html)) {
    return Buffer.from(html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`), "utf8")
  }
  return Buffer.from(`${baseTag}${html}`, "utf8")
}

export async function serveVisualProject(input: {
  projectDir: string
  entry?: string
  repoRoot?: string
}): Promise<VisualProjectServerHandle> {
  const projectRealPath = await realpath(input.projectDir)
  const entry = input.entry ?? "index.html"
  const gsapPath = await resolveGsapRuntimePath(input.repoRoot)
  const normalizedEntry = normalizeVisualProjectRelativePath(entry)
  if (!normalizedEntry) {
    throw new Error("Visual project entry must stay inside the project.")
  }
  let allowedHost: string | null = null
  const server = createServer(async (request, response) => {
    try {
      if (allowedHost && request.headers.host !== allowedHost) {
        response.writeHead(403)
        response.end("Forbidden")
        return
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405)
        response.end("Method not allowed")
        return
      }

      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")
      if (requestUrl.pathname === "/__ripple_vendor/gsap.min.js") {
        if (!gsapPath) {
          response.writeHead(404)
          response.end("Not found")
          return
        }
        const file = await readFile(gsapPath)
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" })
        response.end(request.method === "HEAD" ? undefined : file)
        return
      }

      const rawRequestPath = requestUrl.pathname === "/"
        ? ""
        : normalizeRequestPath(requestUrl.pathname)
      const isVirtualEntryRequest =
        rawRequestPath === "" ||
        (normalizedEntry !== "index.html" && rawRequestPath === "index.html")
      const requestPath = isVirtualEntryRequest ? normalizedEntry : rawRequestPath
      const resolved = await resolveVisualProjectFile(projectRealPath, requestPath)
      if (!resolved.ok) {
        response.writeHead(resolved.status)
        response.end(resolved.status === 403 ? "Forbidden" : "Not found")
        return
      }

      response.writeHead(200, { "content-type": resolved.contentType })
      if (request.method === "HEAD") {
        response.end()
        return
      }
      let body: Uint8Array = await readFile(resolved.path)
      if (isVirtualEntryRequest && resolved.contentType.startsWith("text/html")) {
        body = injectHtmlBaseHref(body, getEntryBaseHref(normalizedEntry))
      }
      if (gsapPath && resolved.contentType.startsWith("text/html")) {
        body = Buffer.from(Buffer.from(body).toString("utf8").replace(
          /https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"']+\/dist\/gsap\.min\.js/g,
          "/__ripple_vendor/gsap.min.js",
        ), "utf8")
      }
      response.end(body)
    } catch (error) {
      const code = error instanceof URIError
        ? 403
        : (error as NodeJS.ErrnoException).code === "ENOENT"
        ? 404
        : 500
      response.writeHead(code)
      response.end(code === 403 ? "Forbidden" : code === 404 ? "Not found" : "Server error")
    }
  })

  const port = await new Promise<number>((resolvePort, rejectPort) => {
    server.on("error", rejectPort)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address === "object" && address?.port) {
        resolvePort(address.port)
      } else {
        rejectPort(new Error("Failed to bind visual project server."))
      }
    })
  })

  allowedHost = `127.0.0.1:${port}`
  const url = buildVisualProjectEntryUrl(port, entry)
  return {
    server,
    url,
    origin: new URL(url).origin,
    projectRealPath,
  }
}

export function closeVisualProjectServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose())
  })
}
