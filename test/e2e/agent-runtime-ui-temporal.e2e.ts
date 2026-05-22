import type { Page, TestInfo } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { expect, test } from "./helpers/ripple-electron"

const FIXTURE_STORAGE_KEY = "ripple:agent-runtime-ui-e2e-fixture"

type FixtureEvent = {
  [key: string]: unknown
  type?: string
}

type FixtureCheckpoint = {
  name: string
  eventCount: number
  live: boolean
  shimmerCount: number
  expectedRows?: Array<{
    kind: string
    status: string
    title: string
  }>
}

type RuntimeUiFixture = {
  source?: {
    provider?: string
    status?: string
  }
  projectPath?: string
  events: FixtureEvent[]
  checkpoints: FixtureCheckpoint[]
}

type Box = {
  top: number
  left: number
  width: number
  height: number
}

type RowSample = Box & {
  id: string
  kind: string
  status: string
  title: string
  active: boolean
}

type TemporalSample = {
  checkpointIndex: number
  checkpointName: string
  eventType: string
  text: string
  replyTextLength: number
  shimmerCount: number
  scrollTop: number
  rows: RowSample[]
  visualPreviews: RowSample[]
  statusLine: (Box & { status: string; text: string }) | null
}

const CHAT_RAW_RUNTIME_LEAK_PATTERN =
  /\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__)\b|(?:\/bin\/zsh|sed -n|git diff|bun run|npm run|hyperframes validate|\/Users\/|\/private\/tmp\/)/i

const COMMENT_RAW_RUNTIME_LEAK_PATTERN =
  /\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__|Agent is thinking|Editing files|Agent run)\b|(?:\/bin\/zsh|sed -n|git diff|bun run|npm run|hyperframes validate|\/Users\/|\/private\/tmp\/)/i

const CHAT_FIXTURES = [
  "real-codex-phone-move-right.json",
  "real-claude-phone-move.json",
]

const COMMENT_FIXTURES = [
  "real-codex-comment-revision.json",
  "real-claude-phone-move.json",
]

const BURST_COMPLETED_TOOL_FIXTURE: RuntimeUiFixture = {
  name: "burst-completed-tool",
  projectPath: "/Users/motion/Ripple Projects/Burst Fixture",
  source: {
    provider: "claude",
    status: "completed",
  },
  events: [
    {
      id: "burst-read-start",
      agentRunId: "burst-run",
      sequence: 1,
      createdAt: "2026-05-22T18:12:28.000Z",
      provider: "claude",
      providerId: "read-1",
      providerType: "assistant:tool_use",
      type: "tool_start",
      payload: {
        toolCallId: "read-1",
        toolName: "Read",
        input: { file_path: "index.html" },
      },
    },
    {
      id: "burst-read-end",
      agentRunId: "burst-run",
      sequence: 2,
      createdAt: "2026-05-22T18:12:28.000Z",
      provider: "claude",
      providerId: "read-1",
      providerType: "user:tool_result",
      type: "tool_end",
      payload: {
        toolCallId: "read-1",
        toolName: "Read",
        status: "completed",
        output: "<main>Ripple composition</main>",
      },
    },
    {
      id: "burst-reply-delta",
      agentRunId: "burst-run",
      sequence: 3,
      createdAt: "2026-05-22T18:12:29.000Z",
      provider: "claude",
      providerId: "reply-1",
      providerType: "content_block_delta",
      type: "assistant_text_delta",
      payload: {
        delta: "Done.",
      },
    },
  ],
  checkpoints: [
    {
      name: "before tool burst",
      eventCount: 0,
      live: true,
      shimmerCount: 0,
    },
    {
      name: "after coalesced tool burst",
      eventCount: 2,
      live: true,
      shimmerCount: 1,
      expectedRows: [
        {
          kind: "explored",
          status: "done",
          title: "Explored 1 file",
        },
      ],
    },
    {
      name: "after short handoff reply",
      eventCount: 3,
      live: true,
      shimmerCount: 0,
      expectedRows: [
        {
          kind: "explored",
          status: "done",
          title: "Explored 1 file",
        },
        {
          kind: "reply",
          status: "pending",
          title: "Agent reply",
        },
      ],
    },
  ],
}

