#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

type FixtureRequest = {
  name: string
  runId: string
}

function usage(): never {
  console.error([
    "Usage:",
    "  bun scripts/agent-runtime-ui-live-eval.ts",
    "  bun scripts/agent-runtime-ui-live-eval.ts --fixture <fixture-name>:<agent_run_id>",
    "  bun scripts/agent-runtime-ui-live-eval.ts --name <fixture-name> --run <agent_run_id>",
    "",
    "Options:",
    "  --db <path>          Override the Ripple agent database path.",
    "  --out-dir <path>     Output root. Defaults to test-results/agent-runtime-ui-live.",
    "  --all-events         Keep every run event while exporting.",
    "  --skip-check         Skip row-level DB eval before fixture export.",
    "  --skip-e2e           Skip Electron replay of exported fixtures.",
    "  --skip-temporal      Skip temporal UX replay of exported fixtures.",
    "  --skip-report        Skip HTML/JSON report generation.",
    "",
    "When no fixture is requested, this lists recent real Codex/Claude runs.",
  ].join("\n"))
  process.exit(1)
}

function flagValues(flag: string): string[] {
  const values: string[] = []
  const args = Bun.argv.slice(2)
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue
    const value = args[index + 1]
    if (!value || value.startsWith("--")) usage()
    values.push(value)
    index += 1
  }
  return values
}

function flagValue(flag: string): string | null {
  return flagValues(flag)[0] ?? null
}

function hasFlag(flag: string): boolean {
  return Bun.argv.includes(flag)
}

function parseFixtureValue(value: string): FixtureRequest {
  const separator = value.includes(":") ? ":" : "="
  const [name, runId] = value.split(separator)
  if (!name || !runId) usage()
  return { name, runId }
}

function validateFixtureName(name: string): void {
  if (/^[a-z0-9][a-z0-9-]*$/.test(name)) return
  console.error(`Fixture name must be kebab-case: ${name}`)
  process.exit(1)
}

function fixtureRequests(): FixtureRequest[] {
  const fromFixtureFlags = flagValues("--fixture").map(parseFixtureValue)
  const names = flagValues("--name")
  const runIds = flagValues("--run")
  if (names.length !== runIds.length) {
    if (names.length > 0 || runIds.length > 0) usage()
  }

  const fromPairs = names.map((name, index) => ({
    name,
    runId: runIds[index]!,
  }))
  const requests = [...fromFixtureFlags, ...fromPairs]
  for (const request of requests) validateFixtureName(request.name)
  return requests
}

async function runCommand(command: string[], options: {
  env?: Record<string, string>
} = {}): Promise<void> {
  console.log(`$ ${command.join(" ")}`)
  const child = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      ...options.env,
    },
  })
  const exitCode = await child.exited
  if (exitCode === 0) return
  process.exit(exitCode)
}

function dbPath(): string {
  return flagValue("--db") ??
    process.env.RIPPLE_AGENT_DB ??
    join(homedir(), "Library/Application Support/Ripple Dev/data/agents.db")
}

const requests = fixtureRequests()
const databasePath = dbPath()
const outDir = resolve(flagValue("--out-dir") ?? "test-results/agent-runtime-ui-live")
const fixtureDir = join(outDir, "fixtures")
const reportDir = join(outDir, "report")

if (requests.length === 0) {
  await runCommand([
    Bun.argv[0],
    "scripts/refresh-agent-runtime-ui-fixtures.ts",
    "--db",
    databasePath,
  ])
  process.exit(0)
}

if (!existsSync(databasePath)) {
  console.error(`Ripple agent database was not found at ${databasePath}`)
  process.exit(1)
}

for (const request of requests) {
  if (!hasFlag("--skip-check")) {
    await runCommand([
      Bun.argv[0],
      "scripts/agent-runtime-ui-eval.ts",
      "--check",
      "--timeline",
      request.runId,
    ], {
      env: { RIPPLE_AGENT_DB: databasePath },
    })
  }

  const exportCommand = [
    Bun.argv[0],
    "scripts/export-agent-runtime-ui-fixture.ts",
    "--run",
    request.runId,
    "--name",
    request.name,
    "--out",
    join(fixtureDir, `${request.name}.json`),
    "--db",
    databasePath,
  ]
  if (hasFlag("--all-events")) exportCommand.push("--all-events")
  await runCommand(exportCommand)
}

if (!hasFlag("--skip-report")) {
  await runCommand([
    Bun.argv[0],
    "scripts/agent-runtime-ui-report.ts",
    "--fixtures-dir",
    fixtureDir,
    "--out-dir",
    reportDir,
  ])
}

if (!hasFlag("--skip-e2e")) {
  await runCommand([Bun.argv[0], "run", "build"])
  await runCommand([
    "./node_modules/.bin/playwright",
    "test",
    "--config",
    "test/e2e/playwright.config.ts",
    "test/e2e/agent-runtime-ui-live-fixtures.e2e.ts",
  ], {
    env: {
      RIPPLE_AGENT_UI_FIXTURE_DIR: fixtureDir,
      RIPPLE_E2E_SCREENSHOT: process.env.RIPPLE_E2E_SCREENSHOT ?? "always",
    },
  })

  if (!hasFlag("--skip-temporal")) {
    await runCommand([
      "./node_modules/.bin/playwright",
      "test",
      "--config",
      "test/e2e/playwright.config.ts",
      "test/e2e/agent-runtime-ui-temporal.e2e.ts",
    ], {
      env: {
        RIPPLE_AGENT_UI_FIXTURE_DIR: fixtureDir,
        RIPPLE_E2E_SCREENSHOT: process.env.RIPPLE_E2E_SCREENSHOT ?? "always",
      },
    })
  }
}

console.log("")
console.log(`Live UI eval artifacts: ${outDir}`)
console.log(`Report: ${join(reportDir, "agent-runtime-ui-report.html")}`)
