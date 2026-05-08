import { existsSync } from "node:fs"
import { execFile } from "node:child_process"
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import type { ElectronApplication, Page } from "@playwright/test"
import {
  createProjectFromEntry,
  dismissFirstRun,
  expect,
  expectProjectFile,
  test,
  type RippleE2EContext,
} from "./helpers/ripple-electron"

const execFileAsync = promisify(execFile)

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
    await page.bringToFront()
    await page.getByTestId("ripple-shell").click({ position: { x: 20, y: 20 } })
    await page.keyboard.press(assetsShortcut)
    await expect(assetsToggle).toHaveAttribute("aria-pressed", "false")
    await assetsToggle.click()
    await expect(assetsToggle).toHaveAttribute("aria-pressed", "true")

    await page.setViewportSize({ width: 980, height: 720 })
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    await expect(page.getByRole("button", { name: "Comments" })).toBeVisible()

    await page.getByTestId("ripple-shell").getByRole("button", { name: "Comments" }).click()
    await expect(page.getByTestId("ripple-comments-pane")).toBeVisible()
    await expect(page.getByTestId("ripple-comment-composer-input")).toBeVisible()

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

  test("reloads preview and switches compositions without losing timeline state @workflow", async ({
    electronApp,
    page,
    e2e,
  }) => {
    await dismissFirstRun(page)

    await openBasicTitleCardProject({ electronApp, page, e2e })
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()

    const timeline = page.getByRole("slider", { name: "Preview time" })
    const frameIndicator = page.getByTestId("ripple-preview-frame-indicator")
    await expect(timeline).toHaveAttribute("aria-valuemax", "1")

    await timeline.press("ArrowRight")
    await expect(frameIndicator).toHaveText("Frame 1 / 30")

    await page.getByRole("button", { name: "Preview settings" }).click()
    await page.getByRole("menuitem", { name: "Reload preview" }).click()
    await expect(frameIndicator).toHaveText("Frame 1 / 30", {
      timeout: 20_000,
    })

    const alternateRow = page.getByRole("button", {
      name: /compositions\/alternate\.html/,
    })
    await expect(alternateRow).toBeVisible()
    await alternateRow.click()
    await expect(alternateRow).toHaveAttribute("aria-current", "true", { timeout: 20_000 })
    await expect(timeline).toHaveAttribute("aria-valuemax", "2")
    await expect(frameIndicator).toHaveText("Frame 1 / 60")

    const mainRow = page.getByRole("button", { name: /index\.html/ })
    await mainRow.click()
    await expect(mainRow).toHaveAttribute("aria-current", "true", { timeout: 20_000 })
    await expect(timeline).toHaveAttribute("aria-valuemax", "1")
    await expect(frameIndicator).toHaveText("Frame 1 / 30")
  })

  test("accepts generated changes and rejects comments through review controls @workflow", async ({
    electronApp,
    page,
    e2e,
  }) => {
    await dismissFirstRun(page)

    const projectDir = await openBasicTitleCardProject({ electronApp, page, e2e })
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    const baseCommit = await initializeManagedGitProject(projectDir)
    const seeded = await seedGeneratedChangeReview({
      e2e,
      projectDir,
      baseCommit,
    })

    await page.reload()
    await expect(page.getByTestId("ripple-shell")).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId("ripple-shell-project-name")).toContainText(
      "Basic Title Card",
    )
    await page.getByTestId("ripple-shell").getByRole("button", { name: "Comments" }).click()
    await expect(page.getByTestId("ripple-comments-pane")).toBeVisible()

    const rejectCard = page
      .locator("[data-comment-card='true']")
      .filter({ hasText: seeded.reject.body })
    await expect(rejectCard).toBeVisible({ timeout: 30_000 })
    await expect(rejectCard.getByRole("button", { name: "Reject comment" })).toBeEnabled()
    await rejectCard.getByRole("button", { name: "Reject comment" }).click()
    await expect
      .poll(() => readRevisionStatus(seeded.dbPath, seeded.reject.revisionId), {
        message: "expected the rejected comment to discard generated changes",
        timeout: 30_000,
      })
      .toBe("rejected")
    await expect.poll(() => existsSync(seeded.reject.worktreePath)).toBe(false)

    const acceptCard = page
      .locator("[data-comment-card='true']")
      .filter({ hasText: seeded.accept.body })
    await expect(acceptCard).toBeVisible({ timeout: 30_000 })
    await expect(acceptCard.getByRole("button", { name: "Accept changes" })).toBeEnabled()
    await acceptCard.getByRole("button", { name: "Accept changes" }).click()
    await expect
      .poll(() => readRevisionStatus(seeded.dbPath, seeded.accept.revisionId), {
        message: "expected the accepted generated change to be persisted",
        timeout: 30_000,
      })
      .toBe("accepted")
    await expect.poll(
      async () => readFile(join(projectDir, "index.html"), "utf8"),
      {
        message: "expected accepting generated changes to update Main",
        timeout: 30_000,
      },
    ).toContain("Accepted Review Title")
  })

  test("creates, previews, comments, and exports with external network blocked @workflow", async ({
    electronApp,
    page,
    e2e,
  }) => {
    test.skip(
      !process.env.RIPPLE_E2E_PACKAGED_APP,
      "Packaged artifact required for offline export smoke.",
    )
    const network = await blockExternalNetwork(electronApp, e2e.logs)

    await dismissFirstRun(page)
    const projectName = `E2E Offline ${e2e.runId}`
    await createProjectFromEntry(page, projectName)
    const indexPath = await expectProjectFile(e2e, projectName, "index.html")
    const projectDir = dirname(indexPath)

    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    await expect(page.getByRole("slider", { name: "Preview time" })).toHaveAttribute(
      "aria-disabled",
      "false",
      { timeout: 45_000 },
    )

    await page
      .getByTestId("ripple-shell")
      .getByRole("button", { name: "Comments" })
      .click()
    const commentText = "Offline smoke comment on this frame."
    await page.getByTestId("ripple-comment-composer-input").fill(commentText)
    await page.getByRole("button", { name: "Send comment" }).click()
    await expect(
      page.locator("[data-comment-card='true']").filter({ hasText: commentText }),
    ).toBeVisible({ timeout: 30_000 })

    await page.getByTestId("ripple-renders-button").click()
    await expect(page.getByTestId("ripple-renders-pane")).toBeVisible()
    await page.getByTestId("ripple-export-button").click()
    await expect(page.getByText("Complete")).toBeVisible({ timeout: 120_000 })
    await expect
      .poll(() => countExportFiles(projectDir), {
        message: "expected a packaged offline MP4 export",
        timeout: 10_000,
      })
      .toBeGreaterThan(0)

    expect(network.externalRequests).toEqual([])
  })
})

