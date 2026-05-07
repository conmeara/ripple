import { describe, expect, test } from "bun:test"
import { request as httpRequest } from "node:http"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  closeVisualProjectServer,
  resolveVisualProjectFile,
  serveVisualProject,
} from "./project-server"

async function makeServerProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "ripple-visual-server-"))
  await mkdir(join(projectPath, "compositions"), { recursive: true })
  await mkdir(join(projectPath, "assets"), { recursive: true })
  await writeFile(join(projectPath, "index.html"), "<html><body>Main</body></html>")
  await writeFile(
    join(projectPath, "compositions", "lower-third.html"),
    '<html><body><img src="../assets/logo.png">Lower third</body></html>',
  )
  await writeFile(join(projectPath, "assets", "logo.png"), "placeholder")
  return projectPath
}

function requestServer(input: {
  url: string
  method?: string
  host?: string
}): Promise<{ status: number; body: string; contentType: string | undefined }> {
  return new Promise((resolveRequest, rejectRequest) => {
    const parsed = new URL(input.url)
    const request = httpRequest({
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: input.method ?? "GET",
      headers: input.host ? { host: input.host } : undefined,
    }, (response) => {
      let body = ""
      response.setEncoding("utf8")
      response.on("data", (chunk) => {
        body += chunk
      })
      response.on("end", () => {
        resolveRequest({
          status: response.statusCode ?? 0,
          body,
          contentType: Array.isArray(response.headers["content-type"])
            ? response.headers["content-type"][0]
            : response.headers["content-type"],
        })
      })
    })
    request.on("error", rejectRequest)
    request.end()
  })
}

describe("visual project server", () => {
  test("resolves normal project files with content types", async () => {
    const projectPath = await makeServerProject()
    try {
      const html = await resolveVisualProjectFile(projectPath, "index.html")
      expect(html.ok).toBe(true)
      if (html.ok) expect(html.contentType).toBe("text/html; charset=utf-8")

      const image = await resolveVisualProjectFile(projectPath, "assets/logo.png")
      expect(image.ok).toBe(true)
      if (image.ok) expect(image.contentType).toBe("image/png")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("rejects symlinked entry and asset escapes before reading files", async () => {
    if (process.platform === "win32") return

    const projectPath = await makeServerProject()
    const outsidePath = await mkdtemp(join(tmpdir(), "ripple-visual-server-outside-"))
    try {
      await writeFile(join(outsidePath, "entry.html"), "<html>outside</html>")
      await writeFile(join(outsidePath, "asset.png"), "outside")
      await symlink(join(outsidePath, "entry.html"), join(projectPath, "compositions", "escape.html"))
      await symlink(join(outsidePath, "asset.png"), join(projectPath, "assets", "escape.png"))

      expect(await resolveVisualProjectFile(projectPath, "compositions/escape.html")).toEqual({
        ok: false,
        status: 403,
      })
      expect(await resolveVisualProjectFile(projectPath, "assets/escape.png")).toEqual({
        ok: false,
        status: 403,
      })
    } finally {
      await rm(projectPath, { recursive: true, force: true })
      await rm(outsidePath, { recursive: true, force: true })
    }
  })

  test("denies hidden, generated, and credential-like paths", async () => {
    const projectPath = await makeServerProject()
    try {
      await mkdir(join(projectPath, ".git"), { recursive: true })
      await mkdir(join(projectPath, ".ripple", "frame-sheets"), { recursive: true })
      await writeFile(join(projectPath, ".git", "config"), "secret")
      await writeFile(join(projectPath, ".ripple", "frame-sheets", "sheet.png"), "generated")
      await writeFile(join(projectPath, ".env"), "secret")
      await writeFile(join(projectPath, "private.pem"), "secret")
      await writeFile(join(projectPath, "private.key"), "secret")
      await writeFile(join(projectPath, "cert.crt"), "secret")

      for (const path of [
        ".git/config",
        ".ripple/frame-sheets/sheet.png",
        ".env",
        "private.pem",
        "private.key",
        "cert.crt",
      ]) {
        expect(await resolveVisualProjectFile(projectPath, path)).toEqual({
          ok: false,
          status: 403,
        })
      }
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("rejects traversal paths and missing files distinctly", async () => {
    const projectPath = await makeServerProject()
    try {
      expect(await resolveVisualProjectFile(projectPath, "../outside.html")).toEqual({
        ok: false,
        status: 403,
      })
      expect(await resolveVisualProjectFile(projectPath, "missing.html")).toEqual({
        ok: false,
        status: 404,
      })
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("serves nested composition and relative project assets", async () => {
    const projectPath = await makeServerProject()
    const served = await serveVisualProject({
      projectDir: projectPath,
      entry: "compositions/lower-third.html",
    })
    try {
      const html = await requestServer({ url: served.url })
      expect(html.status).toBe(200)
      expect(html.contentType).toBe("text/html; charset=utf-8")
      expect(html.body).toContain("Lower third")

      const virtualEntry = await requestServer({ url: `${served.origin}/index.html` })
      expect(virtualEntry.status).toBe(200)
      expect(virtualEntry.body).toContain('<base href="/compositions/">')
      expect(virtualEntry.body).toContain("Lower third")

      const asset = await requestServer({ url: `${served.origin}/assets/logo.png` })
      expect(asset.status).toBe(200)
      expect(asset.body).toBe("placeholder")
    } finally {
      await closeVisualProjectServer(served.server)
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("rewrites CDN GSAP script references to the bundled local runtime", async () => {
    const projectPath = await makeServerProject()
    try {
      await writeFile(
        join(projectPath, "index.html"),
        '<html><head><script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script></head><body>Main</body></html>',
      )
      const served = await serveVisualProject({
        projectDir: projectPath,
        repoRoot: process.cwd(),
      })
      try {
        const html = await requestServer({ url: served.url })
        expect(html.status).toBe(200)
        expect(html.body).toContain('/__ripple_vendor/gsap.min.js')
        expect(html.body).not.toContain('https://cdn.jsdelivr.net/npm/gsap')

        const vendor = await requestServer({ url: `${served.origin}/__ripple_vendor/gsap.min.js` })
        expect(vendor.status).toBe(200)
        expect(vendor.contentType).toBe("text/javascript; charset=utf-8")
        expect(vendor.body).toContain("GSAP")
      } finally {
        await closeVisualProjectServer(served.server)
      }
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("validates host header and HTTP method", async () => {
    const projectPath = await makeServerProject()
    const served = await serveVisualProject({ projectDir: projectPath })
    try {
      const wrongHost = await requestServer({
        url: served.url,
        host: "malicious.local",
      })
      expect(wrongHost.status).toBe(403)

      const post = await requestServer({
        url: served.url,
        method: "POST",
      })
      expect(post.status).toBe(405)
    } finally {
      await closeVisualProjectServer(served.server)
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
