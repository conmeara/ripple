import { existsSync } from "node:fs"
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"

const require = createRequire(import.meta.url)

export const REQUIRED_HYPERFRAMES_SKILL_NAMES = [
  "hyperframes",
  "hyperframes-cli",
  "hyperframes-media",
] as const

export type HyperframesSkillName = string
export type RippleSkillProvider = "claude" | "codex"
export type HyperframesSkillStatus =
  | "created"
  | "present"
  | "user-modified"
  | "missing-source"
  | "app-managed"

export interface HyperframesSkillInstallStatus {
  provider: RippleSkillProvider
  name: HyperframesSkillName
  sourcePath: string
  targetPath: string
  status: HyperframesSkillStatus
}

export interface HyperframesSkillInstallResult {
  skills: HyperframesSkillInstallStatus[]
}

export function normalizePackagedHyperframesPath(path: string): string {
  return path.replace(/(^|[/\\])app\.asar(?=([/\\]|$))/, "$1app.asar.unpacked")
}

function getHyperframesPackageRoot(): string {
  return normalizePackagedHyperframesPath(dirname(require.resolve("hyperframes/package.json")))
}

export function getBundledHyperframesSkillsRoot(): string {
  return join(getHyperframesPackageRoot(), "dist", "skills")
}

function getAppManagedResourcePath(...segments: string[]): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === "string") {
    const packagedRoot = join(resourcesPath, ...segments)
    if (existsSync(packagedRoot)) return packagedRoot
  }
  return join(process.cwd(), "resources", ...segments)
}

export function getOfficialHyperframesPluginRoot(): string {
  return getAppManagedResourcePath("hyperframes-official")
}

export function getOfficialHyperframesSkillsRoot(): string {
  return join(getOfficialHyperframesPluginRoot(), "skills")
}

export function getAppManagedHyperframesSkillRoots(
  _provider?: RippleSkillProvider,
): string[] {
  const officialRoot = getOfficialHyperframesSkillsRoot()
  if (existsSync(officialRoot)) return [officialRoot]

  const packageRoot = getBundledHyperframesSkillsRoot()
  if (existsSync(packageRoot)) return [packageRoot]

  return [officialRoot, packageRoot]
}

export function getAppManagedHyperframesSkillRoot(
  provider?: RippleSkillProvider,
): string {
  return getAppManagedHyperframesSkillRoots(provider)[0] ?? getBundledHyperframesSkillsRoot()
}

export function getClaudeHyperframesPluginRoot(): string {
  return join(getHyperframesPackageRoot(), "dist")
}

export function getClaudeHyperframesPluginRoots(): string[] {
  const officialRoot = getOfficialHyperframesPluginRoot()
  if (existsSync(join(officialRoot, "skills"))) return [officialRoot]

  const packageRoot = getClaudeHyperframesPluginRoot()
  if (existsSync(join(packageRoot, "skills"))) return [packageRoot]

  return [officialRoot, packageRoot]
}

export function getProviderProjectSkillRoot(
  projectPath: string,
  provider: RippleSkillProvider,
): string {
  return provider === "claude"
    ? join(projectPath, ".claude", "skills")
    : join(projectPath, ".agents", "skills")
}

export const getProviderSkillRoot = getProviderProjectSkillRoot

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function readFileIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

async function listRelativeFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
      continue
    }
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(root, relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
  return files
}

async function listSkillNamesInRoot(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const names: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
      continue
    }
    if (await pathExists(join(root, entry.name, "SKILL.md"))) {
      names.push(entry.name)
    }
  }
  return names
}

export async function listBundledHyperframesSkillNames(input?: {
  provider?: RippleSkillProvider
}): Promise<HyperframesSkillName[]> {
  const names = new Set<string>()
  for (const root of getAppManagedHyperframesSkillRoots(input?.provider)) {
    for (const name of await listSkillNamesInRoot(root)) {
      names.add(name)
    }
  }
  return Array.from(names).sort()
}

async function resolveBundledHyperframesSkillPath(input: {
  name: HyperframesSkillName
  provider?: RippleSkillProvider
}): Promise<string> {
  for (const root of getAppManagedHyperframesSkillRoots(input.provider)) {
    const sourcePath = join(root, input.name)
    if (await pathExists(join(sourcePath, "SKILL.md"))) {
      return sourcePath
    }
  }
  return join(getAppManagedHyperframesSkillRoot(input.provider), input.name)
}

