import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"
import {
  buildRippleAgentToolEnvironment,
  getRippleAgentToolDirectories,
} from "./cli-tools-env"

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
