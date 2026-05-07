import { execFile } from "node:child_process"
import { readFile, realpath, stat, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import simpleGit from "simple-git"

const execFileAsync = promisify(execFile)

const RIPPLE_MANAGED_CONFIG_KEY = "ripple.revisionManaged"
const RIPPLE_GIT_AUTHOR_NAME = "Ripple"
const RIPPLE_GIT_AUTHOR_EMAIL = "ripple@local.invalid"

const DEFAULT_PROJECT_GITIGNORE_ENTRIES = [
  "# Ripple generated output",
  "exports/",
  "snapshots/",
  ".ripple/snapshots/",
  ".ripple/frame-sheets/",
  ".ripple/comment-visuals/",
  ".ripple/agent-visual-context/",
  ".ripple/tmp/",
  ".ripple/agent-attachments/",
  "node_modules/",
  ".DS_Store",
]

const DEFAULT_PROJECT_GITIGNORE = `${DEFAULT_PROJECT_GITIGNORE_ENTRIES.join("\n")}\n`

export interface RippleProjectGitBase {
  projectPath: string
  baseCommit: string
  managed: boolean
}

async function assertRippleProjectFiles(projectPath: string): Promise<void> {
  try {
    await Promise.all([
      stat(resolve(projectPath, "index.html")),
      stat(resolve(projectPath, "hyperframes.json")),
    ])
  } catch {
    throw new Error("This project is missing the files Ripple needs for project history.")
  }
}

async function isGitRepositoryAtProjectRoot(projectPath: string): Promise<boolean> {
  try {
    const root = await simpleGit(projectPath).revparse(["--show-toplevel"])
    const [rootRealPath, projectRealPath] = await Promise.all([
      realpath(root.trim()),
      realpath(projectPath),
    ])
    return rootRealPath === projectRealPath
  } catch {
    return false
  }
}

async function runGit(projectPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", projectPath, ...args], {
    timeout: 120_000,
  })
}

async function initManagedRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ["init", "-b", "main"])
  } catch {
    await runGit(projectPath, ["init"])
    await runGit(projectPath, ["checkout", "-B", "main"])
  }
}

async function configureManagedRepository(projectPath: string): Promise<void> {
  await runGit(projectPath, ["config", "user.name", RIPPLE_GIT_AUTHOR_NAME])
  await runGit(projectPath, ["config", "user.email", RIPPLE_GIT_AUTHOR_EMAIL])
  await runGit(projectPath, ["config", "commit.gpgsign", "false"])
  await runGit(projectPath, ["config", RIPPLE_MANAGED_CONFIG_KEY, "true"])
}

async function isManagedRepository(projectPath: string): Promise<boolean> {
  try {
    const value = await simpleGit(projectPath).raw([
      "config",
      "--local",
      "--get",
      RIPPLE_MANAGED_CONFIG_KEY,
    ])
    return value.trim() === "true"
  } catch {
    return false
  }
}

async function hasHeadCommit(projectPath: string): Promise<boolean> {
  try {
    await simpleGit(projectPath).revparse(["--verify", "HEAD"])
    return true
  } catch {
    return false
  }
}

async function ensureDefaultProjectGitIgnore(projectPath: string): Promise<void> {
  const gitignorePath = resolve(projectPath, ".gitignore")
  let content: string
  try {
    content = await readFile(gitignorePath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    await writeFile(gitignorePath, DEFAULT_PROJECT_GITIGNORE, { flag: "wx" })
    return
  }

  const missingEntries = DEFAULT_PROJECT_GITIGNORE_ENTRIES
    .filter((entry) => !content.split(/\r?\n/).includes(entry))
  if (missingEntries.length > 0) {
    const separator = content.endsWith("\n") || content.length === 0 ? "" : "\n"
    await writeFile(gitignorePath, `${content}${separator}${missingEntries.join("\n")}\n`)
  }
}

async function commitCurrentProjectState(input: {
  projectPath: string
  message: string
}): Promise<string> {
  const git = simpleGit(input.projectPath)
  await git.add(["-A"])
  const status = await git.status()
  if (!status.isClean()) {
    await git.commit(input.message)
  }
  return (await git.revparse(["HEAD"])).trim()
}

export async function ensureRippleProjectGitRepository(
  projectPath: string,
): Promise<RippleProjectGitBase> {
  const resolvedProjectPath = resolve(projectPath)
  await assertRippleProjectFiles(resolvedProjectPath)

  let managed = await isManagedRepository(resolvedProjectPath)

  if (!(await isGitRepositoryAtProjectRoot(resolvedProjectPath))) {
    await initManagedRepository(resolvedProjectPath)
    await configureManagedRepository(resolvedProjectPath)
    managed = true
  } else if (managed || !(await hasHeadCommit(resolvedProjectPath))) {
    await configureManagedRepository(resolvedProjectPath)
    managed = true
  }

  if (managed) {
    await ensureDefaultProjectGitIgnore(resolvedProjectPath)
  }

  const hasCommit = await hasHeadCommit(resolvedProjectPath)
  const git = simpleGit(resolvedProjectPath)
  const status = hasCommit ? await git.status() : null
  const shouldCreateBaseCommit = !hasCommit || (managed && status && !status.isClean())

  const baseCommit = shouldCreateBaseCommit
    ? await commitCurrentProjectState({
        projectPath: resolvedProjectPath,
        message: hasCommit
          ? "Update Ripple project baseline"
          : "Prepare Ripple project history",
      })
    : (await git.revparse(["HEAD"])).trim()

  return {
    projectPath: resolvedProjectPath,
    baseCommit,
    managed,
  }
}

export async function commitAcceptedRevisionIfManaged(input: {
  projectPath: string
  message: string
}): Promise<string | null> {
  const resolvedProjectPath = resolve(input.projectPath)
  if (!(await isManagedRepository(resolvedProjectPath))) {
    return null
  }

  const git = simpleGit(resolvedProjectPath)
  const status = await git.status()
  if (status.isClean()) {
    return (await git.revparse(["HEAD"])).trim()
  }

  await configureManagedRepository(resolvedProjectPath)
  return commitCurrentProjectState({
    projectPath: resolvedProjectPath,
    message: input.message,
  })
}
