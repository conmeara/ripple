#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const repoRoot = process.cwd()
const matrixPath = "docs/testing/ux-workflow-coverage.md"
const closeoutPath = "docs/testing/agent-closeout.md"
const releaseChecklistPath = "docs/release/v1-release-checklist.md"
const packageJsonPath = "package.json"

const requiredWorkflowIds = [
  "BOOT-01",
  "BOOT-02",
  "PROJECT-01",
  "PROJECT-02",
  "PROJECT-03",
  "PROJECT-04",
  "PREVIEW-01",
  "PREVIEW-02",
  "PREVIEW-03",
  "TIMELINE-01",
  "TIMELINE-02",
  "ASSET-01",
  "COMMENTS-01",
  "COMMENTS-02",
  "REVISIONS-01",
  "REVISIONS-02",
  "CHAT-01",
  "CHAT-02",
  "AGENT-01",
  "AGENT-02",
  "AGENT-03",
  "VISUAL-01",
  "EXPORT-01",
  "EXPORT-02",
  "EXPORT-03",
  "ANALYTICS-01",
  "ANALYTICS-02",
  "UPDATES-01",
  "UPDATES-02",
  "PACKAGE-01",
  "PACKAGE-02",
  "FAILURE-01",
  "LAYOUT-01",
  "SECURITY-01",
  "DB-01",
  "QUALITY-01",
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
  "test:e2e:update",
  "test:visual",
  "test:live",
  "test:package:smoke",
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

mustExist(matrixPath)
mustExist(closeoutPath)
mustExist(releaseChecklistPath)
mustExist("scripts/smoke-packaged-ripple.mjs")
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

const matrix = read(matrixPath)
const rows = new Map()

for (const line of matrix.split(/\r?\n/)) {
  if (!line.startsWith("| ")) continue
  const columns = line.split("|").slice(1, -1).map((column) => column.trim())
  if (columns.length < 7) continue
  const [id, workflow, acceptance, evidence, command, releaseGate, status] = columns
  if (!/^[A-Z]+-\d{2}$/.test(id)) continue
  rows.set(id, { id, workflow, acceptance, evidence, command, releaseGate, status })
}

for (const id of requiredWorkflowIds) {
  if (!rows.has(id)) {
    fail(`Workflow matrix is missing ${id}`)
  }
}

for (const row of rows.values()) {
  const combined = Object.values(row).join(" ")
  if (/\b(TBD|TODO|none)\b/i.test(combined)) {
    fail(`${row.id} contains an unfinished placeholder`)
  }
  if (!/Automated|Release-gated/.test(row.status)) {
    fail(`${row.id} has unsupported status: ${row.status}`)
  }
  if (row.status.includes("Release-gated") && !row.releaseGate.includes(releaseChecklistPath)) {
    fail(`${row.id} is release-gated but does not reference ${releaseChecklistPath}`)
  }

  const evidencePaths = [...row.evidence.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter((value) => !value.startsWith("bun ") && !value.startsWith("RIPPLE_"))

  if (row.status.includes("Automated") && evidencePaths.length === 0) {
    fail(`${row.id} is automated but has no evidence paths`)
  }

  for (const evidencePath of evidencePaths) {
    if (!isFileOrDirectory(evidencePath)) {
      fail(`${row.id} references missing evidence path: ${evidencePath}`)
    }
  }

  const scriptMatches = [...row.command.matchAll(/bun run ([a-zA-Z0-9:_-]+)/g)]
  for (const match of scriptMatches) {
    const scriptName = match[1]
    if (!packageJson.scripts?.[scriptName]) {
      fail(`${row.id} references missing package script: ${scriptName}`)
    }
  }
}

const closeout = read(closeoutPath)
for (const area of [
  "Project creation",
  "Templates",
  "Preview",
  "Comments",
  "Revisions",
  "Provider runtime",
  "Exports",
  "Analytics",
  "App updates",
  "Packaging",
]) {
  if (!closeout.includes(area)) {
    fail(`agent closeout protocol is missing area: ${area}`)
  }
}

if (process.exitCode) {
  process.exit()
}

console.log(`[quality-platform] verified ${rows.size} workflow rows and ${requiredScripts.length} package scripts`)
