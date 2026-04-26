import { and, eq } from "drizzle-orm"
import { existsSync } from "node:fs"
import { basename, extname, join, normalize } from "node:path"
import {
  compositions,
  projects,
  type Composition,
  type Project,
} from "../db/schema"
import { createId } from "../db/utils"
import {
  discoverDeclaredCompositions,
  readHyperframesMetadata,
} from "../ripple-projects/metadata"
import type { ScaffoldCompositionMetadata } from "../ripple-projects/types"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import {
  assertHyperframesProjectFiles,
  normalizeProjectRelativePath,
  resolveHyperframesProjectContext,
} from "./project-context"
import { runHyperframesCommand } from "./runtime"
import type { HyperframesRuntimeOptions } from "./runtime"
import type {
  HyperframesCliComposition,
  HyperframesCommandResult,
  HyperframesCompositionRefreshResult,
} from "./types"
import { HyperframesError } from "./types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function positiveInteger(value: unknown): number | null {
  const number = optionalNumber(value)
  return number !== null && number > 0 ? Math.round(number) : null
}

function labelFromCompositionId(id: string): string {
  if (id === "main") return "Main"
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Composition"
}

function dataIdFromFilePath(filePath: string, entry: string): string {
  if (filePath === entry || basename(filePath) === "index.html") return "main"
  return basename(filePath, extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "composition"
}

function normalizeCliSource(source: string): string {
  return normalize(source.replace(/^\.\//, "")).replace(/\\/g, "/")
}

function normalizeExistingProjectFile(
  projectPath: string,
  filePath: string,
): string | null {
  const normalizedFilePath = normalizeProjectRelativePath(filePath)
  const absolutePath = join(projectPath, normalizedFilePath)

  if (!isPathInsideDirectory(projectPath, absolutePath) || !existsSync(absolutePath)) {
    return null
  }

  return normalizedFilePath
}

export function parseHyperframesCompositionsJson(raw: string): HyperframesCliComposition[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new HyperframesError(
      "HyperFrames returned malformed composition data.",
      "COMPOSITION_JSON_MALFORMED",
    )
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.compositions)) {
    throw new HyperframesError(
      "HyperFrames composition data did not include a compositions list.",
      "COMPOSITION_JSON_UNEXPECTED",
      parsed,
    )
  }

  return parsed.compositions.map((item, index) => {
    if (!isRecord(item)) {
      throw new HyperframesError(
        `HyperFrames composition ${index + 1} was not an object.`,
        "COMPOSITION_JSON_UNEXPECTED",
        item,
      )
    }

    const id = optionalString(item.id)
    if (!id) {
      throw new HyperframesError(
        `HyperFrames composition ${index + 1} did not include an id.`,
        "COMPOSITION_JSON_UNEXPECTED",
        item,
      )
    }

    return {
      id,
      duration: optionalNumber(item.duration),
      width: positiveInteger(item.width),
      height: positiveInteger(item.height),
      elementCount: positiveInteger(item.elementCount),
      source: optionalString(item.source),
    }
  })
}

export function mergeCliAndDeclaredCompositions(input: {
  projectPath: string
  entry: string
  width: number
  height: number
  declared: ScaffoldCompositionMetadata[]
  cliCompositions: HyperframesCliComposition[]
}): ScaffoldCompositionMetadata[] {
  const declaredCompositions = input.declared.flatMap((composition) => {
    const normalizedFilePath = normalizeExistingProjectFile(
      input.projectPath,
      composition.filePath,
    )

    return normalizedFilePath
      ? [{ ...composition, filePath: normalizedFilePath }]
      : []
  })
  const byDataId = new Map(declaredCompositions.map((composition) => [
    composition.dataCompositionId,
    composition,
  ]))
  const byFilePath = new Map(declaredCompositions.map((composition) => [
    composition.filePath,
    composition,
  ]))
  const saved = new Map<string, ScaffoldCompositionMetadata>()

  for (const declared of declaredCompositions) {
    saved.set(declared.filePath, declared)
  }

  for (const cliComposition of input.cliCompositions) {
    const sourcePath = cliComposition.source
      ? normalizeCliSource(cliComposition.source)
      : null
    const declaredById = byDataId.get(cliComposition.id)
    const filePath =
      sourcePath ??
      declaredById?.filePath ??
      (cliComposition.id === "main" ? input.entry : null)

    if (!filePath) continue

    const normalizedFilePath = normalizeExistingProjectFile(input.projectPath, filePath)
    if (!normalizedFilePath) continue

    const existing = byFilePath.get(normalizedFilePath) ?? declaredById
    const kind =
      existing?.kind ??
      (normalizedFilePath === input.entry ? "root" : "external")
    const dataCompositionId =
      existing?.dataCompositionId ??
      cliComposition.id ??
      dataIdFromFilePath(normalizedFilePath, input.entry)

    saved.set(normalizedFilePath, {
      name: existing?.name ?? labelFromCompositionId(cliComposition.id),
      filePath: normalizedFilePath,
      dataCompositionId,
      width: cliComposition.width ?? existing?.width ?? input.width,
      height: cliComposition.height ?? existing?.height ?? input.height,
      kind,
      parentDataCompositionId:
        existing?.parentDataCompositionId ??
        (kind === "external" ? "main" : undefined),
    })
  }

  return Array.from(saved.values())
}

async function upsertCompositionRows(input: {
  project: Project
  scaffoldCompositions: ScaffoldCompositionMetadata[]
}): Promise<{ project: Project; compositions: Composition[] }> {
  const { getDatabase } = await import("../db")
  const db = getDatabase()
  const now = new Date()
  const existingRows = db
    .select()
    .from(compositions)
    .where(eq(compositions.projectId, input.project.id))
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
  const discoveredFilePaths = new Set(
    input.scaffoldCompositions.map((composition) => composition.filePath),
  )
  const saved: Composition[] = []

  for (const existing of existingRows) {
    if (!discoveredFilePaths.has(existing.filePath)) {
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
      projectId: input.project.id,
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

  const activeStillExists = saved.some(
    (composition) => composition.id === input.project.activeCompositionId,
  )
  const nextActiveComposition = activeStillExists
    ? saved.find((composition) => composition.id === input.project.activeCompositionId) ?? null
    : saved.find((composition) => composition.kind === "root") ?? saved[0] ?? null

  const updatedProject = nextActiveComposition && !activeStillExists
    ? db
        .update(projects)
        .set({
          activeCompositionId: nextActiveComposition.id,
          updatedAt: now,
        })
        .where(eq(projects.id, input.project.id))
        .returning()
        .get() ?? input.project
    : input.project

  return { project: updatedProject, compositions: saved }
}

export async function listSavedHyperframesCompositions(projectId: string): Promise<Composition[]> {
  const { getDatabase } = await import("../db")
  return getDatabase()
    .select()
    .from(compositions)
    .where(eq(compositions.projectId, projectId))
    .all()
}

export async function refreshHyperframesCompositions(input: {
  projectId: string
  repoRoot?: string
  execFile?: HyperframesRuntimeOptions["execFile"]
}): Promise<HyperframesCompositionRefreshResult> {
  const context = await resolveHyperframesProjectContext({ projectId: input.projectId })
  assertHyperframesProjectFiles(context.projectPath)

  const metadata = await readHyperframesMetadata(context.projectPath)
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
  const declared = discoverDeclaredCompositions(metadata, { entry, width, height })
  const command = await runHyperframesCommand(
    ["compositions", "--json", context.projectPath],
    {
      repoRoot: input.repoRoot,
      cwd: context.projectPath,
      timeout: 10000,
      execFile: input.execFile,
    },
  )

  if (!command.ok) {
    throw new HyperframesError(
      "Ripple could not discover project compositions.",
      "COMPOSITION_DISCOVERY_FAILED",
      command,
    )
  }

  const cliCompositions = parseHyperframesCompositionsJson(command.stdout)
  const scaffoldCompositions = mergeCliAndDeclaredCompositions({
    projectPath: context.projectPath,
    entry,
    width,
    height,
    declared,
    cliCompositions,
  })
  const saved = await upsertCompositionRows({
    project: context.project,
    scaffoldCompositions,
  })

  return {
    project: saved.project,
    compositions: saved.compositions,
    cliCompositions,
    command,
  }
}

export async function getSavedCompositionForProject(input: {
  projectId: string
  compositionId: string
}): Promise<Composition | null> {
  const { getDatabase } = await import("../db")
  return getDatabase()
    .select()
    .from(compositions)
    .where(
      and(
        eq(compositions.id, input.compositionId),
        eq(compositions.projectId, input.projectId),
      ),
    )
    .get() ?? null
}
