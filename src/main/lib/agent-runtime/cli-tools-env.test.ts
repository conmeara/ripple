import { describe, expect, test } from "bun:test"
import { execFile, execFileSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import {
  buildRippleAgentToolEnvironment,
  getRippleAgentToolDirectories,
} from "./cli-tools-env"
import { buildInstalledWindowsCliScript } from "../platform/windows"
import {
  createVisualContextEndpoint,
  createVisualContextFileBridge,
  type VisualCaptureFramesRequest,
  type VisualContextService,
  type VisualSnapshotInput,
} from "../visual-context"

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

function execRipple(
  args: string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
  },
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile("ripple", args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      timeout: 15_000,
    }, (error, stdout, stderr) => {
      if (error) {
        if (stderr) error.message = `${error.message}\n${stderr}`
        reject(error)
        return
      }
      resolvePromise(stdout)
    })
  })
}

describe("Ripple agent CLI tool environment", () => {
  test("prepends Ripple, HyperFrames, and app-managed tool directories", () => {
    const repoRoot = "/tmp/ripple-app"
    const dirs = getRippleAgentToolDirectories(repoRoot)

    expect(dirs[0]).toBe(join(repoRoot, "node_modules", ".bin"))
    expect(dirs).toContain(join(repoRoot, "resources", "bin", `${process.platform}-${process.arch}`))
    expect(dirs).toContain(join(repoRoot, "resources", "cli"))
    expect(dirs).toContain(join(repoRoot, "scripts"))
  })

  test("normalizes Electron dev app paths back to the repo root for bare ripple", () => {
    const repoRoot = process.cwd()
    const dirs = getRippleAgentToolDirectories(join(repoRoot, "out", "main"))

    expect(dirs).toContain(join(repoRoot, "node_modules", ".bin"))
    expect(dirs).toContain(join(repoRoot, "resources", "bin", `${process.platform}-${process.arch}`))
    expect(dirs).toContain(join(repoRoot, "resources", "cli"))
    expect(dirs).not.toContain(join(repoRoot, "out", "main", "resources", "cli"))
  })

  test("keeps the documented ripple command as a first-class package and app binary", () => {
    const posixCliPath = join(process.cwd(), "resources", "cli", "ripple")
    const windowsCliPath = join(process.cwd(), "resources", "cli", "ripple.cmd")
    const packageBinPath = join(process.cwd(), "bin", "ripple.js")
    const localNodeBinPath = join(process.cwd(), "node_modules", ".bin", "ripple")
    const packagedBinPath = join(
      process.cwd(),
      "resources",
      "bin",
      `${process.platform}-${process.arch}`,
      process.platform === "win32" ? "ripple.cmd" : "ripple",
    )
    expect(existsSync(posixCliPath)).toBe(true)
    expect(existsSync(windowsCliPath)).toBe(true)
    expect(existsSync(packageBinPath)).toBe(true)
    expect(existsSync(localNodeBinPath)).toBe(process.platform !== "win32")
    expect(existsSync(packagedBinPath)).toBe(true)

    const script = readFileSync(posixCliPath, "utf8")
    expect(script).toContain("scripts/ripple-cli.ts")
    expect(script).toContain("ripple-cli.js")
    expect(script).toContain('while [ -h "$SOURCE" ]')
    expect(script).toContain('readlink "$SOURCE"')
    expect(script).toContain('-f "$APP_ASAR"')
    expect(script).not.toContain('-f "$CLI_SCRIPT"')

    const windowsScript = readFileSync(windowsCliPath, "utf8")
    expect(windowsScript).toContain("scripts\\ripple-cli.ts")
    expect(windowsScript).toContain("ripple-cli.js")
    expect(windowsScript).toContain('if exist "%APP_EXECUTABLE%" if exist "%APP_ASAR%"')

    const packageBinScript = readFileSync(packageBinPath, "utf8")
    expect(packageBinScript).toContain('"out", "main", "ripple-cli.js"')
    expect(packageBinScript).toContain('"scripts", "ripple-cli.ts"')

    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      bin?: Record<string, string>
      scripts?: Record<string, string>
      build?: { extraResources?: Array<{ from?: string; to?: string }> }
    }
    expect(packageJson.bin?.ripple).toBe("bin/ripple.js")
    expect(packageJson.scripts?.postinstall).toContain("scripts/stage-ripple-cli.mjs")
    expect(packageJson.scripts?.["package:stage"]).toContain("bun run ripple:stage-cli")
    expect(packageJson.build?.extraResources).toContainEqual(expect.objectContaining({
      from: "resources/cli",
      to: "bin",
    }))
    expect(packageJson.build?.extraResources).toContainEqual(expect.objectContaining({
      from: "resources/claude-plugins",
      to: "claude-plugins",
    }))
  })

  test("POSIX installed symlinks resolve back to bundled app resources", () => {
    if (process.platform === "win32") return

    const posixCliPath = join(process.cwd(), "resources", "cli", "ripple")
    const root = mkdtempSync(join(tmpdir(), "ripple-cli-wrapper-"))
    try {
      const resourcesBin = join(root, "Contents", "Resources", "bin")
      const macosDir = join(root, "Contents", "MacOS")
      const installDir = join(root, "usr", "local", "bin")
      const wrapperPath = join(resourcesBin, "ripple")
      const appPath = join(macosDir, "Ripple")
      const installedPath = join(installDir, "ripple")

      mkdirSync(resourcesBin, { recursive: true })
      mkdirSync(macosDir, { recursive: true })
      mkdirSync(installDir, { recursive: true })
      writeFileSync(wrapperPath, readFileSync(posixCliPath))
      chmodSync(wrapperPath, 0o755)
      writeFileSync(join(root, "Contents", "Resources", "app.asar"), "")
      writeFileSync(
        appPath,
        [
          "#!/usr/bin/env bash",
          "echo ELECTRON_RUN_AS_NODE=$ELECTRON_RUN_AS_NODE",
          "echo CLI_SCRIPT=$1",
          "shift",
          "echo ARGS=$*",
        ].join("\n"),
      )
      chmodSync(appPath, 0o755)
      symlinkSync(wrapperPath, installedPath)

      const output = execFileSync(installedPath, ["frame-sheet", "--help"], {
        encoding: "utf8",
      })

      expect(output).toContain("ELECTRON_RUN_AS_NODE=1")
      expect(output).toContain(
        join(root, "Contents", "Resources", "app.asar", "out", "main", "ripple-cli.js"),
      )
      expect(output).toContain("ARGS=frame-sheet --help")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("Windows installed wrapper uses absolute packaged app paths", () => {
    const sourcePath = "C:\\Users\\me\\AppData\\Local\\Programs\\Ripple\\resources\\bin\\ripple.cmd"
    const script = buildInstalledWindowsCliScript(sourcePath)

    expect(script).toContain(
      'set "APP_EXECUTABLE=C:\\Users\\me\\AppData\\Local\\Programs\\Ripple\\Ripple.exe"',
    )
    expect(script).toContain(
      'set "APP_ASAR=C:\\Users\\me\\AppData\\Local\\Programs\\Ripple\\resources\\app.asar"',
    )
    expect(script).toContain(
      'set "CLI_SCRIPT=C:\\Users\\me\\AppData\\Local\\Programs\\Ripple\\resources\\app.asar\\out\\main\\ripple-cli.js"',
    )
    expect(script).not.toContain("%~dp0")
  })

  test("sets visual-context guards and workspace root without discarding provider env", () => {
    const env = buildRippleAgentToolEnvironment({
      baseEnv: {
        PATH: "/usr/bin",
        CODEX_API_KEY: "sk-test",
      },
      repoRoot: "/tmp/ripple-app",
      workspaceRoot: "/tmp/ripple-project",
    })
    const pathParts = env.PATH?.split(delimiter) ?? []

    expect(pathParts[0]).toBe(join("/tmp/ripple-app", "node_modules", ".bin"))
    expect(pathParts).toContain(join("/tmp/ripple-app", "resources", "bin", `${process.platform}-${process.arch}`))
    expect(pathParts).toContain(join("/tmp/ripple-app", "resources", "cli"))
    expect(pathParts).toContain("/usr/bin")
    expect(env.CODEX_API_KEY).toBe("sk-test")
    expect(env.HYPERFRAMES_NO_TELEMETRY).toBe("1")
    expect(env.HYPERFRAMES_NO_UPDATE_CHECK).toBe("1")
    expect(env.HYPERFRAMES_NO_AUTO_INSTALL).toBe("1")
    expect(env.RIPPLE_AGENT_WORKSPACE_ROOT).toBe(resolve("/tmp/ripple-project"))
    expect(env.RIPPLE_AGENT_VISUAL_CONTEXT_MODE).toBe("clean")
  })

  test("adds visual context endpoint variables when the app service is available", () => {
    const env = buildRippleAgentToolEnvironment({
      baseEnv: {
        PATH: "/usr/bin",
      },
      repoRoot: "/tmp/ripple-app",
      workspaceRoot: "/tmp/ripple-project",
      visualContextEndpoint: "http://127.0.0.1:49152",
      visualContextToken: "token-test",
      visualContextBridgeDir: "/tmp/ripple-project/.ripple/agent-visual-context/run/requests",
      visualContextBridgeToken: "bridge-token-test",
    })

    expect(env.RIPPLE_VISUAL_CONTEXT_ENDPOINT).toBe("http://127.0.0.1:49152")
    expect(env.RIPPLE_VISUAL_CONTEXT_TOKEN).toBe("token-test")
    expect(env.RIPPLE_VISUAL_CONTEXT_BRIDGE_DIR).toBe(
      "/tmp/ripple-project/.ripple/agent-visual-context/run/requests",
    )
    expect(env.RIPPLE_VISUAL_CONTEXT_BRIDGE_TOKEN).toBe("bridge-token-test")
    expect(env.RIPPLE_VISUAL_CONTEXT_MANIFEST).toBeUndefined()
    expect(env.RIPPLE_AGENT_WORKSPACE_ROOT).toBe(resolve("/tmp/ripple-project"))
    expect(env.RIPPLE_AGENT_VISUAL_CONTEXT_MODE).toBe("clean")
  })

  test("app-managed ripple frame-sheet command uses the injected endpoint", async () => {
    const repoRoot = process.cwd()
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-agent-visual-cli-"))
    let requestedBackend: string | null = null
    const service: VisualContextService = {
      warmProject: async () => undefined,
      captureFrames: async (input: VisualCaptureFramesRequest) => {
        requestedBackend = input.preferredBackend ?? null
        const frameDir = join(input.projectPath, ".ripple", "endpoint-sheet-frames")
        mkdirSync(frameDir, { recursive: true })
        return {
          backend: "engine",
          frames: input.timestampsMs.map((timeMs, index) => {
            const framePath = join(frameDir, `${index}.png`)
            writeFileSync(framePath, ONE_BY_ONE_PNG)
            return {
              index,
              timeMs,
              frame: Math.round((timeMs / 1000) * input.fps),
              path: framePath,
              width: input.width,
              height: input.height,
              sizeBytes: ONE_BY_ONE_PNG.length,
            }
          }),
          elapsedMs: 5,
          timings: {},
          warnings: [],
          cleanupPaths: [frameDir],
        }
      },
      captureSnapshot: async (_input: VisualSnapshotInput) => {
        throw new Error("snapshot was not expected")
      },
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
    }
    writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify({
      name: "Agent Visual CLI Test",
      entry: "index.html",
      fps: 24,
      width: 1280,
      height: 720,
      duration: 2,
    }))
    writeFileSync(join(projectDir, "index.html"), "<!doctype html><body></body>")

    const endpoint = await createVisualContextEndpoint({
      service,
      workspaceRoot: projectDir,
      token: "token-test",
    })
    try {
      const env = buildRippleAgentToolEnvironment({
        baseEnv: process.env,
        repoRoot,
        workspaceRoot: projectDir,
        visualContextEndpoint: endpoint.endpoint,
        visualContextToken: endpoint.token,
      })
      const stdout = await execRipple([
        "frame-sheet",
        "--range",
        "0s..1s",
        "--samples",
        "2",
        "--columns",
        "2",
        "--json",
      ], {
        cwd: projectDir,
        env,
      })
      const payload = JSON.parse(stdout)

      expect(payload.ok).toBe(true)
      expect(payload.type).toBe("sheet")
      expect(requestedBackend).toBe("engine")
      expect(stdout).not.toContain("backend")
      expect(stdout).not.toContain("endpoint")
      expect(stdout).not.toContain("handoff")
      expect(stdout).not.toContain("fallback")
      expect(existsSync(join(projectDir, payload.sheet.path))).toBe(true)
      expect(existsSync(join(projectDir, payload.sheet.manifestPath))).toBe(true)
    } finally {
      await endpoint.close()
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test("app-managed ripple snapshot current command uses the injected file bridge preview frame", async () => {
    const repoRoot = process.cwd()
    const projectDir = mkdtempSync(join(tmpdir(), "ripple-agent-current-snapshot-"))
    let snapshotRequest: VisualSnapshotInput | null = null
    const service: VisualContextService = {
      warmProject: async () => undefined,
      captureFrames: async () => {
        throw new Error("sheet was not expected")
      },
      captureSnapshot: async (input: VisualSnapshotInput) => {
        snapshotRequest = input
        const framePath = join(String(input.outputDir), "current.png")
        writeFileSync(framePath, ONE_BY_ONE_PNG)
        return {
          backend: "engine",
          frames: [{
            index: 0,
            timeMs: input.timeMs,
            frame: Math.round((input.timeMs / 1000) * input.fps),
            path: framePath,
            width: input.width,
            height: input.height,
            sizeBytes: ONE_BY_ONE_PNG.length,
          }],
          elapsedMs: 5,
          timings: {},
          warnings: [],
          cleanupPaths: [],
        }
      },
      invalidateProject: async () => undefined,
      shutdown: async () => undefined,
    }
    writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify({
      name: "Agent Current Snapshot Test",
      entry: "index.html",
      fps: 30,
      width: 1280,
      height: 720,
      duration: 2,
    }))
    writeFileSync(join(projectDir, "index.html"), "<!doctype html><body></body>")

    const bridge = await createVisualContextFileBridge({
      service,
      workspaceRoot: projectDir,
      requestDir: join(projectDir, ".ripple", "agent-visual-context", "run-current", "requests"),
      resolveCurrentFrameSnapshot: async () => ({
        projectPath: projectDir,
        sourcePath: projectDir,
        compositionPath: "index.html",
        timeMs: 733,
        fps: 30,
        width: 1280,
        height: 720,
      }),
    })
    try {
      const env = buildRippleAgentToolEnvironment({
        baseEnv: process.env,
        repoRoot,
        workspaceRoot: projectDir,
        visualContextBridgeDir: bridge.requestDir,
        visualContextBridgeToken: bridge.token,
      })
      const stdout = await execRipple([
        "snapshot",
        "--at",
        "current",
        "--json",
      ], {
        cwd: projectDir,
        env,
      })
      const payload = JSON.parse(stdout)

      expect(payload.ok).toBe(true)
      expect(payload.type).toBe("snapshot")
      expect(payload.snapshot.sample).toEqual({
        timeMs: 733,
        frame: 22,
      })
      expect(snapshotRequest).toEqual(expect.objectContaining({
        projectPath: projectDir,
        sourcePath: projectDir,
        compositionPath: "index.html",
        timeMs: 733,
        fps: 30,
        width: 1280,
        height: 720,
      }))
      expect(JSON.stringify(snapshotRequest)).not.toContain("preferredBackend")
      expect(stdout).not.toContain("backend")
      expect(stdout).not.toContain("endpoint")
      expect(stdout).not.toContain("handoff")
      expect(stdout).not.toContain("fallback")
      expect(existsSync(join(projectDir, payload.snapshot.path))).toBe(true)
    } finally {
      await bridge.close()
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
