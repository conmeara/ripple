import { existsSync } from "node:fs"
import { execFile } from "node:child_process"
import { copyFile, cp, mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import type { ElectronApplication, Page } from "@playwright/test"
import {
  dismissFirstRun,
  expect,
  test,
  type RippleE2EContext,
} from "./helpers/ripple-electron"

const execFileAsync = promisify(execFile)

test.describe("Comments spec workflow", () => {
  test("T-E2E full frame-comment review workflow from note to accepted history @workflow @comments", async ({
    electronApp,
    page,
    e2e,
  }) => {
    await dismissFirstRun(page)

    const projectDir = await openBasicTitleCardProject({ electronApp, page, e2e })
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()

    await page
      .getByTestId("ripple-shell")
      .getByRole("button", { name: "Comments" })
      .click()
    await expect(page.getByTestId("ripple-comments-pane")).toBeVisible()
    await expect.poll(
      async () => countPreparedCommentVisualFiles(projectDir, "frame.png"),
      {
        message: "expected the comment composer to prepare the current frame before send",
        timeout: 20_000,
        intervals: [50, 100, 250],
      },
    ).toBeGreaterThan(0)

    const commentText = "Slow the fade transition; keep this frame as context."
    await page.getByTestId("ripple-comment-composer-input").fill(commentText)
    await page.getByRole("button", { name: "Send comment" }).click()

    const card = page
      .locator("[data-comment-card='true']")
      .filter({ hasText: commentText })
    await expect(card).toBeVisible({ timeout: 10_000 })

    await expect.poll(
      async () => countCommentVisualFiles(projectDir),
      {
        message: "expected visual context to attach without blocking the card",
        timeout: 45_000,
      },
    ).toBeGreaterThan(0)

    await expect(card.getByRole("button", { name: "View changes" })).toBeEnabled({
      timeout: 60_000,
    })
    await card.click()
    await expect(page.getByTestId("ripple-comments-pane").getByRole("button", {
      name: "View Main",
    })).toBeVisible()
    await expect(page.getByTestId("ripple-preview-player")).not.toContainText(
      /PROPOSED|MAIN/,
    )

    await card.getByRole("button", { name: "Comment actions" }).click()
    await page.getByRole("menuitem", { name: "Open in Chat" }).click()
    await expect(page.getByText(commentText).first()).toBeVisible()

    await page.getByTestId("ripple-shell").getByRole("button", { name: "Comments" }).click()
    await card.getByRole("button", { name: "Reply" }).click()
    await card.getByPlaceholder("Ask for a change...").fill("Better. Try 24 frames.")
    await card.getByRole("button", { name: "Send comment" }).click()
    await expect(card).toContainText("Better. Try 24 frames.")

    await expect(card.getByRole("button", { name: "Accept changes" })).toBeEnabled({
      timeout: 120_000,
    })
    await card.getByRole("button", { name: "Accept changes" }).click()
    await expect(card).toHaveCount(0)

    const commentsPane = page.getByTestId("ripple-comments-pane")
    await commentsPane.getByRole("button", { name: "Comments" }).click()
    await page.getByRole("menuitem", { name: "Accepted" }).click()
    const acceptedCard = commentsPane
      .locator("[data-comment-card='true']")
      .filter({ hasText: commentText })
    await expect(acceptedCard).toContainText("Accepted")
    await expect(acceptedCard.getByRole("button", { name: "Delete comment" })).toHaveCount(0)
    await expect(acceptedCard.getByRole("button", { name: "Reply" })).toHaveCount(0)

    await acceptedCard.getByRole("button", { name: "Comment actions" }).click()
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0)
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
  await initializeManagedGitProject(importedProjectPath)

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
  await expect(page.getByTestId("ripple-shell")).toBeVisible({ timeout: 45_000 })
  return importedProjectPath
}

async function initializeManagedGitProject(projectDir: string): Promise<void> {
  await execFileAsync("git", ["-C", projectDir, "init", "-b", "main"])
  await execFileAsync("git", ["-C", projectDir, "config", "user.name", "Ripple E2E"])
  await execFileAsync("git", [
    "-C",
    projectDir,
    "config",
    "user.email",
    "ripple-e2e@example.invalid",
  ])
  await execFileAsync("git", [
    "-C",
    projectDir,
    "config",
    "ripple.revisionManaged",
    "true",
  ])
  await execFileAsync("git", ["-C", projectDir, "add", "-A"])
  await execFileAsync("git", ["-C", projectDir, "commit", "-m", "Base"])
}

async function countCommentVisualFiles(projectDir: string): Promise<number> {
  const root = join(projectDir, ".ripple", "comment-visuals")
  if (!existsSync(root)) return 0
  return countFiles(root, /\.(png|jpg|jpeg|webp)$/i)
}

async function countPreparedCommentVisualFiles(
  projectDir: string,
  fileName: "frame.png" | "sheet.png",
): Promise<number> {
  const root = join(projectDir, ".ripple", "comment-visuals")
  if (!existsSync(root)) return 0
  let count = 0
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("prepared-")) continue
    if (existsSync(join(root, entry.name, fileName))) count += 1
  }
  return count
}

async function countFiles(root: string, pattern: RegExp): Promise<number> {
  let count = 0
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = join(root, entry.name)
    if (entry.isDirectory()) {
      count += await countFiles(child, pattern)
    } else if (pattern.test(entry.name)) {
      count += 1
    }
  }
  return count
}
