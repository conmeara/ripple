import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  detectWorktreeConfig,
  getAvailableConfigPaths,
  getSetupCommands,
  saveWorktreeConfig,
} from "./worktree-config"

const tempDirs: string[] = []

async function makeProjectDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ripple-worktree-config-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("hidden Ripple project setup config", () => {
  test("saves setup config under .ripple by default", async () => {
    const projectDir = await makeProjectDir()

    const result = await saveWorktreeConfig(projectDir, {
      "setup-worktree": ["echo ready"],
    })

    expect(result.success).toBe(true)
    expect(result.path).toBe(join(projectDir, ".ripple", "worktree.json"))

    const detected = await detectWorktreeConfig(projectDir)
    expect(detected.source).toBe("ripple")
    expect(detected.path).toBe(result.path)
    expect(detected.config?.["setup-worktree"]).toEqual(["echo ready"])
  })

  test("prefers .ripple over legacy editor config files", async () => {
    const projectDir = await makeProjectDir()
    await mkdir(join(projectDir, ".cursor"), { recursive: true })
    await mkdir(join(projectDir, ".1code"), { recursive: true })
    await writeFile(
      join(projectDir, ".cursor", "worktrees.json"),
      JSON.stringify({ "setup-worktree": ["echo cursor"] }),
      "utf-8",
    )
    await writeFile(
      join(projectDir, ".1code", "worktree.json"),
      JSON.stringify({ "setup-worktree": ["echo 1code"] }),
      "utf-8",
    )

    await saveWorktreeConfig(projectDir, { "setup-worktree": ["echo ripple"] })

    const detected = await detectWorktreeConfig(projectDir)
    expect(detected.source).toBe("ripple")
    expect(detected.config?.["setup-worktree"]).toEqual(["echo ripple"])
  })

  test("reports available internal and legacy config paths", async () => {
    const projectDir = await makeProjectDir()
    await saveWorktreeConfig(projectDir, { "setup-worktree": "echo ready" })

    const paths = await getAvailableConfigPaths(projectDir)
    expect(paths.ripple.exists).toBe(true)
    expect(paths.ripple.path).toBe(join(projectDir, ".ripple", "worktree.json"))
    expect(paths.cursor.exists).toBe(false)
    expect(paths.onecode.exists).toBe(false)
  })

  test("does not write legacy .1code config", async () => {
    const projectDir = await makeProjectDir()

    const result = await saveWorktreeConfig(
      projectDir,
      { "setup-worktree": "echo legacy" },
      "1code",
    )

    expect(result.success).toBe(false)
    expect(result.path).toBe(join(projectDir, ".1code", "worktree.json"))
  })

  test("does not write custom legacy .1code config paths", async () => {
    const projectDir = await makeProjectDir()

    const unixStyle = await saveWorktreeConfig(
      projectDir,
      { "setup-worktree": "echo legacy" },
      ".1code/worktree.json",
    )
    const windowsStyle = await saveWorktreeConfig(
      projectDir,
      { "setup-worktree": "echo legacy" },
      ".1code\\worktree.json",
    )
    const absoluteStyle = await saveWorktreeConfig(
      projectDir,
      { "setup-worktree": "echo legacy" },
      join(projectDir, ".1code", "worktree.json"),
    )

    expect(unixStyle.success).toBe(false)
    expect(windowsStyle.success).toBe(false)
    expect(absoluteStyle.success).toBe(false)
  })

  test("uses generic hidden setup commands before platform overrides", () => {
    expect(
      getSetupCommands({
        "setup-worktree": ["echo generic"],
        "setup-worktree-unix": ["echo unix"],
        "setup-worktree-windows": ["echo windows"],
      }),
    ).toEqual(["echo generic"])
  })
})
