import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
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

describe("Ripple agent CLI tool environment", () => {
  test("prepends Ripple, HyperFrames, and app-managed tool directories", () => {
    const repoRoot = "/tmp/ripple-app"
    const dirs = getRippleAgentToolDirectories(repoRoot)

    expect(dirs[0]).toBe(join(repoRoot, "resources", "cli"))
    expect(dirs).toContain(join(repoRoot, "resources", "bin", `${process.platform}-${process.arch}`))
    expect(dirs).toContain(join(repoRoot, "node_modules", ".bin"))
    expect(dirs).toContain(join(repoRoot, "scripts"))
  })

  test("keeps the documented ripple command in the tracked app CLI resources", () => {
    const posixCliPath = join(process.cwd(), "resources", "cli", "ripple")
    const windowsCliPath = join(process.cwd(), "resources", "cli", "ripple.cmd")
    expect(existsSync(posixCliPath)).toBe(true)
    expect(existsSync(windowsCliPath)).toBe(true)

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

    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      build?: { extraResources?: Array<{ from?: string; to?: string }> }
    }
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

    expect(pathParts[0]).toBe(join("/tmp/ripple-app", "resources", "cli"))
    expect(pathParts).toContain(join("/tmp/ripple-app", "resources", "bin", `${process.platform}-${process.arch}`))
    expect(pathParts).toContain(join("/tmp/ripple-app", "node_modules", ".bin"))
    expect(pathParts).toContain("/usr/bin")
    expect(env.CODEX_API_KEY).toBe("sk-test")
    expect(env.HYPERFRAMES_NO_TELEMETRY).toBe("1")
    expect(env.HYPERFRAMES_NO_UPDATE_CHECK).toBe("1")
    expect(env.HYPERFRAMES_NO_AUTO_INSTALL).toBe("1")
    expect(env.RIPPLE_AGENT_WORKSPACE_ROOT).toBe(resolve("/tmp/ripple-project"))
  })
})
