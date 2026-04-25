import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join, parse, resolve } from "node:path"
import { tmpdir } from "node:os"
import {
  assertSafeProjectTrashPath,
  resolveProjectPath,
} from "./lifecycle"

const tempDirs: string[] = []

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function makeRippleProjectDir(): Promise<string> {
  const dir = await makeTempDir("ripple-lifecycle-")
  await writeFile(join(dir, "index.html"), "<!doctype html>", "utf8")
  await writeFile(join(dir, "hyperframes.json"), "{}", "utf8")
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("Ripple project lifecycle safety", () => {
  test("prefers the Ripple local path when resolving project files", () => {
    expect(
      resolveProjectPath({
        path: "/legacy/path",
        localPath: "/Users/example/Ripple/launch-video",
      }),
    ).toBe(resolve("/Users/example/Ripple/launch-video"))
  })

  test("allows trashing folders that look like Ripple projects", async () => {
    const projectDir = await makeRippleProjectDir()
    const homeDir = await makeTempDir("ripple-home-")

    expect(assertSafeProjectTrashPath(projectDir, homeDir)).toBe(projectDir)
  })

  test("rejects filesystem root and home folders", async () => {
    const homeDir = await makeTempDir("ripple-home-")

    expect(() => assertSafeProjectTrashPath(parse(homeDir).root, homeDir)).toThrow(
      "Refusing to delete",
    )
    expect(() => assertSafeProjectTrashPath(homeDir, homeDir)).toThrow(
      "Refusing to delete",
    )
  })

  test("rejects folders without Ripple project markers", async () => {
    const projectDir = await makeTempDir("ripple-lifecycle-")
    const homeDir = await makeTempDir("ripple-home-")
    await mkdir(join(projectDir, "assets"))

    expect(() => assertSafeProjectTrashPath(projectDir, homeDir)).toThrow(
      "no longer looks like a Ripple project",
    )
  })
})

