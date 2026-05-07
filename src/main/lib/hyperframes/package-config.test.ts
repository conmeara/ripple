import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

interface PackageJson {
  dependencies: Record<string, string>
  scripts: Record<string, string>
  build: {
    files?: string[]
    asarUnpack?: string[]
    extraResources?: Array<{ from?: string; to?: string; filter?: string[] }>
    mac?: {
      icon?: string
      extendInfo?: Record<string, string>
    }
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
    expect(pkg.dependencies["@hyperframes/producer"]).toBe(coreVersion)
    expect(pkg.dependencies["@hyperframes/studio"]).toBe(coreVersion)
    expect(pkg.dependencies.hyperframes).toBe(coreVersion)
  })

  test("keeps installed HyperFrames package versions in sync with package.json", () => {
    const pkg = readPackageJson()
    const packageNames = [
      "@hyperframes/core",
      "@hyperframes/player",
      "@hyperframes/producer",
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
    expect(command).toContain("src/main/lib/exports")
    expect(command).toContain("src/renderer/features/renders")
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

  test("keeps product exports out of the legacy HyperFrames render route", () => {
    const routerSource = readFileSync(
      "src/main/lib/trpc/routers/hyperframes.ts",
      "utf-8",
    )

    expect(routerSource).not.toContain("renderManager")
    expect(routerSource).not.toContain("getRenderStatus")
    expect(routerSource).not.toContain("cancelRender")
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
    const producerExports = readNodePackageJson("@hyperframes/producer").exports
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

    expect(isRecord(producerExports)).toBe(true)
    const producerRoot = (producerExports as Record<string, unknown>)["."]
    expect(isRecord(producerRoot)).toBe(true)
    expect(typeof (producerRoot as Record<string, unknown>).import).toBe("string")
    expect(typeof (producerRoot as Record<string, unknown>).types).toBe("string")
    const producerServer = (producerExports as Record<string, unknown>)["./server"]
    expect(isRecord(producerServer)).toBe(true)
    expect(typeof (producerServer as Record<string, unknown>).import).toBe("string")

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
    expect(asarUnpack.has("node_modules/@hyperframes/producer/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/@hyperframes/studio/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/@puppeteer/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/gsap/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/hyperframes/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/puppeteer/**/*")).toBe(true)
    expect(asarUnpack.has("node_modules/puppeteer-core/**/*")).toBe(true)
  })

  test("keeps app-managed agent CLIs without duplicating Claude SDK platform binaries", () => {
    const pkg = readPackageJson()
    const files = new Set(pkg.build.files ?? [])
    const qualityWorkflow = readFileSync(".github/workflows/ripple-quality.yml", "utf-8")

    expect(files.has("!node_modules/@anthropic-ai/claude-agent-sdk-*/**/*")).toBe(true)
    expect(pkg.scripts["bin:stage"]).toContain("bun run claude:download")
    expect(pkg.scripts["bin:stage"]).toContain("bun run codex:download")
    expect(pkg.scripts["package:stage"]).toContain("bun run bin:stage")
    expect(pkg.build.extraResources).toContainEqual(expect.objectContaining({
      from: "resources/bin/${platform}-${arch}",
      to: "bin",
    }))
    expect(pkg.build.extraResources).toContainEqual(expect.objectContaining({
      from: "resources/cli",
      to: "bin",
    }))
    expect(existsSync("resources/cli/ripple")).toBe(true)
    expect(existsSync("resources/cli/hyperframes")).toBe(true)
    expect(qualityWorkflow).toContain("bun run package")
    expect(qualityWorkflow).toContain("GH_TOKEN: ${{ github.token }}")
    expect(qualityWorkflow).toContain("GITHUB_TOKEN: ${{ github.token }}")
  })

  test("stages an app-managed export browser before packaging", () => {
    const pkg = readPackageJson()
    const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf-8")
    const stageScript = readFileSync("scripts/stage-export-browser.mjs", "utf-8")

    expect(pkg.scripts["browser:stage"]).toBe("node scripts/stage-export-browser.mjs")
    expect(pkg.scripts["package:stage"]).toContain("bun run browser:stage")
    for (const scriptName of [
      "package",
      "package:mac",
      "package:win",
      "package:linux",
      "dist",
      "dist:github",
      "dist:github:mac",
    ]) {
      expect(pkg.scripts[scriptName]).toContain("bun run package:stage")
    }
    for (const scriptName of [
      "release",
      "release:github:mac",
    ]) {
      expect(pkg.scripts[scriptName]).toContain("bun run browser:stage")
    }
    expect(pkg.build.extraResources).toContainEqual(expect.objectContaining({
      from: "resources/browser/${platform}-${arch}",
      to: "browser",
    }))
    expect(releaseWorkflow).toContain("bun run browser:stage")
    expect(releaseWorkflow).toContain("Verify packaged export browsers")
    expect(releaseWorkflow).toContain("Contents/Resources/browser/chrome-headless-shell")
    expect(stageScript).toContain('platform: "darwin"')
    expect(stageScript).toContain('arch: "arm64"')
    expect(stageScript).toContain('arch: "x64"')
    expect(stageScript).toContain('puppeteerPlatform: "mac_arm"')
    expect(stageScript).toContain('puppeteerPlatform: "mac"')
  })

  test("keeps macOS permission prompts branded for Ripple", () => {
    const pkg = readPackageJson()
    const extendInfo = pkg.build.mac?.extendInfo ?? {}

    expect(extendInfo.NSCameraUsageDescription).toContain("Ripple")
    expect(extendInfo.NSMicrophoneUsageDescription).toContain("Ripple")
  })

  test("packages macOS light and dark icon assets", () => {
    const pkg = readPackageJson()
    const buildResource = pkg.build.extraResources?.find((resource) => resource.from === "build")
    const filters = new Set(buildResource?.filter ?? [])
    const iconComposerDocument = JSON.parse(readFileSync("build/icon.icon/icon.json", "utf-8")) as {
      groups?: Array<{
        layers?: Array<{
          "fill-specializations"?: Array<{ appearance?: string }>
          "image-name"?: string
        }>
      }>
      "fill-specializations"?: Array<{ appearance?: string }>
    }

    expect(pkg.build.mac?.icon).toBe("build/icon.icns")
    expect(filters.has("icon-light.png")).toBe(true)
    expect(filters.has("icon-dark.png")).toBe(true)
    expect(filters.has("icon.icon/**/*")).toBe(true)
    expect(existsSync("build/icon-light.png")).toBe(true)
    expect(existsSync("build/icon-dark.png")).toBe(true)
    expect(existsSync("build/icon.icon/Assets/ripple-mark.svg")).toBe(true)
    expect(
      iconComposerDocument["fill-specializations"]?.some(
        (entry) => entry.appearance === "dark",
      ),
    ).toBe(true)
    expect(iconComposerDocument.groups?.[0]?.layers?.[0]?.["image-name"]).toBe("ripple-mark.svg")
    expect(
      iconComposerDocument.groups?.[0]?.layers?.[0]?.["fill-specializations"]?.some(
        (entry) => entry.appearance === "dark",
      ),
    ).toBe(true)
  })
})
