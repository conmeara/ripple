import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createProjectSlug,
  getUniqueProjectPath,
  isPathInsideRippleRoot,
  toProjectDisplayName,
} from "./paths"

describe("Ripple project paths", () => {
  test("creates readable filesystem slugs", () => {
    expect(createProjectSlug("Launch Video")).toBe("launch-video")
    expect(createProjectSlug("  Brand & Product Intro  ")).toBe(
      "brand-and-product-intro",
    )
    expect(createProjectSlug("../../Launch/Video")).toBe("launch-video")
  })

  test("rejects names without letters or numbers", () => {
    expect(() => createProjectSlug(" !!! ")).toThrow()
    expect(() => toProjectDisplayName("   ")).toThrow()
  })

  test("chooses deterministic collision suffixes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-paths-"))
    try {
      await mkdir(join(root, "launch-video"))
      await mkdir(join(root, "launch-video-2"))

      expect(getUniqueProjectPath(root, "launch-video")).toEqual({
        slug: "launch-video-3",
        projectPath: join(root, "launch-video-3"),
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("keeps generated paths inside the Ripple root", () => {
    const root = "/tmp/Ripple"
    expect(isPathInsideRippleRoot(root, "/tmp/Ripple/launch-video")).toBe(true)
    expect(isPathInsideRippleRoot(root, "/tmp/Ripple")).toBe(true)
    expect(isPathInsideRippleRoot(root, "/tmp/Ripple-Other")).toBe(false)
  })
})
