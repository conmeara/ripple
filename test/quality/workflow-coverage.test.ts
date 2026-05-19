import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, normalize } from "node:path"

const specsDir = "docs/specs"
const archivedMdSpecsDir = "docs/z_archive/md_specs"

const requiredActiveSpecFiles = [
  "Comments.html",
  "Visual Context.html",
  "Visual Context Pipeline.html",
  "visual-context-eval.html",
]

const requiredArchivedSpecFiles = [
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
  "Visual Context/Visual Context.md",
  "Visual Context - v2.md",
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function localReferences(text: string): string[] {
  return [...text.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((target) =>
      target &&
      !target.includes("${") &&
      !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)
    )
}

function assertLocalReferenceExists(sourcePath: string, target: string): void {
  const [rawPath, rawAnchor] = target.split("#")
  const targetPath = rawPath
    ? normalize(join(dirname(sourcePath), rawPath))
    : sourcePath
  expect(isFileOrDirectory(targetPath)).toBe(true)

  if (rawAnchor) {
    const anchor = decodeURIComponent(rawAnchor)
    const targetText = readFileSync(targetPath, "utf8")
    expect(targetText).toMatch(new RegExp(`\\bid=["']${escapeRegex(anchor)}["']`))
  }
}

describe("Ripple v1 draft specs", () => {
  test("keeps the active HTML specs and archived Markdown specs as the product coverage map", () => {
    const activeSpecs = readdirSync(specsDir).filter((file) => file.endsWith(".html"))
    const activeSpecSet = new Set(activeSpecs)
    const archivedSpecs = walk(archivedMdSpecsDir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.slice(`${archivedMdSpecsDir}/`.length))
    const archivedSpecSet = new Set(archivedSpecs)
    const specText = [
      ...activeSpecs.map((file) => join(specsDir, file)),
      ...archivedSpecs.map((file) => join(archivedMdSpecsDir, file)),
    ]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")

    for (const file of requiredActiveSpecFiles) {
      expect(activeSpecSet.has(file)).toBe(true)
    }

    for (const file of requiredArchivedSpecFiles) {
      expect(archivedSpecSet.has(file)).toBe(true)
    }

    for (const file of activeSpecs) {
      const text = readFileSync(join(specsDir, file), "utf8")
      expect(text).toContain("<title>")
      expect(text).not.toMatch(/href="[^"]+\.md(?:#[^"]*)?"/)
      expect(text).not.toMatch(/(^|\n)\s*(TBD|TODO|none)\s*($|\n)/i)
      for (const target of localReferences(text)) {
        assertLocalReferenceExists(join(specsDir, file), target)
      }
    }

    const index = readFileSync(join(archivedMdSpecsDir, "Spec Index.md"), "utf8")
    for (const file of requiredArchivedSpecFiles.filter((file) =>
      file !== "Spec Index.md" &&
      !file.includes("/") &&
      file !== "Visual Context - v2.md"
    )) {
      expect(index).toContain(`[[${file.replace(/\.md$/, "")}]]`)
    }

    const linkedSpecs = [...specText.matchAll(/\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
      .map((match) => `${match[1]}.md`)
    for (const linkedSpec of linkedSpecs) {
      const nestedSpec = `${linkedSpec.replace(/\.md$/, "")}/${linkedSpec}`
      expect(archivedSpecSet.has(linkedSpec) || archivedSpecSet.has(nestedSpec)).toBe(true)
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