function fixtureDir(): string {
  return resolve(
    process.env.RIPPLE_AGENT_UI_FIXTURE_DIR?.trim() ||
      join(process.cwd(), "test/fixtures/agent-runtime-ui"),
  )
}

function loadFixture(file: string): RuntimeUiFixture {
  const path = join(fixtureDir(), file)
  if (!existsSync(path)) {
    throw new Error(`Missing temporal UI fixture: ${path}`)
  }
  return JSON.parse(readFileSync(path, "utf8")) as RuntimeUiFixture
}

function eventTypeAt(fixture: RuntimeUiFixture, checkpoint: FixtureCheckpoint): string {
  return fixture.events[checkpoint.eventCount - 1]?.type ?? "unknown"
}

function selectedTemporalIndexes(fixture: RuntimeUiFixture): number[] {
  const liveIndexes = fixture.checkpoints
    .map((checkpoint, index) => ({ checkpoint, index }))
    .filter(({ checkpoint }) => checkpoint.live)

  const important = liveIndexes.filter(({ checkpoint }) => {
    const eventType = eventTypeAt(fixture, checkpoint)
    return (
      eventType === "assistant_text_delta" ||
      eventType === "assistant_message" ||
      eventType === "tool_start" ||
      eventType === "tool_end" ||
      checkpoint.expectedRows?.some((row) => row.status === "pending")
    )
  }).map(({ index }) => index)

  const indexes = important.length > 0
    ? important
    : liveIndexes.map(({ index }) => index)
  const lastIndex = fixture.checkpoints.length - 1
  return Array.from(new Set([...indexes, lastIndex])).sort((left, right) => left - right)
}

async function settleFrame(page: Page): Promise<void> {
  await page.evaluate(() =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  )
}

async function mountFixture(
  page: Page,
  fixture: RuntimeUiFixture,
  checkpointIndex: number,
  hash: string,
  testId: string,
): Promise<void> {
  await page.waitForLoadState("domcontentloaded")
  await page.evaluate(({ storageKey, fixture, checkpointIndex, hash }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({ fixture, checkpointIndex }))
    window.location.hash = hash
  }, {
    storageKey: FIXTURE_STORAGE_KEY,
    fixture,
    checkpointIndex,
    hash,
  })
  await page.reload()
  const harness = page.getByTestId(testId)
  await expect(harness).toBeVisible({ timeout: 45_000 })
  await expect(harness).toHaveAttribute("data-fixture-checkpoint-index", String(checkpointIndex))
}

async function setCheckpoint(
  page: Page,
  checkpointIndex: number,
  testId: string,
): Promise<void> {
  await page.evaluate((nextIndex) => {
    ;(window as Window & {
      __RIPPLE_AGENT_UI_SET_CHECKPOINT__?: (input: number | string) => void
    }).__RIPPLE_AGENT_UI_SET_CHECKPOINT__?.(nextIndex)
  }, checkpointIndex)
  const harness = page.getByTestId(testId)
  await expect(harness).toHaveAttribute("data-fixture-checkpoint-index", String(checkpointIndex))
  await settleFrame(page)
}