async function copyMissingOrIdenticalFiles(input: {
  sourceDir: string
  targetDir: string
}): Promise<"present" | "created" | "user-modified"> {
  const sourceFiles = await listRelativeFiles(input.sourceDir)
  let created = false

  for (const relativePath of sourceFiles) {
    const sourcePath = join(input.sourceDir, relativePath)
    const targetPath = join(input.targetDir, relativePath)
    const sourceContent = await readFile(sourcePath)
    const targetContent = await readFileIfExists(targetPath)

    if (targetContent) {
      if (!targetContent.equals(sourceContent)) {
        return "user-modified"
      }
      continue
    }

    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, sourceContent, { flag: "wx" })
    created = true
  }

  return created ? "created" : "present"
}

function resolveSymlinkTarget(input: {
  linkPath: string
  targetPath: string
}): string {
  if (input.targetPath.startsWith("/")) return input.targetPath
  return resolve(dirname(input.linkPath), input.targetPath)
}

async function linkOrCopySkill(input: {
  sourceDir: string
  targetDir: string
}): Promise<"created" | "present"> {
  await mkdir(dirname(input.targetDir), { recursive: true })
  try {
    await symlink(
      input.sourceDir,
      input.targetDir,
      process.platform === "win32" ? "junction" : "dir",
    )
    return "created"
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "EPERM" && code !== "EACCES" && code !== "ENOTSUP") {
      throw error
    }
  }

  await mkdir(input.targetDir, { recursive: true })
  await copyMissingOrIdenticalFiles(input)
  return "created"
}

export async function ensureProjectSkillFromSource(input: {
  projectPath: string
  provider: RippleSkillProvider
  name: HyperframesSkillName
  sourcePath: string
}): Promise<HyperframesSkillInstallStatus> {
  const targetPath = join(getProviderProjectSkillRoot(input.projectPath, input.provider), input.name)

  if (!(await pathExists(join(input.sourcePath, "SKILL.md")))) {
    return {
      provider: input.provider,
      name: input.name,
      sourcePath: input.sourcePath,
      targetPath,
      status: "missing-source",
    }
  }

  try {
    const existing = await lstat(targetPath)
    if (existing.isSymbolicLink()) {
      const linkTarget = resolveSymlinkTarget({
        linkPath: targetPath,
        targetPath: await readlink(targetPath),
      })
      if (linkTarget === input.sourcePath) {
        return {
          provider: input.provider,
          name: input.name,
          sourcePath: input.sourcePath,
          targetPath,
          status: "present",
        }
      }
      await unlink(targetPath)
      return {
        provider: input.provider,
        name: input.name,
        sourcePath: input.sourcePath,
        targetPath,
        status: await linkOrCopySkill({ sourceDir: input.sourcePath, targetDir: targetPath }),
      }
    }

    return {
      provider: input.provider,
      name: input.name,
      sourcePath: input.sourcePath,
      targetPath,
      status: await copyMissingOrIdenticalFiles({
        sourceDir: input.sourcePath,
        targetDir: targetPath,
      }),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  return {
    provider: input.provider,
    name: input.name,
    sourcePath: input.sourcePath,
    targetPath,
    status: await linkOrCopySkill({ sourceDir: input.sourcePath, targetDir: targetPath }),
  }
}

async function ensureProviderSkill(input: {
  projectPath: string
  provider: RippleSkillProvider
  name: HyperframesSkillName
}): Promise<HyperframesSkillInstallStatus> {
  const sourcePath = await resolveBundledHyperframesSkillPath(input)
  return ensureProjectSkillFromSource({ ...input, sourcePath })
}

export async function ensureProjectHyperframesSkills(input: {
  projectPath: string
  providers?: RippleSkillProvider[]
}): Promise<HyperframesSkillInstallResult> {
  const providers = input.providers ?? ["claude", "codex"]
  const skills: HyperframesSkillInstallStatus[] = []

  for (const provider of providers) {
    for (const name of await listBundledHyperframesSkillNames({ provider })) {
      skills.push(await ensureProviderSkill({
        projectPath: input.projectPath,
        provider,
        name,
      }))
    }
  }

  return { skills }
}

export async function checkAppManagedHyperframesSkills(input?: {
  providers?: RippleSkillProvider[]
}): Promise<HyperframesSkillInstallResult> {
  const providers = input?.providers ?? ["claude", "codex"]
  const skills: HyperframesSkillInstallStatus[] = []

  for (const provider of providers) {
    for (const name of await listBundledHyperframesSkillNames({ provider })) {
      const sourcePath = await resolveBundledHyperframesSkillPath({ provider, name })
      skills.push({
        provider,
        name,
        sourcePath,
        targetPath: sourcePath,
        status: await pathExists(join(sourcePath, "SKILL.md"))
          ? "app-managed"
          : "missing-source",
      })
    }
  }

  return { skills }
}
