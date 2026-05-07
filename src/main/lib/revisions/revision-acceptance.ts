import { execFile } from "node:child_process"
import { cp, lstat, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { devNull, tmpdir } from "node:os"
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"
import simpleGit from "simple-git"

const execFileAsync = promisify(execFile)

export interface RevisionProjectPathInput {
  path: string
  localPath?: string | null
}

interface BackedUpUntrackedFile {
  backupPath: string
  relativePath: string
}

const GENERATED_VISUAL_DIFF_PREFIXES = [
  ".ripple/frame-sheets/",
  ".ripple/comment-visuals/",
  ".ripple/agent-visual-context/",
  ".ripple/tmp/",
  ".ripple/agent-attachments/",
  ".ripple/snapshots/",
  "snapshots/",
]

const GENERATED_VISUAL_DIFF_PATHSPECS = [
  ".",
  ...GENERATED_VISUAL_DIFF_PREFIXES.map((prefix) => `:(exclude)${prefix}**`),
]

export interface RefreshRevisionProposalResult {
  currentCommit: string
  refreshed: boolean
  summaryPatch: string
  error?: string
}

export function resolveRevisionProjectPath(project: RevisionProjectPathInput): string {
  return resolve(project.localPath || project.path)
}

export async function buildRevisionAcceptPatch(input: {
  revisionPath: string
  baseProjectCommit?: string | null
}): Promise<string> {
  const git = simpleGit(input.revisionPath)
  const base = input.baseProjectCommit?.trim()
  return git.diff([
    "--binary",
    base || "HEAD",
    "--",
    ...GENERATED_VISUAL_DIFF_PATHSPECS,
  ])
}

async function buildUntrackedFileDiff(input: {
  git: ReturnType<typeof simpleGit>
  filePath: string
}): Promise<string> {
  try {
    return await input.git.raw([
      "diff",
      "--binary",
      "--no-color",
      "--no-index",
      devNull,
      input.filePath,
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const diffStart = message.indexOf("diff --git")
    return diffStart === -1 ? "" : message.slice(diffStart)
  }
}

function isGeneratedVisualDiffPath(filePath: string): boolean {
  const normalized = normalizeRelativeProjectPath(filePath)
  return GENERATED_VISUAL_DIFF_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export async function buildRevisionProposalPatch(input: {
  revisionPath: string
  baseProjectCommit?: string | null
}): Promise<string> {
  const git = simpleGit(input.revisionPath)
  const [trackedDiff, status] = await Promise.all([
    buildRevisionAcceptPatch(input),
    git.status(),
  ])
  const untrackedDiffs = await Promise.all(
    status.not_added.filter((filePath) => !isGeneratedVisualDiffPath(filePath)).map((filePath) =>
      buildUntrackedFileDiff({ git, filePath }),
    ),
  )

  return [trackedDiff, ...untrackedDiffs].filter(Boolean).join("\n")
}

function normalizeRelativeProjectPath(filePath: string): string {
  const normalized = normalize(filePath).replace(/\\/g, "/")
  if (
    !normalized ||
    isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("Changes include a file outside the project.")
  }
  return normalized
}

function assertPathInsideDirectory(root: string, candidate: string): void {
  const relativePath = relative(root, candidate)
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    relativePath.split(sep).includes("..") ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Changes include a file outside the project.")
  }
}

async function runGit(projectPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", projectPath, ...args], {
    timeout: 120_000,
  })
}

async function applyPatch(input: {
  root: string
  scratchDir: string
  patch: string
  name: string
}): Promise<void> {
  if (!input.patch.trim()) return
  const patchPath = join(input.scratchDir, input.name)
  await writeFile(patchPath, input.patch, "utf8")
  await runGit(input.root, [
    "apply",
    "--3way",
    "--binary",
    "--whitespace=nowarn",
    patchPath,
  ])
}

async function backupUntrackedFiles(input: {
  files: string[]
  sourceRoot: string
  backupRoot: string
}): Promise<BackedUpUntrackedFile[]> {
  const backups: BackedUpUntrackedFile[] = []
  for (const file of input.files) {
    const relativePath = normalizeRelativeProjectPath(file)
    const source = resolve(input.sourceRoot, relativePath)
    assertPathInsideDirectory(input.sourceRoot, source)

    const linkInfo = await lstat(source)
    if (linkInfo.isSymbolicLink()) {
      throw new Error("Changes include a linked file that cannot be updated.")
    }
    const sourceStat = await stat(source)
    if (!sourceStat.isFile()) continue

    const backupPath = resolve(input.backupRoot, relativePath)
    assertPathInsideDirectory(input.backupRoot, backupPath)
    await mkdir(dirname(backupPath), { recursive: true })
    await cp(source, backupPath, { force: false, errorOnExist: true })
    backups.push({ backupPath, relativePath })
  }
  return backups
}

async function copyBackedUpUntrackedFiles(input: {
  backups: BackedUpUntrackedFile[]
  destinationRoot: string
}): Promise<void> {
  for (const backup of input.backups) {
    const destination = resolve(input.destinationRoot, backup.relativePath)
    assertPathInsideDirectory(input.destinationRoot, destination)
    try {
      await lstat(destination)
      throw new Error("Changes include a new file that already exists in Main.")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    await mkdir(dirname(destination), { recursive: true })
    await cp(backup.backupPath, destination, {
      force: false,
      errorOnExist: true,
    })
  }
}

async function cloneProjectAtCommit(input: {
  projectPath: string
  destinationPath: string
  commit: string
}): Promise<void> {
  await execFileAsync("git", [
    "clone",
    "--no-hardlinks",
    "--quiet",
    input.projectPath,
    input.destinationPath,
  ], { timeout: 120_000 })
  await runGit(input.destinationPath, ["checkout", "--detach", input.commit])
}

export async function resetRevisionWorktreeToCommit(input: {
  revisionPath: string
  commit: string
}): Promise<void> {
  await runGit(input.revisionPath, ["reset", "--hard", input.commit])
  await runGit(input.revisionPath, ["clean", "-fd"])
}

export async function refreshRevisionProposalFromLatest(input: {
  projectPath: string
  revisionPath: string
  baseProjectCommit?: string | null
}): Promise<RefreshRevisionProposalResult> {
  const projectPath = resolve(input.projectPath)
  const revisionPath = resolve(input.revisionPath)
  const currentCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()
  const baseCommit = input.baseProjectCommit?.trim()
  const summaryPatchBefore = await buildRevisionProposalPatch({
    revisionPath,
    baseProjectCommit: baseCommit,
  })

  if (!baseCommit || baseCommit === currentCommit) {
    return {
      currentCommit,
      refreshed: true,
      summaryPatch: summaryPatchBefore,
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), "ripple-revision-refresh-"))
  try {
    const revisionGit = simpleGit(revisionPath)
    const revisionStatus = await revisionGit.status()
    const trackedPatch = await buildRevisionAcceptPatch({
      revisionPath,
      baseProjectCommit: baseCommit,
    })
    const backups = await backupUntrackedFiles({
      files: revisionStatus.not_added,
      sourceRoot: revisionPath,
      backupRoot: join(tempDir, "untracked"),
    })
    const testProjectPath = join(tempDir, "latest")

    await cloneProjectAtCommit({
      projectPath,
      destinationPath: testProjectPath,
      commit: currentCommit,
    })
    await applyPatch({
      root: testProjectPath,
      scratchDir: tempDir,
      patch: trackedPatch,
      name: "test.patch",
    })
    await copyBackedUpUntrackedFiles({
      backups,
      destinationRoot: testProjectPath,
    })

    await resetRevisionWorktreeToCommit({ revisionPath, commit: currentCommit })
    await applyPatch({
      root: revisionPath,
      scratchDir: tempDir,
      patch: trackedPatch,
      name: "revision.patch",
    })
    await copyBackedUpUntrackedFiles({
      backups,
      destinationRoot: revisionPath,
    })

    return {
      currentCommit,
      refreshed: true,
      summaryPatch: await buildRevisionProposalPatch({
        revisionPath,
        baseProjectCommit: currentCommit,
      }),
    }
  } catch (error) {
    return {
      currentCommit,
      refreshed: false,
      summaryPatch: summaryPatchBefore,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
