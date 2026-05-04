import { describe, expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import simpleGit from "simple-git"
import {
  commitAcceptedRevisionIfManaged,
  ensureRippleProjectGitRepository,
} from "./project-git"
import { ensureRippleProjectAgentNotes } from "./project-agent-notes"

const execFileAsync = promisify(execFile)

async function createMinimalRippleProject(prefix: string): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), prefix))
  await writeFile(join(projectPath, "index.html"), "<main>Ripple</main>", "utf8")
  await writeFile(join(projectPath, "hyperframes.json"), "{}", "utf8")
  return projectPath
}

async function configureTestGit(projectPath: string): Promise<void> {
  await execFileAsync("git", ["-C", projectPath, "config", "user.name", "Test"])
  await execFileAsync("git", [
    "-C",
    projectPath,
    "config",
    "user.email",
    "test@example.invalid",
  ])
}

describe("Ripple project Git setup", () => {
  test("initializes a managed Git baseline for a new Ripple project", async () => {
    const projectPath = await createMinimalRippleProject("ripple-project-git-")
    try {
      const result = await ensureRippleProjectGitRepository(projectPath)
      const git = simpleGit(projectPath)

      expect(result.projectPath).toBe(projectPath)
      expect(result.managed).toBe(true)
      expect(result.baseCommit).toMatch(/^[a-f0-9]{40}$/)
      expect(await git.checkIsRepo()).toBe(true)
      expect((await git.raw(["config", "--get", "ripple.revisionManaged"])).trim()).toBe("true")
      const gitignore = await readFile(join(projectPath, ".gitignore"), "utf8")
      expect(gitignore).toContain("exports/")
      expect(gitignore).toContain(".ripple/tmp/")
      expect(gitignore).toContain(".ripple/agent-attachments/")
      expect(gitignore).toContain(".ripple/frame-sheets/")
      expect(gitignore).toContain(".ripple/comment-visuals/")
      expect((await git.status()).isClean()).toBe(true)
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("refreshes the hidden baseline for managed project changes", async () => {
    const projectPath = await createMinimalRippleProject("ripple-project-git-")
    try {
      const first = await ensureRippleProjectGitRepository(projectPath)
      await writeFile(join(projectPath, "index.html"), "<main>Updated</main>", "utf8")
      const second = await ensureRippleProjectGitRepository(projectPath)

      expect(second.baseCommit).not.toBe(first.baseCommit)
      expect((await simpleGit(projectPath).status()).isClean()).toBe(true)
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("refreshes managed gitignore entries without replacing user rules", async () => {
    const projectPath = await createMinimalRippleProject("ripple-project-gitignore-")
    try {
      await writeFile(join(projectPath, ".gitignore"), "custom-output/\n", "utf8")

      await ensureRippleProjectGitRepository(projectPath)

      const gitignore = await readFile(join(projectPath, ".gitignore"), "utf8")
      expect(gitignore).toContain("custom-output/")
      expect(gitignore).toContain(".ripple/frame-sheets/")
      expect(gitignore).toContain(".ripple/comment-visuals/")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("includes explicitly added project notes in future revision worktrees", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-project-agent-baseline-"))
    const projectPath = join(root, "project")
    const worktreePath = join(root, "revision-worktree")
    try {
      await mkdir(projectPath, { recursive: true })
      await writeFile(join(projectPath, "index.html"), "<main>Ripple</main>", "utf8")
      await writeFile(join(projectPath, "hyperframes.json"), "{}", "utf8")
      await ensureRippleProjectAgentNotes(projectPath)

      await ensureRippleProjectGitRepository(projectPath)
      await execFileAsync("git", [
        "-C",
        projectPath,
        "worktree",
        "add",
        "--detach",
        worktreePath,
        "HEAD",
      ])

      await stat(join(worktreePath, "AGENTS.md"))
      await stat(join(worktreePath, "CLAUDE.md"))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("does not silently commit or modify dirty unmanaged repositories", async () => {
    const projectPath = await createMinimalRippleProject("ripple-project-user-repo-")
    try {
      await execFileAsync("git", ["-C", projectPath, "init", "-b", "main"])
      await configureTestGit(projectPath)
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Initial"])
      const initialCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()
      await writeFile(join(projectPath, "index.html"), "<main>User edit</main>", "utf8")

      const result = await ensureRippleProjectGitRepository(projectPath)

      expect(result.managed).toBe(false)
      expect(result.baseCommit).toBe(initialCommit)
      expect((await simpleGit(projectPath).status()).isClean()).toBe(false)
      await expect(readFile(join(projectPath, ".gitignore"), "utf8")).rejects.toThrow()
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("creates the managed baseline at the project root when nested in another repo", async () => {
    const parentPath = await mkdtemp(join(tmpdir(), "ripple-project-parent-"))
    const projectPath = join(parentPath, "motion-project")
    try {
      await execFileAsync("git", ["-C", parentPath, "init", "-b", "main"])
      await configureTestGit(parentPath)
      await writeFile(join(parentPath, "README.md"), "parent", "utf8")
      await execFileAsync("git", ["-C", parentPath, "add", "-A"])
      await execFileAsync("git", ["-C", parentPath, "commit", "-m", "Parent"])

      await mkdir(projectPath, { recursive: true })
      await writeFile(join(projectPath, "index.html"), "<main>Nested</main>", "utf8")
      await writeFile(join(projectPath, "hyperframes.json"), "{}", "utf8")

      const result = await ensureRippleProjectGitRepository(projectPath)
      const projectRoot = (await simpleGit(projectPath).revparse(["--show-toplevel"])).trim()

      expect(result.projectPath).toBe(projectPath)
      expect(result.managed).toBe(true)
      expect(await realpath(projectRoot)).toBe(await realpath(projectPath))
    } finally {
      await rm(parentPath, { recursive: true, force: true })
    }
  })

  test("commits accepted proposal changes only for managed repositories", async () => {
    const projectPath = await createMinimalRippleProject("ripple-project-accept-")
    try {
      const first = await ensureRippleProjectGitRepository(projectPath)
      await writeFile(join(projectPath, "index.html"), "<main>Accepted</main>", "utf8")

      const acceptedCommit = await commitAcceptedRevisionIfManaged({
        projectPath,
        message: "Accept test proposal",
      })

      expect(acceptedCommit).toMatch(/^[a-f0-9]{40}$/)
      expect(acceptedCommit).not.toBe(first.baseCommit)
      expect((await simpleGit(projectPath).status()).isClean()).toBe(true)
      expect(await readFile(join(projectPath, "index.html"), "utf8")).toContain("Accepted")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
