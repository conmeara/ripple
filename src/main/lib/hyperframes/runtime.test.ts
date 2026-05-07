import { describe, expect, test } from "bun:test"
import { delimiter, dirname, join } from "node:path"
import {
  buildHyperframesEnvironment,
  getAppManagedCommandCandidates,
  getHyperframesCommandCandidates,
  getProducerBrowserCandidates,
  normalizeExecutablePath,
  resolveHyperframesCommand,
} from "./runtime"

describe("HyperFrames runtime resolution", () => {
  test("normalizes app.asar executable paths once", () => {
    expect(normalizeExecutablePath(
      "/Applications/Ripple.app/Contents/Resources/app.asar/node_modules/hyperframes/dist/cli.js",
    )).toBe(
      "/Applications/Ripple.app/Contents/Resources/app.asar.unpacked/node_modules/hyperframes/dist/cli.js",
    )
    expect(normalizeExecutablePath(
      "/Applications/Ripple.app/Contents/Resources/app.asar.unpacked/node_modules/hyperframes/dist/cli.js",
    )).toBe(
      "/Applications/Ripple.app/Contents/Resources/app.asar.unpacked/node_modules/hyperframes/dist/cli.js",
    )
  })

  test("prepends app-managed FFmpeg and FFprobe directories to PATH", () => {
    const ffmpegPath = getAppManagedCommandCandidates("ffmpeg")[0]
    const ffprobePath = getAppManagedCommandCandidates("ffprobe")[0]
    const env = buildHyperframesEnvironment({ PATH: "/system/bin" })
    const pathParts = env.PATH?.split(delimiter) ?? []

    if (ffmpegPath) {
      expect(pathParts).toContain(dirname(ffmpegPath))
      expect(pathParts.indexOf(dirname(ffmpegPath))).toBeLessThan(
        pathParts.indexOf("/system/bin"),
      )
    }

    if (ffprobePath) {
      expect(pathParts).toContain(dirname(ffprobePath))
      expect(pathParts.indexOf(dirname(ffprobePath))).toBeLessThan(
        pathParts.indexOf("/system/bin"),
      )
    }
  })

  test("sets local-first HyperFrames environment flags", () => {
    const env = buildHyperframesEnvironment({ PATH: "/system/bin" })

    expect(env.HYPERFRAMES_NO_TELEMETRY).toBe("1")
    expect(env.HYPERFRAMES_NO_UPDATE_CHECK).toBe("1")
    expect(env.HYPERFRAMES_NO_AUTO_INSTALL).toBe("1")
  })

  test("adds packaged dependency roots to NODE_PATH when resourcesPath is available", () => {
    const original = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/Applications/Ripple.app/Contents/Resources",
    })

    try {
      const env = buildHyperframesEnvironment({
        NODE_PATH: "/existing/modules",
        PATH: "/system/bin",
      })
      const nodePathParts = env.NODE_PATH?.split(delimiter) ?? []

      expect(nodePathParts).toContain(
        "/Applications/Ripple.app/Contents/Resources/app.asar.unpacked/node_modules",
      )
      expect(nodePathParts).toContain(
        "/Applications/Ripple.app/Contents/Resources/app.asar/node_modules",
      )
      expect(nodePathParts).toContain("/existing/modules")
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(process, "resourcesPath")
      } else {
        Object.defineProperty(process, "resourcesPath", {
          configurable: true,
          value: original,
        })
      }
    }
  })

  test("passes an app-managed browser path through to HyperFrames CLI and Producer", () => {
    const env = buildHyperframesEnvironment({
      PATH: "/system/bin",
      PRODUCER_HEADLESS_SHELL_PATH: "/managed/chrome",
    })

    expect(env.HYPERFRAMES_BROWSER_PATH).toBe("/managed/chrome")
    expect(env.PRODUCER_HEADLESS_SHELL_PATH).toBe("/managed/chrome")
  })

  test("mirrors a caller-supplied HyperFrames browser path into Producer", () => {
    const env = buildHyperframesEnvironment({
      HYPERFRAMES_BROWSER_PATH: "/hyperframes/chrome",
      PATH: "/system/bin",
    })

    expect(env.HYPERFRAMES_BROWSER_PATH).toBe("/hyperframes/chrome")
    expect(env.PRODUCER_HEADLESS_SHELL_PATH).toBe("/hyperframes/chrome")
  })

  test("includes bundled export browser candidates", () => {
    const candidates = getProducerBrowserCandidates("/repo")
    const platformArch = `${process.platform}-${process.arch}`

    expect(candidates.some((candidate) =>
      candidate.includes(join("resources", "browser", platformArch)),
    )).toBe(true)
  })

  test("uses local command candidates without npx downloads", () => {
    const candidates = getHyperframesCommandCandidates("/repo")
    const rendered = candidates.map((candidate) => [
      candidate.command,
      ...candidate.argsPrefix,
      candidate.source,
    ].join(" "))

    expect(rendered).toContain(
      `${join("/repo", "resources", "bin", `${process.platform}-${process.arch}`, process.platform === "win32" ? "hyperframes.exe" : "hyperframes")} packaged-bin`,
    )
    expect(rendered).toContain(
      `${join("/repo", "node_modules", ".bin", process.platform === "win32" ? "hyperframes.exe" : "hyperframes")} repo-bin`,
    )
    expect(rendered.some((candidate) => candidate.startsWith(`${process.execPath} `))).toBe(true)
    expect(rendered.some((candidate) => candidate.startsWith("npx "))).toBe(false)
  })

  test("passes caller environment overrides through command resolution", async () => {
    const resolved = await resolveHyperframesCommand({
      repoRoot: "/repo",
      env: {
        PATH: "/custom/bin",
        RIPPLE_QA_ENV: "present",
      },
      execFile: async (_command, _args, options) => ({
        ok: Boolean(options.env?.PATH?.includes("/custom/bin")) &&
          options.env?.RIPPLE_QA_ENV === "present",
        stdout: "0.4.28",
        stderr: "",
      }),
    })

    expect(resolved.version).toBe("0.4.28")
    expect(resolved.env.RIPPLE_QA_ENV).toBe("present")
    expect(resolved.env.PATH).toContain("/custom/bin")
  })
})
