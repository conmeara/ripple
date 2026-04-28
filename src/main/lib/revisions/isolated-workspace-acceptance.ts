import { execFile } from "node:child_process"
import { cp, lstat, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"
import simpleGit from "simple-git"
import {
  commitWorktreeChanges,
  mergeWorktreeToMain,
} from "../git/worktree"
import { normalizeProjectRelativePath } from "../hyperframes/project-context"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import { commitAcceptedRevisionIfManaged } from "../ripple-projects/project-git"
import {
  buildRevisionAcceptPatch,
  buildRevisionProposalPatch,
} from "./revision-acceptance"

const execFileAsync = promisify(execFile)

interface PreparedUntrackedFileCopy {
  source: string
  destination: string
}

export interface PatchWorkspaceAcceptanceInput {
  strategy: "patch"
  projectPath: string
  workspacePath: string
  baseProjectCommit?: string | null
  commitMessage: string
}

export interface MergeWorkspaceAcceptanceInput {
  strategy: "merge"
  projectPath: string
  workspacePath: string
  branch: string
  baseBranch: string
  commitMessage: string
}

export type IsolatedWorkspaceAcceptanceInput =
  | PatchWorkspaceAcceptanceInput
  | MergeWorkspaceAcceptanceInput

export interface IsolatedWorkspaceAcceptanceResult {
  acceptedProjectCommit: string | null
  proposalPatch: string | null
  acceptedWorkspaceCommit?: string | null
}

const projectAcceptanceLocks = new Map<string, Promise<void>>()

async function withProjectAcceptanceLock<T>(
  projectPath: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = resolve(projectPath)
  const previous = projectAcceptanceLocks.get(key) ?? Promise.resolve()
  let releaseLock: () => void = () => undefined
  const gate = new Promise<void>((resolveLock) => {
    releaseLock = resolveLock
  })
  const current = previous.catch(() => undefined).then(() => gate)
  projectAcceptanceLocks.set(key, current)

  await previous.catch(() => undefined)

  try {
    return await work()
  } finally {
    releaseLock()
    if (projectAcceptanceLocks.get(key) === current) {
      projectAcceptanceLocks.delete(key)
    }
  }
}

async function prepareUntrackedFileCopies(input: {
  files: string[]
  sourceRoot: string
  destinationRoot: string
}): Promise<PreparedUntrackedFileCopy[]> {
  const copies: PreparedUntrackedFileCopy[] = []

  for (const file of input.files) {
    const normalized = normalizeProjectRelativePath(file)
    const source = resolve(input.sourceRoot, normalized)
    const destination = resolve(input.destinationRoot, normalized)

    if (
      !isPathInsideDirectory(input.sourceRoot, source) ||
      !isPathInsideDirectory(input.destinationRoot, destination)
    ) {
      throw new Error("Changes include a file outside the project.")
    }

    const linkInfo = await lstat(source)
    if (linkInfo.isSymbolicLink()) {
      throw new Error("Changes include a linked file that cannot be accepted.")
    }
    const sourceStat = await stat(source)
    if (!sourceStat.isFile()) continue

    const rel = relative(input.destinationRoot, destination)
    if (rel.startsWith("..") || rel.split(sep).includes("..")) {
      throw new Error("Changes include a destination outside the project.")
    }

    try {
      await lstat(destination)
      throw new Error("Changes include a new file that already exists in Main.")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }

    copies.push({ source, destination })
  }

  return copies
}

async function copyPreparedUntrackedFiles(
  copies: PreparedUntrackedFileCopy[],
  copiedDestinations: string[],
): Promise<void> {
  for (const copy of copies) {
    await mkdir(dirname(copy.destination), { recursive: true })
    await cp(copy.source, copy.destination, { force: false, errorOnExist: true })
    copiedDestinations.push(copy.destination)
  }
}

async function rollbackAcceptedWorkspaceFiles(input: {
  projectPath: string
  patchPath: string | null
  patchApplied: boolean
  copiedDestinations: string[]
}): Promise<void> {
  for (const destination of [...input.copiedDestinations].reverse()) {
    await rm(destination, { force: true }).catch(() => undefined)
  }

  if (!input.patchApplied || !input.patchPath) return
  try {
    await execFileAsync("git", [
      "-C",
      input.projectPath,
      "apply",
      "-R",
      "--binary",
      "--whitespace=nowarn",
      input.patchPath,
    ])
  } catch (error) {
    console.warn("[revisions] Could not roll back accepted workspace patch:", error)
  }
}

async function acceptWorkspaceWithPatch(
  input: PatchWorkspaceAcceptanceInput,
): Promise<IsolatedWorkspaceAcceptanceResult> {
  const projectPath = resolve(input.projectPath)
  const workspacePath = resolve(input.workspacePath)
  const projectGit = simpleGit(projectPath)
  const workspaceGit = simpleGit(workspacePath)

  const primaryStatus = await projectGit.status()
  if (!primaryStatus.isClean()) {
    throw new Error("Accept needs Main to have no pending changes.")
  }
  if (input.baseProjectCommit) {
    const currentCommit = (await projectGit.revparse(["HEAD"])).trim()
    if (currentCommit !== input.baseProjectCommit) {
      throw new Error(
        "These changes were created from an older project version. Review the latest project and request changes again.",
      )
    }
  }

  const workspaceStatus = await workspaceGit.status()
  const proposalPatch = await buildRevisionProposalPatch({
    revisionPath: workspacePath,
    baseProjectCommit: input.baseProjectCommit,
  })
  const patch = await buildRevisionAcceptPatch({
    revisionPath: workspacePath,
    baseProjectCommit: input.baseProjectCommit,
  })
  const untrackedFileCopies = await prepareUntrackedFileCopies({
    files: workspaceStatus.not_added,
    sourceRoot: workspacePath,
    destinationRoot: projectPath,
  })
  const tempDir = await mkdtemp(join(tmpdir(), "ripple-revision-"))
  let patchPath: string | null = null
  let patchApplied = false
  const copiedDestinations: string[] = []

  try {
    if (patch.trim()) {
      patchPath = join(tempDir, "proposal.patch")
      await writeFile(patchPath, patch, "utf8")
      await execFileAsync("git", [
        "-C",
        projectPath,
        "apply",
        "--binary",
        "--whitespace=nowarn",
        patchPath,
      ])
      patchApplied = true
    }

    await copyPreparedUntrackedFiles(untrackedFileCopies, copiedDestinations)
    await commitAcceptedRevisionIfManaged({
      projectPath,
      message: input.commitMessage,
    })
  } catch (error) {
    await rollbackAcceptedWorkspaceFiles({
      projectPath,
      patchPath,
      patchApplied,
      copiedDestinations,
    })
    throw error
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }

  const latestStatus = await projectGit.status()
  const acceptedProjectCommit = latestStatus.isClean()
    ? (await projectGit.revparse(["HEAD"])).trim()
    : null

  return {
    acceptedProjectCommit,
    proposalPatch,
  }
}

async function acceptWorkspaceWithMerge(
  input: MergeWorkspaceAcceptanceInput,
): Promise<IsolatedWorkspaceAcceptanceResult> {
  const projectPath = resolve(input.projectPath)
  const workspacePath = resolve(input.workspacePath)
  const projectGit = simpleGit(projectPath)
  const projectStatus = await projectGit.status()
  if (!projectStatus.isClean()) {
    throw new Error("Accept needs Main to have no pending changes.")
  }

  const workspaceGit = simpleGit(workspacePath)
  const workspaceStatus = await workspaceGit.status()
  let acceptedWorkspaceCommit: string | null = null
  if (!workspaceStatus.isClean()) {
    const commit = await commitWorktreeChanges(workspacePath, input.commitMessage)
    if (!commit.success) {
      throw new Error(commit.error || "Could not save worktree changes.")
    }
    acceptedWorkspaceCommit = commit.commitHash ?? null
  }

  const merge = await mergeWorktreeToMain(projectPath, input.branch, input.baseBranch)
  if (!merge.success) {
    throw new Error(merge.error || "Could not accept worktree changes.")
  }

  const latestStatus = await projectGit.status()
  const acceptedProjectCommit = latestStatus.isClean()
    ? (await projectGit.revparse(["HEAD"])).trim()
    : null

  return {
    acceptedProjectCommit,
    proposalPatch: null,
    acceptedWorkspaceCommit,
  }
}

export async function acceptIsolatedWorkspace(
  input: IsolatedWorkspaceAcceptanceInput,
): Promise<IsolatedWorkspaceAcceptanceResult> {
  const projectPath = resolve(input.projectPath)
  const workspacePath = resolve(input.workspacePath)
  if (workspacePath === projectPath) {
    throw new Error("The temporary workspace is not isolated from Main.")
  }

  return withProjectAcceptanceLock(projectPath, () => {
    if (input.strategy === "patch") {
      return acceptWorkspaceWithPatch({ ...input, projectPath, workspacePath })
    }

    return acceptWorkspaceWithMerge({ ...input, projectPath, workspacePath })
  })
}
