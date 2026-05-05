import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from "@playwright/test"
import electronPath from "electron"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

export type RippleE2EContext = {
  repoRoot: string
  runId: string
  tempRoot: string
  homeDir: string
  logs: string[]
}

type RippleFixtures = {
  e2e: RippleE2EContext
  electronApp: ElectronApplication
  page: Page
}

const attachedPages = new WeakSet<Page>()

export { expect }

export const test = base.extend<RippleFixtures>({
  e2e: async ({}, use, testInfo) => {
    const repoRoot = resolve(process.cwd())
    const runId = createRunId(testInfo)
    const tempRoot = join(tmpdir(), `ripple-e2e-${runId}`)
    const homeDir = join(tempRoot, "home")
    await mkdir(homeDir, { recursive: true })

    const context: RippleE2EContext = {
      repoRoot,
      runId,
      tempRoot,
      homeDir,
      logs: [],
    }

    await use(context)

    const shouldKeep =
      process.env.RIPPLE_E2E_KEEP_ARTIFACTS === "1" ||
      testInfo.status !== testInfo.expectedStatus
    if (!shouldKeep) {
      await rm(tempRoot, { recursive: true, force: true })
    } else {
      await testInfo.attach("temp-home", {
        body: homeDir,
        contentType: "text/plain",
      })
    }
  },

  electronApp: async ({ e2e }, use, testInfo) => {
    const appMain = join(e2e.repoRoot, "out/main/index.js")
    if (!existsSync(appMain)) {
      throw new Error(
        `Missing built Electron main entry at ${appMain}. Run bun run build before Playwright tests.`,
      )
    }

    const app = await electron.launch({
      executablePath: String(electronPath),
      args: [appMain],
      cwd: e2e.repoRoot,
      env: {
        ...process.env,
        HOME: e2e.homeDir,
        XDG_CONFIG_HOME: join(e2e.homeDir, ".config"),
        XDG_CACHE_HOME: join(e2e.homeDir, ".cache"),
        XDG_DATA_HOME: join(e2e.homeDir, ".local", "share"),
        ELECTRON_RENDERER_URL: "",
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        RIPPLE_E2E: "1",
        RIPPLE_E2E_HOME_DIR: e2e.homeDir,
        RIPPLE_E2E_USER_DATA_DIR: join(e2e.tempRoot, "userData"),
      },
    })

    const child = app.process()
    child.stdout?.on("data", (chunk) => {
      e2e.logs.push(`[main:stdout] ${String(chunk).trimEnd()}`)
    })
    child.stderr?.on("data", (chunk) => {
      e2e.logs.push(`[main:stderr] ${String(chunk).trimEnd()}`)
    })

    let tracingStarted = false
    try {
      await app.context().tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      })
      tracingStarted = true
    } catch (error) {
      e2e.logs.push(`[trace] ${formatError(error)}`)
    }

    app.on("window", (window) => attachPageLogging(window, e2e.logs))

    try {
      await use(app)
    } finally {
      const failed = testInfo.status !== testInfo.expectedStatus
      try {
        if (tracingStarted) {
          await app.context().tracing.stop({
            path: failed || process.env.RIPPLE_E2E_TRACE === "always"
              ? testInfo.outputPath("trace.zip")
              : undefined,
          })
        }
      } catch (error) {
        e2e.logs.push(`[trace:stop] ${formatError(error)}`)
      }

      await writeFile(
        testInfo.outputPath("electron.log"),
        `${e2e.logs.join("\n")}\n`,
        "utf8",
      )

      try {
        await app.close()
      } catch (error) {
        e2e.logs.push(`[electron:close] ${formatError(error)}`)
        try {
          child.kill()
        } catch {
          // The process may already be gone.
        }
      }
    }
  },

  page: async ({ electronApp, e2e }, use, testInfo) => {
    const page = await electronApp.firstWindow({ timeout: 45_000 })
    attachPageLogging(page, e2e.logs)
    await page.setViewportSize({ width: 1400, height: 900 })

    try {
      await use(page)
    } finally {
      const shouldScreenshot =
        testInfo.status !== testInfo.expectedStatus ||
        process.env.RIPPLE_E2E_SCREENSHOT === "always"
      if (shouldScreenshot) {
        await page.screenshot({
          path: testInfo.outputPath("final-screen.png"),
          fullPage: true,
        }).catch((error) => {
          e2e.logs.push(`[screenshot] ${formatError(error)}`)
        })
      }
    }
  },
})

export async function dismissFirstRun(page: Page): Promise<void> {
  await expect(page.getByTestId("ripple-project-entry")).toBeVisible({ timeout: 45_000 })

  const skipButton = page.getByTestId("ripple-first-run-skip")
  if (await skipButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await page.getByTestId("ripple-first-run-skip").click()
    await expect(skipButton).toBeHidden({ timeout: 20_000 })
    await expect(page.getByTestId("ripple-alert-dialog-overlay")).toHaveCount(0, {
      timeout: 20_000,
    })
  }
}

export async function createProjectFromEntry(page: Page, name: string): Promise<void> {
  await page.getByTestId("ripple-project-name-input").fill(name)
  await page.getByTestId("ripple-create-project-button").click()
  await expect(page.getByTestId("ripple-shell")).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId("ripple-shell-project-name")).toContainText(name)
}

export async function expectProjectFile(
  e2e: RippleE2EContext,
  projectName: string,
  relativePath: string,
): Promise<string> {
  await expect.poll(
    () => {
      const projectDir = findProjectDir(e2e.homeDir, projectName)
      if (!projectDir) return false
      return existsSync(join(projectDir, relativePath))
    },
    {
      message: `expected ${relativePath} to exist for ${projectName}`,
      timeout: 20_000,
    },
  ).toBe(true)

  const projectDir = findProjectDir(e2e.homeDir, projectName)
  if (!projectDir) {
    throw new Error(`Could not find project directory for ${projectName}`)
  }
  return join(projectDir, relativePath)
}

export async function readProjectFile(
  e2e: RippleE2EContext,
  projectName: string,
  relativePath: string,
): Promise<string> {
  const filePath = await expectProjectFile(e2e, projectName, relativePath)
  return readFileSync(filePath, "utf8")
}

export function projectSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (!slug) return "project"
  return slug
}

function createRunId(testInfo: TestInfo): string {
  const titleSlug = testInfo.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
  return `${process.pid}-${testInfo.workerIndex}-${Date.now().toString(36)}-${titleSlug}`
}

function findProjectDir(homeDir: string, projectName: string): string | null {
  const rippleRoot = join(homeDir, "Ripple")
  if (!existsSync(rippleRoot)) return null

  const slug = projectSlug(projectName)
  const direct = join(rippleRoot, slug)
  if (existsSync(direct)) return direct

  for (const entry of readdirSync(rippleRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(slug)) {
      return join(rippleRoot, entry.name)
    }
  }

  return null
}

function attachPageLogging(page: Page, logs: string[]): void {
  if (attachedPages.has(page)) return
  attachedPages.add(page)

  page.on("console", (message) => {
    logs.push(`[renderer:${message.type()}] ${message.text()}`)
  })
  page.on("pageerror", (error) => {
    logs.push(`[renderer:pageerror] ${formatError(error)}`)
  })
  page.on("requestfailed", (request) => {
    logs.push(
      `[renderer:requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
    )
  })
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message
  }
  return String(error)
}
