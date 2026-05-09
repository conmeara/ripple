import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const specsDir = "docs/specs"

const requiredSpecFiles = [
  "Active Conversations.md",
  "Advanced Utilities.md",
  "Agent Connections.md",
  "Agent Context and Skills.md",
  "Analytics and Privacy.md",
  "App Identity and Release Readiness.md",
  "App Updates.md",
  "Assets.md",
  "Automations and Inbox.md",
  "Chats.md",
  "Comments.md",
  "Compositions.md",
  "Exports.md",
  "Failure Recovery.md",
  "Local First Launch.md",
  "Local Project Safety.md",
  "Message Rollback.md",
  "Offline Mode.md",
  "Onboarding.md",
  "Preview.md",
  "Project Description.md",
  "Project Entry.md",
  "Project Management.md",
  "Revisions.md",
  "Settings.md",
  "Shell Layout.md",
  "Spec Index.md",
  "Templates.md",
  "Timeline.md",
  "Visual Context.md",
  "Voice Input.md",
]

const requiredScripts = [
  "bin:stage",
  "package:stage",
  "test:quality",
  "test:ux",
  "test:agent",
  "test:export",
  "test:export:smoke",
  "test:e2e",
  "test:e2e:packaged",
  "test:e2e:update",
  "test:visual",
  "test:live",
  "test:package:smoke",
  "test:update:smoke",
  "test:closeout",
  "test:release",
]

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true })
  const paths: string[] = []

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (fullPath === "node_modules" || fullPath.startsWith("node_modules/")) continue
    if (entry.isDirectory()) {
      paths.push(...walk(fullPath))
    } else if (entry.isFile()) {
      paths.push(fullPath)
    }
  }

  return paths
}

function isFileOrDirectory(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

describe("Ripple v1 draft specs", () => {
  test("keeps the Obsidian specs as the product coverage map", () => {
    const specs = readdirSync(specsDir).filter((file) => file.endsWith(".md"))
    const specSet = new Set(specs)
    const specText = specs
      .map((file) => readFileSync(join(specsDir, file), "utf8"))
      .join("\n")

    for (const file of requiredSpecFiles) {
      expect(specSet.has(file)).toBe(true)
    }

    for (const file of specs) {
      const text = readFileSync(join(specsDir, file), "utf8")
      expect(text).toContain("Screenshot")
      expect(text).toContain("## Test Coverage")
      expect(text).not.toMatch(/docs\/testing|docs\/release/)
      expect(text).not.toMatch(/(^|\n)\s*(TBD|TODO|none)\s*($|\n)/i)
    }

    const index = readFileSync(join(specsDir, "Spec Index.md"), "utf8")
    for (const file of requiredSpecFiles.filter((file) => file !== "Spec Index.md")) {
      expect(index).toContain(`[[${file.replace(/\.md$/, "")}]]`)
    }

    const linkedSpecs = [...specText.matchAll(/\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
      .map((match) => `${match[1]}.md`)
    for (const linkedSpec of linkedSpecs) {
      expect(specSet.has(linkedSpec)).toBe(true)
    }
  })

  test("maps local tests to specs or archived docs", () => {
    const docText = [
      ...walk(specsDir).filter((file) => file.endsWith(".md")),
      ...walk("docs/z_archive").filter((file) => file.endsWith(".md")),
    ]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")

    const tests = walk(".")
      .filter((file) => /\.(test\.(ts|tsx)|e2e\.ts)$/.test(file))
      .filter((file) => !file.startsWith("node_modules/"))

    for (const testFile of tests) {
      const normalized = testFile.replace(/^\.\//, "")
      const parts = normalized.split("/")
      const mapped =
        docText.includes(normalized) ||
        parts.some((_, index) => index > 0 && docText.includes(parts.slice(0, index).join("/")))
      expect(mapped).toBe(true)
    }
  })

  test("keeps future-agent closeout commands wired in package scripts", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>
    }

    for (const script of requiredScripts) {
      expect(packageJson.scripts[script]).toBeTruthy()
    }

    expect(isFileOrDirectory("scripts/smoke-packaged-ripple.mjs")).toBe(true)
    expect(isFileOrDirectory("scripts/smoke-packaged-update.mjs")).toBe(true)
    expect(isFileOrDirectory("scripts/smoke-ripple-export-formats.ts")).toBe(true)
    expect(packageJson.scripts["test:ripple"]).toContain("src/renderer/features/onboarding")
    expect(packageJson.scripts["test:ripple"]).toContain("src/renderer/features/templates")
    expect(packageJson.scripts["test:release"]).toContain("test:export:smoke")
    expect(packageJson.scripts["test:release"]).toContain("test:package:smoke")
    expect(packageJson.scripts["test:closeout"]).toContain("test:e2e")
    expect(packageJson.scripts["package"]).toContain("package:stage")
    expect(packageJson.scripts["package:stage"]).toContain("bin:stage")
  })
})
