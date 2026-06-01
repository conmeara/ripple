#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, normalize } from "node:path"

const repoRoot = process.cwd()
const specsDir = "docs/specs"
const archivedMdSpecsDir = "docs/z_archive/md_specs"
const packageJsonPath = "package.json"

const requiredActiveSpecFiles = [
  "Comments.html",
  "Visual Context/Visual Context.html",
  "Visual Context/Visual Context Pipeline.html",
  "Visual Context/visual-context-eval.html",
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
  "test:agent-ui",
  "test:agent-ui:e2e",
  "test:agent-ui:e2e:live-fixtures",
  "test:agent-ui:e2e:temporal",
  "test:agent-evals",
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
  "eval:agent-runtime-ui",
  "eval:agent-runtime-ui:export",
  "eval:agent-runtime-ui:live",
  "eval:agent-runtime-ui:report",
  "eval:agent-runtime-ui:refresh",
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function localReferences(text) {
  return [...text.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((target) =>
      target &&
      !target.includes("${") &&
      !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)
    )
}

function verifyLocalReference(sourcePath, target) {
  const [rawPath, rawAnchor] = target.split("#")
  const targetPath = rawPath
    ? normalize(join(dirname(sourcePath), rawPath))
    : sourcePath
  if (!isFileOrDirectory(targetPath)) {
    fail(`${sourcePath} points to missing local reference: ${target}`)
    return
  }
  if (rawAnchor) {
    const anchor = decodeURIComponent(rawAnchor)
    const targetText = read(targetPath)
    if (!new RegExp(`\\bid=["']${escapeRegex(anchor)}["']`).test(targetText)) {
      fail(`${sourcePath} points to missing anchor: ${target}`)
    }
  }
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
mustExist(archivedMdSpecsDir)
mustExist("scripts/smoke-packaged-ripple.mjs")
mustExist("scripts/smoke-packaged-update.mjs")
mustExist("scripts/smoke-ripple-export-formats.ts")
mustExist("scripts/smoke-live-provider.mjs")
mustExist("scripts/agent-runtime-ui-eval.ts")
mustExist("scripts/export-agent-runtime-ui-fixture.ts")
mustExist("scripts/agent-runtime-ui-live-eval.ts")
mustExist("scripts/agent-runtime-ui-report.ts")
mustExist("scripts/refresh-agent-runtime-ui-fixtures.ts")
mustExist(".github/workflows/ripple-quality.yml")
mustExist("test/e2e/playwright.config.ts")
mustExist("test/e2e/helpers/ripple-electron.ts")
mustExist("test/e2e/agent-runtime-ui-fixtures.e2e.ts")
mustExist("test/e2e/agent-runtime-ui-live-fixtures.e2e.ts")
mustExist("test/e2e/agent-runtime-ui-temporal.e2e.ts")
mustExist("test/e2e/project-entry.e2e.ts")
mustExist("test/e2e/template-review.e2e.ts")
mustExist("test/quality/workflow-coverage.test.ts")
mustExist("test/quality/agent-runtime-ui-fixtures.test.ts")
mustExist("test/quality/hyperframes-fixtures.test.ts")
mustExist("test/fixtures/hyperframes/basic-title-card/index.html")
mustExist("test/fixtures/agent-runtime-ui/manifest.json")

const packageJson = JSON.parse(read(packageJsonPath))
for (const scriptName of requiredScripts) {
  if (!packageJson.scripts?.[scriptName]) {
    fail(`package.json is missing script ${scriptName}`)
  }
}

const qualityWorkflow = read(".github/workflows/ripple-quality.yml")
if (!qualityWorkflow.includes("bun run test:agent-ui:e2e")) {
  fail("Ripple quality workflow does not run test:agent-ui:e2e")
}

const activeSpecs = existsSync(join(repoRoot, specsDir))
  ? walk(specsDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => file.slice(`${specsDir}/`.length))
  : []
const activeSpecSet = new Set(activeSpecs)
const archivedSpecs = walk(archivedMdSpecsDir)
  .filter((file) => file.endsWith(".md"))
  .map((file) => file.slice(`${archivedMdSpecsDir}/`.length))
const archivedSpecSet = new Set(archivedSpecs)
const activeSpecTexts = new Map(activeSpecs.map((file) => [file, read(join(specsDir, file))]))
const archivedSpecTexts = new Map(archivedSpecs.map((file) => [file, read(join(archivedMdSpecsDir, file))]))
const specText = [...activeSpecTexts.values(), ...archivedSpecTexts.values()].join("\n")

for (const file of requiredActiveSpecFiles) {
  if (!activeSpecSet.has(file)) {
    fail(`Missing required active spec: ${join(specsDir, file)}`)
  }
}

for (const file of requiredArchivedSpecFiles) {
  if (!archivedSpecSet.has(file)) {
    fail(`Missing required archived spec: ${join(archivedMdSpecsDir, file)}`)
  }
}

for (const [file, text] of activeSpecTexts) {
  const path = join(specsDir, file)
  if (!text.includes("<title>")) {
    fail(`${path} is missing a document title`)
  }
  if (/href="[^"]+\.md(?:#[^"]*)?"/.test(text)) {
    fail(`${path} links directly to a stale Markdown spec`)
  }
  if (/(^|\n)\s*(TBD|TODO|none)\s*($|\n)/i.test(text)) {
    fail(`${path} contains an unfinished placeholder`)
  }
  for (const target of localReferences(text)) {
    verifyLocalReference(path, target)
  }
}

const index = archivedSpecTexts.get("Spec Index.md") || ""
for (const file of requiredArchivedSpecFiles.filter((file) =>
  file !== "Spec Index.md" &&
  !file.includes("/") &&
  file !== "Visual Context - v2.md"
)) {
  const title = file.replace(/\.md$/, "")
  if (!index.includes(`[[${title}]]`)) {
    fail(`Spec Index does not link ${title}`)
  }
}

const linkedSpecs = [...specText.matchAll(/\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
  .map((match) => `${match[1]}.md`)
for (const linkedSpec of linkedSpecs) {
  const nestedSpec = `${linkedSpec.replace(/\.md$/, "")}/${linkedSpec}`
  if (!archivedSpecSet.has(linkedSpec) && !archivedSpecSet.has(nestedSpec)) {
    fail(`Spec link points to missing page: ${linkedSpec}`)
  }
}

const docsText = [
  ...walk(specsDir).filter((path) => path.endsWith(".md") || path.endsWith(".html")),
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

console.log(`[quality-platform] verified ${activeSpecs.length} active specs, ${archivedSpecs.length} archived specs, ${testFiles.length} local tests, and ${requiredScripts.length} package scripts`)
