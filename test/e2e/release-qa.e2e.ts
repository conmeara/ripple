import { existsSync } from "node:fs"
import { copyFile, cp, mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { ElectronApplication, Page } from "@playwright/test"
import {
  dismissFirstRun,
  expect,
  test,
  type RippleE2EContext,
} from "./helpers/ripple-electron"

test.describe("Ripple release QA workflows", () => {
  test("opens an existing HyperFrames project through the trusted project dialog @workflow", async ({
    electronApp,
    page,
    e2e,
  }) => {
    await dismissFirstRun(page)

    await openBasicTitleCardProject({ electronApp, page, e2e })
    await expect(page.getByTestId("ripple-shell")).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId("ripple-shell-project-name")).toContainText(
      "Basic Title Card",
    )
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    await expect(page.getByText(/repo|repository|clone/i)).toHaveCount(0)
  })

  test("captures visual context for a frame comment and keeps the shell usable after resize and shortcuts @workflow", async ({
    electronApp,
    page,
    e2e,
  }) => {
    await dismissFirstRun(page)

    const projectDir = await openBasicTitleCardProject({ electronApp, page, e2e })
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()

    const assetsToggle = page.getByRole("button", { name: "Toggle assets" })
    await expect(assetsToggle).toHaveAttribute("aria-pressed", "true")
    const assetsShortcut = process.platform === "darwin"
      ? "Meta+Shift+A"
      : "Control+Shift+A"
    await page.keyboard.press(assetsShortcut)
    await expect(assetsToggle).toHaveAttribute("aria-pressed", "false")
    await page.keyboard.press(assetsShortcut)
    await expect(assetsToggle).toHaveAttribute("aria-pressed", "true")

    await page.setViewportSize({ width: 980, height: 720 })
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    await expect(page.getByRole("button", { name: "Comments" })).toBeVisible()

    await page.getByRole("button", { name: "Comments" }).click()
    await expect(page.getByTestId("ripple-comments-pane")).toBeVisible()
    await expect(page.getByText("Current frame")).toBeVisible()

    const commentText = "Use this frame as the visual reference."
    await page.getByTestId("ripple-comment-composer-input").fill(commentText)
    await page.getByRole("button", { name: "Send comment" }).click()
    await expect(
      page.locator("[data-comment-card='true']").filter({ hasText: commentText }),
    ).toBeVisible({ timeout: 30_000 })

    await expect.poll(
      async () => countCommentVisualFiles(projectDir),
      {
        message: "expected a stored comment visual frame",
        timeout: 45_000,
      },
    ).toBeGreaterThan(0)
  })
})

async function openBasicTitleCardProject({
  electronApp,
  page,
  e2e,
}: {
  electronApp: ElectronApplication
  page: Page
  e2e: RippleE2EContext
}): Promise<string> {
  const importedProjectPath = join(e2e.tempRoot, "external-basic-title-card")
  await cp(
    join(e2e.repoRoot, "test", "fixtures", "hyperframes", "basic-title-card"),
    importedProjectPath,
    { recursive: true },
  )
  await mkdir(join(importedProjectPath, "assets", "vendor"), { recursive: true })
  await copyFile(
    join(e2e.repoRoot, "node_modules", "gsap", "dist", "gsap.min.js"),
    join(importedProjectPath, "assets", "vendor", "gsap.min.js"),
  )

  await electronApp.evaluate(
    ({ dialog }, projectPath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [projectPath],
      })
    },
    importedProjectPath,
  )

  await page.getByTestId("ripple-open-project-button").click()
  return importedProjectPath
}

async function countCommentVisualFiles(projectDir: string): Promise<number> {
  const root = join(projectDir, ".ripple", "comment-visuals")
  if (!existsSync(root)) return 0
  return countImages(root)
}

async function countImages(root: string): Promise<number> {
  let count = 0
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = join(root, entry.name)
    if (entry.isDirectory()) {
      count += await countImages(child)
    } else if (/\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
      count += 1
    }
  }
  return count
}
