#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"

type FixtureRequest = {
  name: string
  runId: string
}

type RecentRun = {
  id: string
  provider: string
  model: string | null
  status: string
  runKind: string
  prompt: string
  eventCount: number
  lastActivityAt: number | null
}

function usage(): never {
  console.error([
    "Usage:",
    "  bun scripts/refresh-agent-runtime-ui-fixtures.ts",
    "  bun scripts/refresh-agent-runtime-ui-fixtures.ts --fixture <fixture-name>:<agent_run_id>",
    "  bun scripts/refresh-agent-runtime-ui-fixtures.ts --name <fixture-name> --run <agent_run_id>",
    "",
    "Options:",
    "  --db <path>          Override the Ripple agent database path.",
    "  --out-dir <path>     Fixture directory. Defaults to test/fixtures/agent-runtime-ui.",
    "  --limit <number>     Recent-run list size when no fixture is requested. Defaults to 12.",
    "  --all-events         Keep every run event when exporting fixtures.",
    "  --skip-test          Do not run the replay fixture eval after export.",
  ].join("\n"))
  process.exit(1)
}

function flagValues(flag: string): string[] {
  const values: string[] = []
  const args = Bun.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
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

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(value: string, max = 96): string {
  const normalized = compact(value)
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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
    runId: runIds[index],
  }))
  const requests = [...fromFixtureFlags, ...fromPairs]
  for (const request of requests) validateFixtureName(request.name)
  return requests
}

function dbPath(): string {
  return flagValue("--db") ??
    process.env.RIPPLE_AGENT_DB ??
    join(homedir(), "Library/Application Support/Ripple Dev/data/agents.db")
}

function formatDate(value: number | null): string {
  if (!value) return "unknown"
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value
  return new Date(milliseconds).toISOString().replace("T", " ").slice(0, 16)
}

function listRecentRuns(input: { dbPath: string; limit: number }): void {
  if (!existsSync(input.dbPath)) {
    console.error(`Ripple agent database was not found at ${input.dbPath}`)
    process.exit(1)
  }

  const db = new Database(input.dbPath, { readonly: true })
  const rows = db.query(`
    select
      r.id,
      r.provider,
      r.model,
      r.status,
      r.run_kind as runKind,
      r.prompt,
      count(e.id) as eventCount,
      max(coalesce(r.completed_at, r.updated_at, r.created_at)) as lastActivityAt
    from agent_runs r
    left join agent_run_events e on e.agent_run_id = r.id
    where r.provider in ('codex', 'claude')
    group by r.id
    having count(e.id) > 0
    order by lastActivityAt desc
    limit ?
  `).all(input.limit) as RecentRun[]

  if (rows.length === 0) {
    console.log("No recent agent runs with recorded events were found.")
    return
  }

  console.log("Recent real agent runs that can become UI fixtures")
  for (const [index, row] of rows.entries()) {
    const model = row.model ? ` ${row.model}` : ""
    console.log(`${String(index + 1).padStart(2, " ")}. ${row.id}`)
    console.log(`    ${row.provider}${model} - ${row.status} - ${row.runKind} - ${row.eventCount} events - ${formatDate(row.lastActivityAt)}`)
    console.log(`    ${truncate(row.prompt, 120)}`)
  }
  console.log("")
  console.log("Refresh one with:")
  console.log("  bun run eval:agent-runtime-ui:refresh -- --fixture real-codex-example:<agent_run_id>")
}

async function runCommand(command: string[]): Promise<void> {
  const child = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await child.exited
  if (exitCode === 0) return
  process.exit(exitCode)
}

const requests = fixtureRequests()
const databasePath = dbPath()
const outDir = flagValue("--out-dir") ?? "test/fixtures/agent-runtime-ui"

if (requests.length === 0) {
  listRecentRuns({
    dbPath: databasePath,
    limit: parsePositiveInteger(flagValue("--limit"), 12),
  })
  process.exit(0)
}

for (const request of requests) {
  const command = [
    Bun.argv[0],
    "scripts/export-agent-runtime-ui-fixture.ts",
    "--run",
    request.runId,
    "--name",
    request.name,
    "--out",
    join(outDir, `${request.name}.json`),
    "--db",
    databasePath,
  ]
  if (hasFlag("--all-events")) command.push("--all-events")
  await runCommand(command)
}

if (!hasFlag("--skip-test")) {
  await runCommand([
    Bun.argv[0],
    "test",
    "src/renderer/features/agents/ui/agent-runtime-ui-replay-eval.test.ts",
  ])
}
