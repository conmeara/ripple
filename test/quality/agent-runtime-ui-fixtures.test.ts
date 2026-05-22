import { describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

type ScenarioRequirement = {
  provider?: string
  status?: string
  runKind?: string
  minEventTypes?: Record<string, number>
  maxEventTypes?: Record<string, number>
  minRowKinds?: Record<string, number>
  absentRowKinds?: string[]
  visualKinds?: string[]
  hasPendingReplyCheckpoint?: boolean
  hasPendingRuntimeCheckpoint?: boolean
  forbidStaleThinkingAfterReply?: boolean
}

type Scenario = {
  id: string
  label: string
  required: boolean
  description: string
  requires: ScenarioRequirement
}

type Manifest = {
  schemaVersion: 1
  scenarios: Scenario[]
  fixtures: Array<{
    file: string
    scenarios: string[]
  }>
}

type Fixture = {
  schemaVersion: 1
  source: {
    provider: string
    status: string
    runKind?: string
  }
  events: Array<{
    type: string
  }>
  checkpoints: Array<{
    expectedRows: Array<{
      kind: string
      status: string
      visual?: string
    }>
  }>
}

const fixtureDir = join(process.cwd(), "test", "fixtures", "agent-runtime-ui")

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function counts(values: string[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const value of values) result[value] = (result[value] ?? 0) + 1
  return result
}

function allRows(fixture: Fixture): Array<{ kind: string; status: string; visual?: string }> {
  return fixture.checkpoints.flatMap((checkpoint) => checkpoint.expectedRows)
}

function scenarioMatches(fixture: Fixture, scenario: Scenario): boolean {
  const requirement = scenario.requires
  if (requirement.provider && fixture.source.provider !== requirement.provider) return false
  if (requirement.status && fixture.source.status !== requirement.status) return false
  if (requirement.runKind && fixture.source.runKind !== requirement.runKind) return false

  const eventCounts = counts(fixture.events.map((event) => event.type))
  for (const [eventType, minimum] of Object.entries(requirement.minEventTypes ?? {})) {
    if ((eventCounts[eventType] ?? 0) < minimum) return false
  }
  for (const [eventType, maximum] of Object.entries(requirement.maxEventTypes ?? {})) {
    if ((eventCounts[eventType] ?? 0) > maximum) return false
  }

  const rows = allRows(fixture)
  const rowCounts = counts(rows.map((row) => row.kind))
  for (const [rowKind, minimum] of Object.entries(requirement.minRowKinds ?? {})) {
    if ((rowCounts[rowKind] ?? 0) < minimum) return false
  }
  for (const rowKind of requirement.absentRowKinds ?? []) {
    if ((rowCounts[rowKind] ?? 0) > 0) return false
  }

  const visualKinds = new Set(rows.map((row) => row.visual).filter(Boolean))
  for (const visualKind of requirement.visualKinds ?? []) {
    if (!visualKinds.has(visualKind)) return false
  }

  if (requirement.hasPendingReplyCheckpoint) {
    const hasPendingReply = fixture.checkpoints.some((checkpoint) =>
      checkpoint.expectedRows.some((row) => row.kind === "reply" && row.status === "pending")
    )
    if (!hasPendingReply) return false
  }
  if (requirement.hasPendingRuntimeCheckpoint) {
    const hasPendingRuntime = fixture.checkpoints.some((checkpoint) =>
      checkpoint.expectedRows.some((row) => row.kind !== "reply" && row.status === "pending")
    )
    if (!hasPendingRuntime) return false
  }
  if (requirement.forbidStaleThinkingAfterReply) {
    const hasStaleThinkingAfterReply = fixture.checkpoints.some((checkpoint) => {
      const replyIndex = checkpoint.expectedRows.findIndex((row) => row.kind === "reply")
      return replyIndex >= 0 && checkpoint.expectedRows
        .slice(replyIndex + 1)
        .some((row, offset) =>
          row.kind === "thinking" &&
          !(row.status === "pending" && replyIndex + 1 + offset === checkpoint.expectedRows.length - 1)
        )
    })
    if (hasStaleThinkingAfterReply) return false
  }

  return true
}

describe("agent runtime UI real-session fixture coverage", () => {
  const manifest = readJson<Manifest>(join(fixtureDir, "manifest.json"))
  const scenarioIds = new Set(manifest.scenarios.map((scenario) => scenario.id))
  const fixtures = new Map(
    manifest.fixtures.map((entry) => [
      entry.file,
      readJson<Fixture>(join(fixtureDir, entry.file)),
    ]),
  )

  test("keeps a valid manifest of required real-session scenarios", () => {
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.scenarios.length).toBeGreaterThanOrEqual(9)
    expect(manifest.fixtures.length).toBeGreaterThanOrEqual(6)

    const fixtureFiles = new Set(
      readdirSync(fixtureDir).filter((fileName) => fileName.endsWith(".json") && fileName !== "manifest.json"),
    )
    for (const entry of manifest.fixtures) {
      expect(fixtureFiles.has(entry.file), entry.file).toBe(true)
      expect(entry.scenarios.length, entry.file).toBeGreaterThan(0)
      for (const scenarioId of entry.scenarios) {
        expect(scenarioIds.has(scenarioId), scenarioId).toBe(true)
      }
    }
  })

  test("covers every required UI scenario with a matching real fixture", () => {
    for (const scenario of manifest.scenarios.filter((item) => item.required)) {
      const matchingFixtureNames = manifest.fixtures
        .filter((entry) => entry.scenarios.includes(scenario.id))
        .map((entry) => entry.file)

      expect(matchingFixtureNames.length, scenario.id).toBeGreaterThan(0)
      expect(
        matchingFixtureNames.some((fileName) => scenarioMatches(fixtures.get(fileName)!, scenario)),
        `${scenario.id}: ${scenario.description}`,
      ).toBe(true)
    }
  })

  test("generates a reviewable chat and comments UI report from canonical fixtures", () => {
    const outDir = mkdtempSync(join(tmpdir(), "ripple-agent-ui-report-"))
    const result = Bun.spawnSync({
      cmd: [
        Bun.argv[0],
        "scripts/agent-runtime-ui-report.ts",
        "--fixtures-dir",
        fixtureDir,
        "--out-dir",
        outDir,
      ],
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode, result.stderr.toString()).toBe(0)
    const report = readJson<{
      summary: {
        fixtureCount: number
        checkpointCount: number
        errorCount: number
      }
      refreshChecklist: string[]
    }>(join(outDir, "agent-runtime-ui-report.json"))
    const html = readFileSync(join(outDir, "agent-runtime-ui-report.html"), "utf8")

    expect(report.summary.fixtureCount).toBeGreaterThanOrEqual(6)
    expect(report.summary.checkpointCount).toBeGreaterThan(10)
    expect(report.summary.errorCount).toBe(0)
    expect(report.refreshChecklist.join("\n")).toContain("Run a real Codex and Claude session")
    expect(html).toContain("Agent Runtime UI Report")
    expect(html).toContain("Provider Refresh Checklist")
  })
})
