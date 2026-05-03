import { app } from "electron"
import { and, eq, or } from "drizzle-orm"
import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { mkdir, stat } from "node:fs/promises"
import {
  compositions,
  getDatabase,
  projects,
  type Composition,
  type Project,
} from "../db"
import { createId } from "../db/utils"
import { checkRippleEnvironment } from "./environment"
import {
  discoverDeclaredCompositions,
  readHyperframesMetadata,
} from "./metadata"
import { ensureRippleProjectGitRepository } from "./project-git"
import {
  createProjectSlug,
  getDefaultRippleRoot,
  getUniqueProjectPath,
  isPathInsideDirectory,
  toProjectDisplayName,
} from "./paths"
import { writeRippleProjectScaffold } from "./scaffold"
import {
  checkRippleProjectAgentNotes,
  ensureRippleProjectAgentNotes,
  refreshRippleProjectAgentNotes,
} from "./project-agent-notes"
import {
  checkAppManagedHyperframesSkills,
  ensureProjectHyperframesSkills,
  type RippleSkillProvider,
} from "./hyperframes-skills"
import { defaultRippleProjectSettings } from "./types"
import { getRippleTemplateForTarget } from "../hyperframes/templates/catalog"
import type {
  AspectRatioPreset,
  CreateRippleProjectInput,
  OpenExistingRippleProjectInput,
  RippleProjectResult,
  ScaffoldCompositionMetadata,
  ScaffoldMetadata,
  SetupReport,
} from "./types"
import type { RippleTemplateDefinition } from "../../../shared/hyperframes-templates"

const DIMENSIONS_BY_PRESET: Record<AspectRatioPreset, { width: number; height: number }> = {
  "wide-16-9": { width: 1920, height: 1080 },
  "square-1-1": { width: 1080, height: 1080 },
  "vertical-9-16": { width: 1080, height: 1920 },
}

