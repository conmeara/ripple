import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import {
  checkRippleEnvironment,
  parseNodeMajor,
  setupStatusFromChecks,
  type EnvironmentProbe,
} from "./environment"
import { getProducerBrowserCandidates } from "../hyperframes/runtime"
import type { EnvironmentCheck } from "./types"

function createProbe(input: {
  commands: Record<string, { stdout?: string; stderr?: string; ok?: boolean }>
  existingPaths?: string[]
  seenCommands?: string[]
}): EnvironmentProbe {
  const existingPaths = new Set(input.existingPaths ?? [])

  return {
    execFile: async (command, args) => {
      input.seenCommands?.push([command, ...args].join(" "))
      const result = input.commands[command]
      if (!result) {
        return { ok: false, stdout: "", stderr: "" }
      }
      return {
        ok: result.ok ?? true,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      }
    },
    hasPath: async (path) => existingPaths.has(path),
  }
}

function getBundledBrowserFixture(repoRoot: string): string {
  return getProducerBrowserCandidates(repoRoot).find((candidate) =>
    candidate.includes(join("resources", "browser")),
  ) ?? join(repoRoot, "resources", "browser", "browser")
}

describe("Ripple environment checks", () => {
  test("parses Node.js major versions", () => {
    expect(parseNodeMajor("v25.9.0")).toBe(25)
    expect(parseNodeMajor("22.1.0")).toBe(22)
    expect(parseNodeMajor("not-a-version")).toBeNull()
  })

  test("marks setup ready when required local tools are present", async () => {
    const report = await checkRippleEnvironment(
      "/repo",
      createProbe({
        commands: {
          node: { stdout: "v25.9.0\n" },
          ffmpeg: { stdout: "ffmpeg version 7.0\n" },
          ffprobe: { stdout: "ffprobe version 7.0\n" },
          "/repo/node_modules/.bin/hyperframes": { stdout: "1.2.3\n" },
        },
        existingPaths: ["/repo/node_modules/gsap", getBundledBrowserFixture("/repo")],
      }),
    )

    expect(report.status).toBe("ready")
    expect(report.summary).toBeNull()
    expect(report.checks.map((check) => check.name)).toEqual([
      "node",
      "ffmpeg",
      "ffprobe",
      "hyperframes",
      "exportBrowser",
      "offlineRuntime",
    ])
  })

  test("reports missing render tools without throwing", async () => {
    const report = await checkRippleEnvironment(
      "/repo",
      createProbe({
        commands: {
          node: { stdout: "v21.0.0\n" },
          hyperframes: { ok: false },
        },
      }),
    )

    expect(report.status).toBe("needs_environment")
    expect(report.summary).toContain("preview and export tools")
    expect(report.checks.find((check) => check.name === "node")?.status).toBe(
      "ready",
    )
    expect(report.checks.find((check) => check.name === "ffmpeg")?.status).toBe(
      "missing",
    )
    expect(report.checks.find((check) => check.name === "ffprobe")?.status).toBe(
      "missing",
    )
    expect(report.checks.find((check) => check.name === "hyperframes")?.status).toBe(
      "missing",
    )
    expect(report.checks.find((check) => check.name === "exportBrowser")?.status).toBe(
      "missing",
    )
    expect(report.checks.find((check) => check.name === "offlineRuntime")?.status).toBe(
      "ready",
    )
  })

  test("falls back to the app runtime when a system Node.js probe fails", async () => {
    const report = await checkRippleEnvironment(
      "/repo",
      createProbe({
        commands: {
          node: { ok: false },
          ffmpeg: { stdout: "ffmpeg version 7.0\n" },
          ffprobe: { stdout: "ffprobe version 7.0\n" },
          hyperframes: { stdout: "1.2.3\n" },
        },
        existingPaths: [getBundledBrowserFixture("/repo")],
      }),
    )

    const nodeCheck = report.checks.find((check) => check.name === "node")
    expect(nodeCheck?.status).toBe("ready")
    expect(nodeCheck?.label).toBe("Motion runtime")
    expect(nodeCheck?.version).toContain(process.versions.node)
    expect(report.summary).toBeNull()
  })

  test("checks only bundled/local/global HyperFrames executables", async () => {
    const seenCommands: string[] = []
    await checkRippleEnvironment(
      "/repo",
      createProbe({
        commands: {
          node: { stdout: "v25.0.0\n" },
          ffmpeg: { stdout: "ffmpeg version 7.0\n" },
          ffprobe: { stdout: "ffprobe version 7.0\n" },
        },
        seenCommands,
      }),
    )

    expect(seenCommands).toContain(
      `${join("/repo", "resources", "bin", `${process.platform}-${process.arch}`, process.platform === "win32" ? "hyperframes.exe" : "hyperframes")} --version`,
    )
    expect(seenCommands).toContain("/repo/node_modules/.bin/hyperframes --version")
    expect(
      seenCommands.some(
        (command) =>
          command.startsWith(`${process.execPath} `) &&
          command.includes("hyperframes") &&
          command.endsWith(" --version"),
      ),
    ).toBe(true)
    expect(seenCommands).toContain("hyperframes --version")
    expect(seenCommands.some((command) => command.startsWith("npx "))).toBe(false)
  })

  test("warnings do not block setup readiness", () => {
    const checks: EnvironmentCheck[] = [
      {
        name: "offlineRuntime",
        status: "warning",
        label: "Starter runtime",
        message: "Using the offline helper.",
      },
    ]

    expect(setupStatusFromChecks(checks)).toBe("ready")
  })
})