async function collectSample(
  page: Page,
  fixture: RuntimeUiFixture,
  checkpointIndex: number,
  testId: string,
): Promise<TemporalSample> {
  const checkpoint = fixture.checkpoints[checkpointIndex]
  if (!checkpoint) throw new Error(`Unknown checkpoint ${checkpointIndex}`)

  return page.getByTestId(testId).evaluate((root, metadata) => {
    const asBox = (element: Element): Box => {
      const rect = element.getBoundingClientRect()
      return {
        top: Math.round(rect.top * 100) / 100,
        left: Math.round(rect.left * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      }
    }
    const rowSample = (element: Element): RowSample => {
      const html = element as HTMLElement
      return {
        ...asBox(element),
        id: html.dataset.agentMotionRowId ?? html.dataset.agentMotionVisualId ?? "",
        kind: html.dataset.agentMotionRowKind ?? html.dataset.agentMotionVisualKind ?? "",
        status: html.dataset.agentMotionRowStatus ?? html.dataset.agentMotionVisualStatus ?? "",
        active: html.dataset.agentMotionRowActive === "true",
        title: html.dataset.agentMotionRowTitle ?? html.textContent?.trim() ?? "",
      }
    }
    const statusLine = root.querySelector("[data-comment-revision-status-line='true']")
    return {
      checkpointIndex: metadata.checkpointIndex,
      checkpointName: metadata.checkpointName,
      eventType: metadata.eventType,
      text: (root as HTMLElement).innerText,
      replyTextLength: Array.from(root.querySelectorAll("[data-part-type='text']"))
        .map((element) => element.textContent ?? "")
        .join("\n")
        .trim()
        .length,
      shimmerCount: root.querySelectorAll("[data-text-shimmer='true']").length,
      scrollTop: (root as HTMLElement).scrollTop,
      rows: Array.from(root.querySelectorAll("[data-agent-motion-row-id]")).map(rowSample),
      visualPreviews: Array.from(root.querySelectorAll("[data-agent-motion-visual-preview='true']")).map(rowSample),
      statusLine: statusLine
        ? {
          ...asBox(statusLine),
          status: (statusLine as HTMLElement).dataset.commentRevisionStatus ?? "",
          text: statusLine.textContent?.trim() ?? "",
        }
        : null,
    }
  }, {
    checkpointIndex,
    checkpointName: checkpoint.name,
    eventType: eventTypeAt(fixture, checkpoint),
  })
}

function expectUniqueIds(samples: TemporalSample[], label: string): void {
  for (const sample of samples) {
    const ids = sample.rows.map((row) => row.id).filter(Boolean)
    expect(new Set(ids).size, `${label}:${sample.checkpointName}: duplicate row ids`).toBe(ids.length)
  }
}

function expectStableRows(samples: TemporalSample[], label: string): void {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!
    const current = samples[index]!
    const previousRows = new Map(previous.rows.map((row) => [row.id, row]))

    for (const row of current.rows) {
      const prior = previousRows.get(row.id)
      if (!prior) continue
      expect(
        Math.abs(row.top - prior.top),
        `${label}:${current.checkpointName}: stable row ${row.id} jumped vertically`,
      ).toBeLessThanOrEqual(8)
      expect(
        Math.abs(row.height - prior.height),
        `${label}:${current.checkpointName}: stable row ${row.id} resized vertically`,
      ).toBeLessThanOrEqual(4)
    }
  }
}

function expectStableVisualPreviews(samples: TemporalSample[], label: string): void {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!
    const current = samples[index]!
    const previousPreviews = new Map(previous.visualPreviews.map((preview) => [preview.id, preview]))

    for (const preview of current.visualPreviews) {
      const prior = previousPreviews.get(preview.id)
      if (!prior) continue
      expect(
        Math.abs(preview.width - prior.width),
        `${label}:${current.checkpointName}: visual preview ${preview.id} changed width`,
      ).toBeLessThanOrEqual(2)
      expect(
        Math.abs(preview.height - prior.height),
        `${label}:${current.checkpointName}: visual preview ${preview.id} changed height`,
      ).toBeLessThanOrEqual(2)
    }
  }
}

