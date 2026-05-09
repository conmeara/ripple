#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const repoRoot = process.cwd()
const specsDir = "docs/specs"
const packageJsonPath = "package.json"

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
  "test:ripple",
  "test:hyperframes",
]

function fail(message) {
  console.error(`[quality-platform] ${message}`)
  process.exitCode = 1
}

function mustExist(path) {
  const fullPath = join(repoRoot, path)
  if (!existsSync(fullPath)) {
    fail(`Missing required artifact: ${path}`)
    return false
  }
  return true
}

function isFileOrDirectory(path) {
  try {
    statSync(join(repoRoot, path))
    return true
  } catch {
    return false
  }
}

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8")
}

function walk(path) {
  const fullPath = join(repoRoot, path)
  if (!existsSync(fullPath)) return []
  const entries = readdirSync(fullPath, { withFileTypes: true })
  const paths = []

  for (const entry of entries) {
    const child = join(path, entry.name)
    if (child === "node_modules" || child.startsWith("node_modules/")) continue
    if (entry.isDirectory()) {
      paths.push(...walk(child))
    } else if (entry.isFile()) {
      paths.push(child)
    }
  }

  return paths
}

mustExist(specsDir)
mustExist("scripts/smoke-packaged-ripple.mjs")
mustExist("scripts/smoke-packaged-update.mjs")
mustExist("scripts/smoke-ripple-export-formats.ts")
mustExist("scripts/smoke-live-provider.mjs")
mustExist(".github/workflows/ripple-quality.yml")
mustExist("test/e2e/playwright.config.ts")
mustExist("test/e2e/helpers/ripple-electron.ts")
mustExist("test/e2e/project-entry.e2e.ts")
mustExist("test/e2e/template-review.e2e.ts")
mustExist("test/quality/workflow-coverage.test.ts")
mustExist("test/quality/hyperframes-fixtures.test.ts")
mustExist("test/fixtures/hyperframes/basic-title-card/index.html")

const packageJson = JSON.parse(read(packageJsonPath))
for (const scriptName of requiredScripts) {
  if (!packageJson.scripts?.[scriptName]) {
    fail(`package.json is missing script ${scriptName}`)
  }
}

const specs = existsSync(join(repoRoot, specsDir))
  ? readdirSync(join(repoRoot, specsDir)).filter((file) => file.endsWith(".md"))
  : []
const specSet = new Set(specs)
const specTexts = new Map(specs.map((file) => [file, read(join(specsDir, file))]))
const specText = [...specTexts.values()].join("\n")

for (const file of requiredSpecFiles) {
  if (!specSet.has(file)) {
    fail(`Missing required spec: ${join(specsDir, file)}`)
  }
}

for (const [file, text] of specTexts) {
  if (!text.includes("Screenshot")) {
    fail(`${join(specsDir, file)} is missing a screenshot placeholder`)
  }
  if (!text.includes("## Test Coverage")) {
    fail(`${join(specsDir, file)} is missing a Test Coverage section`)
  }
  if (/docs\/testing|docs\/release/.test(text)) {
    fail(`${join(specsDir, file)} references retired testing/release docs`)
  }
  if (/(^|\n)\s*(TBD|TODO|none)\s*($|\n)/i.test(text)) {
    fail(`${join(specsDir, file)} contains an unfinished placeholder`)
  }
}

const index = specTexts.get("Spec Index.md") || ""
for (const file of requiredSpecFiles.filter((file) => file !== "Spec Index.md")) {
  const title = file.replace(/\.md$/, "")
  if (!index.includes(`[[${title}]]`)) {
    fail(`Spec Index does not link ${title}`)
  }
}

const linkedSpecs = [...specText.matchAll(/\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
  .map((match) => `${match[1]}.md`)
for (const linkedSpec of linkedSpecs) {
  if (!specSet.has(linkedSpec)) {
    fail(`Spec link points to missing page: ${linkedSpec}`)
  }
}

const docsText = [
  ...walk(specsDir).filter((path) => path.endsWith(".md")),
  ...walk("docs/z_archive").filter((path) => path.endsWith(".md")),
]
  .map((path) => read(path))
  .join("\n")

const testFiles = walk(".")
  .filter((path) => /\.(test\.(ts|tsx)|e2e\.ts)$/.test(path))
  .filter((path) => !path.startsWith("node_modules/"))

for (const testFile of testFiles) {
  let mapped = docsText.includes(testFile)
  if (!mapped) {
    const parts = testFile.split("/")
    for (let index = parts.length - 1; index > 0; index--) {
      if (docsText.includes(parts.slice(0, index).join("/"))) {
        mapped = true
        break
      }
    }
  }

  if (!mapped) {
    fail(`Local test is not mapped in specs/archive docs: ${testFile}`)
  }
}

if (process.exitCode) {
  process.exit()
}

console.log(`[quality-platform] verified ${specs.length} spec files, ${testFiles.length} local tests, and ${requiredScripts.length} package scripts`)
