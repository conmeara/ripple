import type { Page, TestInfo } from "@playwright/test"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { expect, test } from "./helpers/ripple-electron"

const FIXTURE_STORAGE_KEY = "ripple:agent-runtime-ui-e2e-fixture"

type RuntimeFixtureEvent = {
  type?: string
}

type FixtureCheckpoint = {
  name: string
  eventCount: number
  live: boolean
  shimmerCount: number
  expectedRows: Array<{
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
  events: RuntimeFixtureEvent[]
  checkpoints: FixtureCheckpoint[]
}

type LoadedFixture = {
  file: string
  fixture: RuntimeUiFixture
}

const CHAT_RAW_RUNTIME_LEAK_PATTERN =
  /\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__)\b|(?:\/bin\/zsh|sed -n|git diff|bun run|npm run|hyperframes validate|\/Users\/|\/private\/tmp\/)/i

const COMMENT_RAW_RUNTIME_LEAK_PATTERN =
  /\b(?:Bash|Edit|Write|Grep|Glob|commandExecution|fileChange|tool-|mcp__|Agent is thinking|Editing files|Agent run)\b|(?:\/bin\/zsh|sed -n|git diff|bun run|npm run|hyperframes validate|\/Users\/|\/private\/tmp\/)/i

function fixtureDir(): string | null {
  const value = process.env.RIPPLE_AGENT_UI_FIXTURE_DIR?.trim()
  return value ? resolve(value) : null
}

function loadFixtures(): LoadedFixture[] {
  const dir = fixtureDir()
  if (!dir || !existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .sort()
    .map((file) => ({
      file,
      fixture: JSON.parse(readFileSync(join(dir, file), "utf8")) as RuntimeUiFixture,
    }))
}

function maxCheckpoints(): number | null {
  const value = process.env.RIPPLE_AGENT_UI_FIXTURE_MAX_CHECKPOINTS
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function selectedCheckpoints(fixture: RuntimeUiFixture): FixtureCheckpoint[] {
  const checkpoints = fixture.checkpoints ?? []
  const max = maxCheckpoints()
  if (!max || checkpoints.length <= max) return checkpoints
  if (max === 1) return [checkpoints[checkpoints.length - 1]!]

  const selected: FixtureCheckpoint[] = []
  for (let index = 0; index < max; index += 1) {
    const sourceIndex = Math.round((index * (checkpoints.length - 1)) / (max - 1))
    const checkpoint = checkpoints[sourceIndex]
    if (checkpoint && !selected.includes(checkpoint)) selected.push(checkpoint)
  }
  return selected
}

function expectsMotionRuntimeFeed(checkpoint: FixtureCheckpoint): boolean {
  return checkpoint.expectedRows.some((row) => row.kind !== "reply")
}

async function setFixturePayload(
  page: Page,
  fixture: RuntimeUiFixture,
  checkpointIndex: number,
  hash: string,
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
}

async function renderChatCheckpoint(
  page: Page,
  fixture: RuntimeUiFixture,
  checkpoint: FixtureCheckpoint,
): Promise<void> {
  const checkpointIndex = fixture.checkpoints.indexOf(checkpoint)
  if (checkpointIndex === -1) throw new Error(`Unknown checkpoint: ${checkpoint.name}`)
  await setFixturePayload(page, fixture, checkpointIndex, "agent-runtime-ui-fixture")
  const harness = page.getByTestId("agent-runtime-ui-e2e-harness")
  await expect(harness).toBeVisible({ timeout: 45_000 })
  await expect(harness).toHaveAttribute("data-fixture-checkpoint", checkpoint.name)
  await expect(page.locator("[data-assistant-message-id]")).toBeVisible()
}

async function renderCommentsCheckpoint(
  page: Page,
  fixture: RuntimeUiFixture,
  checkpoint: FixtureCheckpoint,
): Promise<void> {
  const checkpointIndex = fixture.checkpoints.indexOf(checkpoint)
  if (checkpointIndex === -1) throw new Error(`Unknown checkpoint: ${checkpoint.name}`)
  await setFixturePayload(page, fixture, checkpointIndex, "agent-runtime-comments-fixture")
  const harness = page.getByTestId("agent-runtime-comments-e2e-harness")
  await expect(harness).toBeVisible({ timeout: 45_000 })
  await expect(harness).toHaveAttribute("data-fixture-checkpoint", checkpoint.name)
  await expect(page.locator("[data-comment-card='true']")).toBeVisible()
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (process.env.RIPPLE_AGENT_UI_FIXTURE_SCREENSHOTS === "0") return
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(`${name} screenshot`, {
    path,
    contentType: "image/png",
  })
}

test.describe("agent runtime UI exported live fixtures", () => {
  const fixtures = loadFixtures()

  test.skip(
    fixtures.length === 0,
    "Set RIPPLE_AGENT_UI_FIXTURE_DIR to replay exported live agent-runtime UI fixtures.",
  )

  test("render exported fixtures through chat and comments harnesses @agent-ui @live-fixture", async ({
    page,
  }, testInfo) => {
    test.setTimeout(600_000)

    for (const loaded of fixtures) {
      const checkpoints = selectedCheckpoints(loaded.fixture)
      expect(checkpoints.length, loaded.file).toBeGreaterThan(0)

      for (const checkpoint of checkpoints) {
        const checkpointIndex = loaded.fixture.checkpoints.indexOf(checkpoint)
        const safeName = `${loaded.file.replace(/\.json$/, "")}-${checkpointIndex}`

        await renderChatCheckpoint(page, loaded.fixture, checkpoint)
        const chatHarness = page.getByTestId("agent-runtime-ui-e2e-harness")
        const motionFeed = chatHarness.locator("[data-agent-motion-runtime-feed='true']")
        if (expectsMotionRuntimeFeed(checkpoint)) {
          await expect(motionFeed.first()).toBeVisible()
        } else {
          await expect(motionFeed).toHaveCount(0)
        }
        const chatShimmerCount = await chatHarness
          .locator("[data-text-shimmer='true']")
          .count()
        expect(chatShimmerCount, `${loaded.file}:${checkpoint.name}`)
          .toBe(checkpoint.shimmerCount)
        expect(chatShimmerCount, `${loaded.file}:${checkpoint.name}`).toBeLessThanOrEqual(1)
        expect(await chatHarness.innerText(), `${loaded.file}:${checkpoint.name}`)
          .not.toMatch(CHAT_RAW_RUNTIME_LEAK_PATTERN)
        await attachScreenshot(page, testInfo, `${safeName}-chat`)

        await renderCommentsCheckpoint(page, loaded.fixture, checkpoint)
        const commentsHarness = page.getByTestId("agent-runtime-comments-e2e-harness")
        const commentsShimmerCount = await commentsHarness
          .locator("[data-text-shimmer='true']")
          .count()
        expect(commentsShimmerCount, `${loaded.file}:${checkpoint.name}`)
          .toBeLessThanOrEqual(1)
        expect(await commentsHarness.innerText(), `${loaded.file}:${checkpoint.name}`)
          .not.toMatch(COMMENT_RAW_RUNTIME_LEAK_PATTERN)
        await attachScreenshot(page, testInfo, `${safeName}-comments`)
      }
    }
  })
})
