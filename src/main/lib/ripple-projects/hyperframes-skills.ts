import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)

export const HYPERFRAMES_SKILL_NAMES = [
  "hyperframes",
  "hyperframes-cli",
  "gsap",
] as const

export type HyperframesSkillName = (typeof HYPERFRAMES_SKILL_NAMES)[number]
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
  return path.replace("app.asar", "app.asar.unpacked")
}

function getHyperframesPackageRoot(): string {
  return normalizePackagedHyperframesPath(dirname(require.resolve("hyperframes/package.json")))
}

export function getBundledHyperframesSkillsRoot(): string {
  return join(getHyperframesPackageRoot(), "dist", "skills")
}

export function getAppManagedHyperframesSkillRoot(
  _provider: RippleSkillProvider,
): string {
  return getBundledHyperframesSkillsRoot()
}

export function getClaudeHyperframesPluginRoot(): string {
  return join(getHyperframesPackageRoot(), "dist")
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

async function ensureProviderSkill(input: {
  projectPath: string
  provider: RippleSkillProvider
  name: HyperframesSkillName
}): Promise<HyperframesSkillInstallStatus> {
  const sourcePath = join(getBundledHyperframesSkillsRoot(), input.name)
  const targetPath = join(getProviderProjectSkillRoot(input.projectPath, input.provider), input.name)

  if (!(await pathExists(join(sourcePath, "SKILL.md")))) {
    return {
      provider: input.provider,
      name: input.name,
      sourcePath,
      targetPath,
      status: "missing-source",
    }
  }

  const targetSkillMd = join(targetPath, "SKILL.md")
  if (!(await pathExists(targetSkillMd))) {
    await mkdir(targetPath, { recursive: true })
    await copyMissingOrIdenticalFiles({ sourceDir: sourcePath, targetDir: targetPath })
    return {
      provider: input.provider,
      name: input.name,
      sourcePath,
      targetPath,
      status: "created",
    }
  }

  return {
    provider: input.provider,
    name: input.name,
    sourcePath,
    targetPath,
    status: await copyMissingOrIdenticalFiles({ sourceDir: sourcePath, targetDir: targetPath }),
  }
}

export async function ensureProjectHyperframesSkills(input: {
  projectPath: string
  providers?: RippleSkillProvider[]
}): Promise<HyperframesSkillInstallResult> {
  const providers = input.providers ?? ["claude", "codex"]
  const skills: HyperframesSkillInstallStatus[] = []

  for (const provider of providers) {
    for (const name of HYPERFRAMES_SKILL_NAMES) {
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
    for (const name of HYPERFRAMES_SKILL_NAMES) {
      const sourcePath = join(getBundledHyperframesSkillsRoot(), name)
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