function getRepoRoot(): string | undefined {
  if (app.isPackaged) return undefined
  return app.getAppPath()
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

function getSetupError(setup: SetupReport): string | null {
  return setup.summary
}

function getPresetForDimensions(input: {
  width: number
  height: number
}): AspectRatioPreset {
  if (input.width === input.height) return "square-1-1"
  if (input.width < input.height) return "vertical-9-16"
  return "wide-16-9"
}

function makeScaffoldMetadata(input: {
  name: string
  slug: string
  aspectRatioPreset?: AspectRatioPreset
  width?: number
  height?: number
  fps?: number
  templateId?: string | null
  template?: RippleTemplateDefinition | null
}): ScaffoldMetadata {
  const aspectRatioPreset =
    input.aspectRatioPreset ??
    (input.template
      ? getPresetForDimensions(input.template)
      : defaultRippleProjectSettings.aspectRatioPreset)
  const presetDimensions = DIMENSIONS_BY_PRESET[aspectRatioPreset]
  const usePresetDimensions = Boolean(input.aspectRatioPreset)
  return {
    projectName: input.name,
    slug: input.slug,
    aspectRatioPreset,
    templateId: input.template?.id ?? input.templateId ?? "blank",
    width: input.width ??
      (usePresetDimensions ? presetDimensions.width : input.template?.width ?? presetDimensions.width),
    height: input.height ??
      (usePresetDimensions ? presetDimensions.height : input.template?.height ?? presetDimensions.height),
    fps: input.fps ?? input.template?.fps ?? defaultRippleProjectSettings.fps,
  }
}

function insertCompositionRows(input: {
  projectId: string
  scaffoldCompositions: ScaffoldCompositionMetadata[]
}): Composition[] {
  const db = getDatabase()
  const compositionIdsByDataId = new Map<string, string>()
  const now = new Date()
  const inserted: Composition[] = []

  for (const composition of input.scaffoldCompositions) {
    const id = createId()
    compositionIdsByDataId.set(composition.dataCompositionId, id)
    const row = db
      .insert(compositions)
      .values({
        id,
        projectId: input.projectId,
        name: composition.name,
        filePath: composition.filePath,
        dataCompositionId: composition.dataCompositionId,
        width: composition.width,
        height: composition.height,
        parentCompositionId: composition.parentDataCompositionId
          ? compositionIdsByDataId.get(composition.parentDataCompositionId) ?? null
          : null,
        kind: composition.kind,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()

    if (row) inserted.push(row)
  }

  return inserted
}

function upsertCompositionRows(input: {
  projectId: string
  scaffoldCompositions: ScaffoldCompositionMetadata[]
}): Composition[] {
  const db = getDatabase()
  const now = new Date()
  const existingRows = db
    .select()
    .from(compositions)
    .where(eq(compositions.projectId, input.projectId))
    .all()
  const existingByFilePath = new Map(
    existingRows.map((composition) => [composition.filePath, composition]),
  )
  const compositionIdsByDataId = new Map(
    existingRows.map((composition) => [
      composition.dataCompositionId,
      composition.id,
    ]),
  )
  const declaredFilePaths = new Set(
    input.scaffoldCompositions.map((composition) => composition.filePath),
  )
  const saved: Composition[] = []

  for (const existing of existingRows) {
    if (!declaredFilePaths.has(existing.filePath)) {
      db.delete(compositions).where(eq(compositions.id, existing.id)).run()
      compositionIdsByDataId.delete(existing.dataCompositionId)
    }
  }

  for (const composition of input.scaffoldCompositions) {
    const existing = existingByFilePath.get(composition.filePath)
    compositionIdsByDataId.set(composition.dataCompositionId, existing?.id ?? createId())
  }

  for (const composition of input.scaffoldCompositions) {
    const existing = existingByFilePath.get(composition.filePath)
    const id = compositionIdsByDataId.get(composition.dataCompositionId) ?? createId()
    const parentCompositionId = composition.parentDataCompositionId
      ? compositionIdsByDataId.get(composition.parentDataCompositionId) ?? null
      : null
    const values = {
      id,
      projectId: input.projectId,
      name: composition.name,
      filePath: composition.filePath,
      dataCompositionId: composition.dataCompositionId,
      width: composition.width,
      height: composition.height,
      parentCompositionId,
      kind: composition.kind,
      updatedAt: now,
    }

    const row = existing
      ? db
          .update(compositions)
          .set(values)
          .where(eq(compositions.id, existing.id))
          .returning()
          .get()
      : db
          .insert(compositions)
          .values({
            ...values,
            createdAt: now,
          })
          .returning()
          .get()

    if (row) saved.push(row)
  }

  return saved
}

function getProjectLocalPath(project: Project): string {
  return project.localPath ?? project.path
}

export async function createRippleProject(
  input: CreateRippleProjectInput,
): Promise<RippleProjectResult> {
  const projectName = toProjectDisplayName(input.name)
  const template = await getRippleTemplateForTarget({
    templateId: input.templateId,
    target: "new-project",
  })
  const baseSlug = createProjectSlug(projectName)
  const rippleRoot = getDefaultRippleRoot(app.getPath("home"))
  await mkdir(rippleRoot, { recursive: true })
  const db = getDatabase()
  const registeredProjectPaths = new Set(
    db
      .select({ path: projects.path, localPath: projects.localPath })
      .from(projects)
      .all()
      .flatMap((project) => [project.path, project.localPath])
      .filter((path): path is string => !!path),
  )

  const { slug, projectPath } = getUniqueProjectPath(
    rippleRoot,
    baseSlug,
    (candidatePath) => existsSync(candidatePath) || registeredProjectPaths.has(candidatePath),
  )
  const scaffoldMetadata = makeScaffoldMetadata({
    name: projectName,
    slug,
    aspectRatioPreset: input.aspectRatioPreset,
    width: input.width,
    height: input.height,
    fps: input.fps,
    templateId: template.id,
    template,
  })

  const scaffold = await writeRippleProjectScaffold(projectPath, scaffoldMetadata)
  await ensureRippleProjectGitRepository(projectPath)
  const setup = await checkRippleEnvironment(getRepoRoot())
  const setupError = getSetupError(setup)

  try {
    const now = new Date()
    const project = db
      .insert(projects)
      .values({
        name: projectName,
        slug,
        path: projectPath,
        localPath: projectPath,
        aspectRatioPreset: scaffoldMetadata.aspectRatioPreset,
        templateId: scaffoldMetadata.templateId,
        setupStatus: setup.status,
        setupError,
        lastSetupCheckAt: setup.checkedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()

    if (!project) {
      throw new Error("Database did not return the created project.")
    }

    const insertedCompositions = insertCompositionRows({
      projectId: project.id,
      scaffoldCompositions: scaffold.compositions,
    })
    const activeComposition = insertedCompositions[0] ?? null

    const updatedProject =
      activeComposition
        ? db
            .update(projects)
            .set({
              activeCompositionId: activeComposition.id,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, project.id))
            .returning()
            .get()
        : project

    return {
      project: updatedProject ?? project,
      activeComposition,
      compositions: insertedCompositions,
      generatedPath: projectPath,
      setup,
      agentNotes: scaffold.agentNotes,
      hyperframesSkills: await checkAppManagedHyperframesSkills(),
    }
  } catch (error) {
    throw new Error(
      `Created project files at ${projectPath}, but could not save the project record: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

async function assertExistingRippleProject(projectPath: string): Promise<void> {
  const requiredFiles = ["index.html", "hyperframes.json"]
  for (const file of requiredFiles) {
    if (!(await pathExists(join(projectPath, file)))) {
      throw new Error(`This folder is missing ${file}. Choose a Ripple or HyperFrames project.`)
    }
  }
}

export async function openExistingRippleProject(
  input: OpenExistingRippleProjectInput,
): Promise<RippleProjectResult> {
  await assertExistingRippleProject(input.projectPath)
  const [agentNotes, hyperframesSkills] = await Promise.all([
    checkRippleProjectAgentNotes(input.projectPath),
    checkAppManagedHyperframesSkills(),
  ])

  const metadata = await readHyperframesMetadata(input.projectPath)
  const metadataName = typeof metadata.name === "string" ? metadata.name : null
  const name = toProjectDisplayName(metadataName || basename(input.projectPath))
  const slug = createProjectSlug(name)
  const width =
    typeof metadata.width === "number" && Number.isFinite(metadata.width) && metadata.width > 0
      ? Math.round(metadata.width)
      : 1920
  const height =
    typeof metadata.height === "number" && Number.isFinite(metadata.height) && metadata.height > 0
      ? Math.round(metadata.height)
      : 1080
  const entry =
    typeof metadata.entry === "string" && metadata.entry.trim()
      ? metadata.entry.trim()
      : "index.html"
  const declaredCompositions = discoverDeclaredCompositions(metadata, {
    entry,
    width,
    height,
  })
  const setup = await checkRippleEnvironment(getRepoRoot())
  const setupError = getSetupError(setup)

  const db = getDatabase()
  const existing = db
    .select()
    .from(projects)
    .where(or(eq(projects.localPath, input.projectPath), eq(projects.path, input.projectPath)))
    .get()

  const now = new Date()
  const project =
    existing
      ? db
          .update(projects)
          .set({
            name,
            slug: existing.slug ?? slug,
            path: input.projectPath,
            localPath: input.projectPath,
            setupStatus: setup.status,
            setupError,
            lastSetupCheckAt: setup.checkedAt,
            archivedAt: null,
            updatedAt: now,
          })
          .where(eq(projects.id, existing.id))
          .returning()
          .get()
      : db
          .insert(projects)
          .values({
            name,
            slug,
            path: input.projectPath,
            localPath: input.projectPath,
            aspectRatioPreset: "wide-16-9",
            templateId: "imported",
            setupStatus: setup.status,
            setupError,
            lastSetupCheckAt: setup.checkedAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get()

  if (!project) {
    throw new Error("Could not register the selected project.")
  }

  const registeredCompositions = upsertCompositionRows({
    projectId: project.id,
    scaffoldCompositions: declaredCompositions,
  })
  const activeComposition =
    registeredCompositions.find((composition) => composition.filePath === entry) ??
    registeredCompositions[0] ??
    null

  const updatedProject =
    activeComposition
      ? db
          .update(projects)
          .set({
            activeCompositionId: activeComposition.id,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, project.id))
          .returning()
          .get()
      : project

  const projectCompositions = db
    .select()
    .from(compositions)
    .where(eq(compositions.projectId, project.id))
    .all()

  return {
    project: updatedProject ?? project,
    activeComposition: activeComposition ?? null,
    compositions: projectCompositions,
    generatedPath: getProjectLocalPath(updatedProject ?? project),
    setup,
    agentNotes,
    hyperframesSkills,
  }
}

function requireProjectPath(projectId: string): string {
  const project = getDatabase()
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get()
  if (!project) throw new Error("Project not found.")
  return getProjectLocalPath(project)
}

export async function checkProjectAssistantReadiness(projectId: string) {
  const projectPath = requireProjectPath(projectId)
  const [agentNotes, hyperframesSkills] = await Promise.all([
    checkRippleProjectAgentNotes(projectPath),
    checkAppManagedHyperframesSkills(),
  ])
  return { projectPath, agentNotes, hyperframesSkills }
}

export async function addProjectAgentNotes(projectId: string) {
  return ensureRippleProjectAgentNotes(requireProjectPath(projectId))
}

export async function updateProjectAgentNotes(projectId: string) {
  return refreshRippleProjectAgentNotes(requireProjectPath(projectId))
}

export async function installProjectHyperframesSkills(input: {
  projectId: string
  providers?: RippleSkillProvider[]
}) {
  return ensureProjectHyperframesSkills({
    projectPath: requireProjectPath(input.projectId),
    providers: input.providers,
  })
}

export function listProjectCompositions(projectId: string): Composition[] {
  return getDatabase()
    .select()
    .from(compositions)
    .where(eq(compositions.projectId, projectId))
    .all()
}

export function getProjectSetupStatus(projectId: string): {
  status: Project["setupStatus"]
  error: string | null
  lastSetupCheckAt: Date | null
} | null {
  const project = getDatabase()
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get()

  if (!project) return null

  return {
    status: project.setupStatus,
    error: project.setupError,
    lastSetupCheckAt: project.lastSetupCheckAt,
  }
}

export async function refreshProjectSetupStatus(projectId: string): Promise<SetupReport> {
  const setup = await checkRippleEnvironment(getRepoRoot())
  getDatabase()
    .update(projects)
    .set({
      setupStatus: setup.status,
      setupError: getSetupError(setup),
      lastSetupCheckAt: setup.checkedAt,
    })
    .where(eq(projects.id, projectId))
    .run()

  return setup
}

export async function refreshAllProjectSetupStatuses(): Promise<SetupReport> {
  const setup = await checkRippleEnvironment(getRepoRoot())
  getDatabase()
    .update(projects)
    .set({
      setupStatus: setup.status,
      setupError: getSetupError(setup),
      lastSetupCheckAt: setup.checkedAt,
    })
    .run()

  return setup
}

export async function ensureRippleRuntimeOnLaunch(): Promise<SetupReport> {
  await mkdir(getDefaultRippleRoot(app.getPath("home")), { recursive: true })
  return refreshAllProjectSetupStatuses()
}

export function setActiveComposition(input: {
  projectId: string
  compositionId: string
}): Project | null {
  const db = getDatabase()
  const composition = db
    .select()
    .from(compositions)
    .where(
      and(
        eq(compositions.id, input.compositionId),
        eq(compositions.projectId, input.projectId),
      ),
    )
    .get()

  if (!composition) return null

  return (
    db
      .update(projects)
      .set({
        activeCompositionId: composition.id,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.projectId))
      .returning()
      .get() ?? null
  )
}

export function assertPathInsideProject(project: Project, targetPath: string): void {
  const localPath = getProjectLocalPath(project)
  if (!isPathInsideDirectory(localPath, targetPath)) {
    throw new Error("Target path is outside the project.")
  }
}
