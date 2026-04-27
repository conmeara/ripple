import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

interface PackageJson {
  dependencies: Record<string, string>
  scripts: Record<string, string>
  build: {
    asarUnpack?: string[]
  }
}

interface NodePackageJson {
  version: string
  exports?: unknown
  main?: string
  types?: string
  bin?: Record<string, string>
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync("package.json", "utf-8")) as PackageJson
}

function readNodePackageJson(packageName: string): NodePackageJson {
  return JSON.parse(
    readFileSync(join("node_modules", ...packageName.split("/"), "package.json"), "utf-8"),
  ) as NodePackageJson
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function collectSourceFiles(root: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(path))
    } else if (
      /\.(ts|tsx|js|jsx)$/.test(entry) &&
      !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry)
    ) {
      files.push(path)
    }
  }

  return files
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

  test("keeps installed HyperFrames package versions in sync with package.json", () => {
    const pkg = readPackageJson()
    const packageNames = [
      "@hyperframes/core",
      "@hyperframes/player",
      "@hyperframes/studio",
      "hyperframes",
    ]

    for (const packageName of packageNames) {
      expect(readNodePackageJson(packageName).version).toBe(pkg.dependencies[packageName])
    }
  })

  test("keeps a focused HyperFrames regression suite available", () => {
    const pkg = readPackageJson()
    const command = pkg.scripts["test:hyperframes"]

    expect(command).toContain("bun test")
    expect(command).toContain("src/main/lib/hyperframes")
    expect(command).toContain("src/renderer/features/hyperframes")
  })

  test("keeps asset import behind the active-project lifecycle guard", () => {
    const routerSource = readFileSync(
      "src/main/lib/trpc/routers/hyperframes.ts",
      "utf-8",
    )
    const importAssetsBlock =
      routerSource.match(/importAssets: publicProcedure[\s\S]*?getPlayerSource:/)?.[0] ??
      ""

    expect(importAssetsBlock).toContain("resolveHyperframesProjectContext")
    expect(importAssetsBlock).not.toContain("allowArchived: true")
  })

  test("keeps composition thumbnails isolated from the app origin", () => {
    const paneSource = readFileSync(
      "src/renderer/features/hyperframes/HyperFramesProjectPane.tsx",
      "utf-8",
    )

    expect(paneSource).toContain('sandbox="allow-scripts"')
    expect(paneSource).not.toContain("allow-same-origin")
  })

  test("keeps the official HyperFrames surfaces Ripple wraps available", () => {
    const coreExports = readNodePackageJson("@hyperframes/core").exports
    const playerExports = readNodePackageJson("@hyperframes/player").exports
    const cliBin = readNodePackageJson("hyperframes").bin

    expect(isRecord(coreExports)).toBe(true)
    expect((coreExports as Record<string, unknown>)["./runtime"]).toBe(
      "./dist/hyperframe.runtime.iife.js",
    )

    expect(isRecord(playerExports)).toBe(true)
    const playerRoot = (playerExports as Record<string, unknown>)["."]
    expect(isRecord(playerRoot)).toBe(true)
    expect(typeof (playerRoot as Record<string, unknown>).import).toBe("string")
    expect(typeof (playerRoot as Record<string, unknown>).require).toBe("string")
    expect(typeof (playerRoot as Record<string, unknown>).types).toBe("string")

    expect(cliBin?.hyperframes).toBe("./dist/cli.js")
  })

  test("does not import HyperFrames Studio into production Ripple source", () => {
    const sourceFiles = [
      ...collectSourceFiles("src/main"),
      ...collectSourceFiles("src/preload"),
      ...collectSourceFiles("src/renderer"),
      ...collectSourceFiles("src/shared"),
    ]
    const offenders = sourceFiles.filter((filePath) =>
      readFileSync(filePath, "utf-8").includes("@hyperframes/studio"),
    )

    expect(offenders).toEqual([])
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
