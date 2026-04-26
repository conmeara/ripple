import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

interface PackageJson {
  dependencies: Record<string, string>
  build: {
    asarUnpack?: string[]
  }
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync("package.json", "utf-8")) as PackageJson
}

describe("HyperFrames packaged app configuration", () => {
  test("keeps HyperFrames package versions pinned as a family", () => {
    const pkg = readPackageJson()
    const coreVersion = pkg.dependencies["@hyperframes/core"]

    expect(coreVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(pkg.dependencies["@hyperframes/player"]).toBe(coreVersion)
    expect(pkg.dependencies["@hyperframes/studio"]).toBe(coreVersion)
    expect(pkg.dependencies.hyperframes).toBe(coreVersion)
  })

  test("unpacks runtime packages used by preview, render, and packaged smoke", () => {
    const pkg = readPackageJson()
    const asarUnpack = new Set(pkg.build.asarUnpack ?? [])

    expect(asarUnpack.has("node_modules/@hyperframes/core/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/@hyperframes/player/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/@hyperframes/studio/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/gsap/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/hyperframes/**/*")).toBe(true)
  })
})