function expectStreamingCadence(samples: TemporalSample[], label: string): void {
  const textDeltaSamples = samples.filter((sample) => sample.eventType === "assistant_text_delta")
  if (textDeltaSamples.length < 2) return

  const lengths = textDeltaSamples.map((sample) => sample.replyTextLength)
  for (let index = 1; index < lengths.length; index += 1) {
    expect(
      lengths[index],
      `${label}: assistant text should not shrink across text deltas`,
    ).toBeGreaterThanOrEqual(lengths[index - 1]!)
  }
  expect(
    new Set(lengths).size,
    `${label}: text deltas should produce progressive visible text, not one final lump`,
  ).toBeGreaterThan(1)
}

function expectChatTemporalBudget(samples: TemporalSample[], label: string): void {
  for (const sample of samples) {
    expect(sample.shimmerCount, `${label}:${sample.checkpointName}: shimmer count`)
      .toBeLessThanOrEqual(1)
    expect(sample.text, `${label}:${sample.checkpointName}: raw runtime leak`)
      .not.toMatch(CHAT_RAW_RUNTIME_LEAK_PATTERN)
    expect(sample.scrollTop, `${label}:${sample.checkpointName}: harness scroll jump`)
      .toBeLessThanOrEqual(4)
  }
  expectUniqueIds(samples, label)
  expectStableRows(samples, label)
  expectStableVisualPreviews(samples, label)
  expectStreamingCadence(samples, label)
}

function expectCommentTemporalBudget(samples: TemporalSample[], label: string): void {
  for (const sample of samples) {
    expect(sample.shimmerCount, `${label}:${sample.checkpointName}: shimmer count`)
      .toBeLessThanOrEqual(1)
    expect(sample.text, `${label}:${sample.checkpointName}: raw runtime leak`)
      .not.toMatch(COMMENT_RAW_RUNTIME_LEAK_PATTERN)
    expect(sample.scrollTop, `${label}:${sample.checkpointName}: harness scroll jump`)
      .toBeLessThanOrEqual(4)
  }

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!.statusLine
    const current = samples[index]!.statusLine
    if (!previous || !current) continue
    expect(
      Math.abs(current.top - previous.top),
      `${label}:${samples[index]!.checkpointName}: comment status line jumped`,
    ).toBeLessThanOrEqual(8)
    expect(
      Math.abs(current.height - previous.height),
      `${label}:${samples[index]!.checkpointName}: comment status line resized`,
    ).toBeLessThanOrEqual(4)
  }
}

async function attachTemporalSamples(
  testInfo: TestInfo,
  name: string,
  samples: TemporalSample[],
): Promise<void> {
  await testInfo.attach(`${name} temporal samples`, {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  })
}