async function blockExternalNetwork(
  electronApp: ElectronApplication,
  logs: string[],
): Promise<{ externalRequests: string[] }> {
  const externalRequests: string[] = []
  await electronApp.context().route("**/*", async (route) => {
    const url = route.request().url()
    if (isExternalHttpUrl(url)) {
      externalRequests.push(url)
      logs.push(`[network:block] ${url}`)
      await route.abort("blockedbyclient")
      return
    }
    await route.continue()
  })
  return { externalRequests }
}

function isExternalHttpUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
  const hostname = parsed.hostname.toLowerCase()
  return hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    hostname !== "::1" &&
    !hostname.endsWith(".localhost")
}

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

async function countExportFiles(projectDir: string): Promise<number> {
  const root = join(projectDir, "exports")
  if (!existsSync(root)) return 0
  return countFiles(root, /\.(mp4|mov|webm)$/i)
}

async function countImages(root: string): Promise<number> {
  return countFiles(root, /\.(png|jpg|jpeg|webp)$/i)
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

async function initializeManagedGitProject(projectDir: string): Promise<string> {
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
  const { stdout } = await execFileAsync("git", ["-C", projectDir, "rev-parse", "HEAD"])
  return stdout.trim()
}

type SeededGeneratedChange = {
  body: string
  branch: string
  revisionId: string
  worktreePath: string
}

async function seedGeneratedChangeReview({
  e2e,
  projectDir,
  baseCommit,
}: {
  e2e: RippleE2EContext
  projectDir: string
  baseCommit: string
}): Promise<{
  dbPath: string
  reject: SeededGeneratedChange
  accept: SeededGeneratedChange
}> {
  const dbPath = join(e2e.tempRoot, "userData", "data", "agents.db")
  const registered = await waitForRegisteredProject(dbPath, projectDir)
  const reject = await createRevisionWorktree({
    e2e,
    projectDir,
    baseCommit,
    label: "reject",
    title: "Rejected Review Title",
  })
  const accept = await createRevisionWorktree({
    e2e,
    projectDir,
    baseCommit,
    label: "accept",
    title: "Accepted Review Title",
  })

  await writeGeneratedChangeRows({
    dbPath,
    registered,
    baseCommit,
    changes: [
      {
        ...reject,
        body: "Reject this generated version.",
      },
      {
        ...accept,
        body: "Accept this generated title.",
      },
    ],
  })

  return {
    dbPath,
    reject: {
      body: "Reject this generated version.",
      branch: reject.branch,
      revisionId: reject.revisionId,
      worktreePath: reject.worktreePath,
    },
    accept: {
      body: "Accept this generated title.",
      branch: accept.branch,
      revisionId: accept.revisionId,
      worktreePath: accept.worktreePath,
    },
  }
}

async function createRevisionWorktree({
  e2e,
  projectDir,
  baseCommit,
  label,
  title,
}: {
  e2e: RippleE2EContext
  projectDir: string
  baseCommit: string
  label: string
  title: string
}): Promise<{ branch: string; revisionId: string; worktreePath: string }> {
  const revisionId = `e2e-revision-${label}-${e2e.runId}`
  const branch = `e2e-${label}-${e2e.runId}`
  const worktreePath = join(e2e.tempRoot, `worktree-${label}`)
  await execFileAsync("git", [
    "-C",
    projectDir,
    "worktree",
    "add",
    "-b",
    branch,
    worktreePath,
    baseCommit,
  ])
  const indexPath = join(worktreePath, "index.html")
  const html = await readFile(indexPath, "utf8")
  await writeFile(indexPath, html.replace("Ripple", title), "utf8")
  return { branch, revisionId, worktreePath }
}

type RegisteredProject = {
  projectId: string
  compositionId: string
}

async function waitForRegisteredProject(
  dbPath: string,
  projectDir: string,
): Promise<RegisteredProject> {
  await expect
    .poll(() => readRegisteredProject(dbPath, projectDir), {
      message: "expected imported project and composition to be registered",
      timeout: 30_000,
    })
    .not.toBeNull()

  const registered = await readRegisteredProject(dbPath, projectDir)
  if (!registered) throw new Error("Project was not registered in the E2E database")
  return registered
}

async function readRegisteredProject(
  dbPath: string,
  projectDir: string,
): Promise<RegisteredProject | null> {
  if (!existsSync(dbPath)) return null
  const stdout = await sqliteOutput(dbPath, `
    select p.id, c.id
    from projects p
    join compositions c on c.project_id = p.id
    where p.path = ${sqlString(projectDir)} or p.local_path = ${sqlString(projectDir)}
    order by c.created_at desc
    limit 1;
  `)
  const [projectId, compositionId] = lastSqliteLine(stdout).split("\t")
  return projectId && compositionId ? { projectId, compositionId } : null
}

async function writeGeneratedChangeRows(
  input: {
    dbPath: string
    registered: RegisteredProject
    baseCommit: string
    changes: Array<{
      body: string
      branch: string
      revisionId: string
      worktreePath: string
    }>
  },
): Promise<void> {
  const now = Date.now()
  const rows = input.changes.map((change, index) => {
    const threadId = `e2e-thread-${index}-${change.revisionId}`
    const messageId = `e2e-message-${index}-${change.revisionId}`
    const timestamp = now + index
    return `
      insert into comment_threads (
        id, project_id, composition_id, anchor_type, start_time_ms,
        start_frame, source_file, status, latest_revision_id, created_at, updated_at
      ) values (
        ${sqlString(threadId)},
        ${sqlString(input.registered.projectId)},
        ${sqlString(input.registered.compositionId)},
        'frame',
        0,
        0,
        'index.html',
        'open',
        ${sqlString(change.revisionId)},
        ${timestamp},
        ${timestamp}
      );
      insert into revisions (
        id, thread_id, project_id, composition_id, base_project_commit,
        context_path, branch, prompt, status, preview_context_key,
        diff_summary, created_at, updated_at
      ) values (
        ${sqlString(change.revisionId)},
        ${sqlString(threadId)},
        ${sqlString(input.registered.projectId)},
        ${sqlString(input.registered.compositionId)},
        ${sqlString(input.baseCommit)},
        ${sqlString(change.worktreePath)},
        ${sqlString(change.branch)},
        ${sqlString(change.body)},
        'proposed',
        ${sqlString(`revision-${change.revisionId}`)},
        ${sqlString(JSON.stringify({
          fileCount: 1,
          additions: 1,
          deletions: 1,
          files: ["index.html"],
        }))},
        ${timestamp},
        ${timestamp}
      );
      insert into comment_messages (
        id, thread_id, revision_id, role, body, created_at
      ) values (
        ${sqlString(messageId)},
        ${sqlString(threadId)},
        ${sqlString(change.revisionId)},
        'user',
        ${sqlString(change.body)},
        ${timestamp}
      );
    `
  }).join("\n")

  await sqliteExec(input.dbPath, `
    begin immediate;
    ${rows}
    commit;
  `)
}

async function readRevisionStatus(
  dbPath: string,
  revisionId: string,
): Promise<string | null> {
  if (!existsSync(dbPath)) return null
  const stdout = await sqliteOutput(
    dbPath,
    `select status from revisions where id = ${sqlString(revisionId)} limit 1;`,
  )
  return lastSqliteLine(stdout) || null
}

async function sqliteOutput(dbPath: string, sql: string): Promise<string> {
  const { stdout } = await execFileAsync("sqlite3", [
    "-batch",
    "-noheader",
    "-separator",
    "\t",
    "-cmd",
    ".timeout 5000",
    dbPath,
    sql,
  ])
  return stdout
}

async function sqliteExec(dbPath: string, sql: string): Promise<void> {
  await execFileAsync("sqlite3", [
    "-batch",
    "-cmd",
    ".timeout 5000",
    dbPath,
    sql,
  ])
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function lastSqliteLine(stdout: string): string {
  return stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? ""
}