test.describe("agent runtime UI temporal UX contract", () => {
  test("chat gives coalesced start/end events a visible active dwell @agent-ui @temporal", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)

    await mountFixture(
      page,
      BURST_COMPLETED_TOOL_FIXTURE,
      0,
      "agent-runtime-ui-fixture",
      "agent-runtime-ui-e2e-harness",
    )

    await setCheckpoint(page, 1, "agent-runtime-ui-e2e-harness")
    const activeSample = await collectSample(
      page,
      BURST_COMPLETED_TOOL_FIXTURE,
      1,
      "agent-runtime-ui-e2e-harness",
    )

    expect(activeSample.shimmerCount, "coalesced tool should shimmer once while live").toBe(1)
    expect(activeSample.rows).toEqual([
      expect.objectContaining({
        kind: "explored",
        status: "done",
        active: true,
        title: "Exploring 1 file",
      }),
    ])
    expect(activeSample.text, "coalesced tool should first read as active work")
      .toContain("Exploring 1 file")

    await page.waitForTimeout(620)
    await settleFrame(page)
    const settledSample = await collectSample(
      page,
      BURST_COMPLETED_TOOL_FIXTURE,
      1,
      "agent-runtime-ui-e2e-harness",
    )

    await attachTemporalSamples(testInfo, "coalesced-tool-dwell-chat", [
      activeSample,
      settledSample,
    ])

    expect(settledSample.shimmerCount, "coalesced tool should settle after dwell").toBe(0)
    expect(settledSample.rows).toEqual([
      expect.objectContaining({
        kind: "explored",
        status: "done",
        active: false,
        title: "Explored 1 file",
      }),
    ])
    expect(settledSample.text, "coalesced tool should return to completed copy")
      .toContain("Explored 1 file")
  })

  test("chat does not flash generic thinking during a short activity-to-reply handoff @agent-ui @temporal", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)

    await mountFixture(
      page,
      BURST_COMPLETED_TOOL_FIXTURE,
      1,
      "agent-runtime-ui-fixture",
      "agent-runtime-ui-e2e-harness",
    )

    await page.waitForTimeout(1_200)
    await settleFrame(page)
    const handoffSample = await collectSample(
      page,
      BURST_COMPLETED_TOOL_FIXTURE,
      1,
      "agent-runtime-ui-e2e-harness",
    )

    expect(handoffSample.text, "short handoff should keep concrete activity, not generic thinking")
      .not.toContain("Thinking")
    expect(handoffSample.shimmerCount, "short handoff should not add a fallback shimmer").toBe(0)
    expect(handoffSample.rows).toEqual([
      expect.objectContaining({
        kind: "explored",
        status: "done",
        active: false,
        title: "Explored 1 file",
      }),
    ])

    await setCheckpoint(page, 2, "agent-runtime-ui-e2e-harness")
    const replySample = await collectSample(
      page,
      BURST_COMPLETED_TOOL_FIXTURE,
      2,
      "agent-runtime-ui-e2e-harness",
    )

    await attachTemporalSamples(testInfo, "short-activity-to-reply-handoff-chat", [
      handoffSample,
      replySample,
    ])

    expect(replySample.text).toContain("Done.")
    expect(replySample.text).not.toContain("Thinking")
  })

  test("chat replays real Claude and Codex runs without row, preview, or streaming jank @agent-ui @temporal", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000)

    for (const fixtureFile of CHAT_FIXTURES) {
      const fixture = loadFixture(fixtureFile)
      const indexes = selectedTemporalIndexes(fixture)
      expect(indexes.length, fixtureFile).toBeGreaterThan(1)

      await mountFixture(
        page,
        fixture,
        indexes[0]!,
        "agent-runtime-ui-fixture",
        "agent-runtime-ui-e2e-harness",
      )

      const samples: TemporalSample[] = []
      for (const checkpointIndex of indexes) {
        await setCheckpoint(page, checkpointIndex, "agent-runtime-ui-e2e-harness")
        samples.push(await collectSample(
          page,
          fixture,
          checkpointIndex,
          "agent-runtime-ui-e2e-harness",
        ))
      }

      await attachTemporalSamples(testInfo, fixtureFile.replace(/\.json$/, "-chat"), samples)
      expectChatTemporalBudget(samples, fixtureFile)
    }
  })

  test("comments replay real Claude and Codex run states without status-line jank @agent-ui @comments @temporal", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)

    for (const fixtureFile of COMMENT_FIXTURES) {
      const fixture = loadFixture(fixtureFile)
      const indexes = selectedTemporalIndexes(fixture)
      expect(indexes.length, fixtureFile).toBeGreaterThan(1)

      await mountFixture(
        page,
        fixture,
        indexes[0]!,
        "agent-runtime-comments-fixture",
        "agent-runtime-comments-e2e-harness",
      )

      const samples: TemporalSample[] = []
      for (const checkpointIndex of indexes) {
        await setCheckpoint(page, checkpointIndex, "agent-runtime-comments-e2e-harness")
        samples.push(await collectSample(
          page,
          fixture,
          checkpointIndex,
          "agent-runtime-comments-e2e-harness",
        ))
      }

      await attachTemporalSamples(testInfo, fixtureFile.replace(/\.json$/, "-comments"), samples)
      expectCommentTemporalBudget(samples, fixtureFile)
    }
  })
})
