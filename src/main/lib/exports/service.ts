import { and, desc, eq, inArray } from "drizzle-orm"
import { shell } from "electron"
import { copyFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import {
  getRippleExportDisplayPath,
  isRippleExportTerminalStatus,
  parseRippleExportSettingsJson,
  rippleExportTerminalStatuses,
  type RippleExportAdvancedSettings,
  type RippleExportFormat,
  type RippleExportFps,
  type RippleExportJobView,
  type RippleExportQualityPreset,
  type RippleExportStatus,
} from "../../../shared/ripple-exports"
import {
  parseRippleChatWorktreePreviewProjectId,
  parseRippleRevisionPreviewProjectId,
} from "../../../shared/ripple-comments"
import { compositions, exportJobs, type Composition, type ExportJob } from "../db/schema"
import { createId } from "../db/utils"
import { getDatabase } from "../db"
import {
  assertHyperframesProjectFiles,
  resolveHyperframesPreviewContext,
  resolveHyperframesProjectContext,
} from "../hyperframes/project-context"
import { execFileSafe, buildHyperframesEnvironment, getAppManagedCommandCandidates } from "../hyperframes/runtime"
import { HyperframesError, type HyperframesProjectContext } from "../hyperframes/types"
import {
  assertDestinationMatchesFormat,
  assertProjectLocalEntryFile,
  createExportOutputPath,
  prepareDestinationDirectory,
  safeExportStem,
} from "./paths"
import {
  executeProducerExport,
  isProducerCancellationError,
  type ProducerExportInput,
  type ProducerExportLog,
  type ProducerExportProgress,
} from "./producer-executor"
import { normalizeProgressUpdate, trimExportLogTail } from "./progress"

type ExportDb = ReturnType<typeof getDatabase>
type ProjectContextResolver = typeof resolveHyperframesProjectContext
type PreviewContextResolver = typeof resolveHyperframesPreviewContext

export type ProducerExecutor = (
  input: ProducerExportInput,
) => Promise<{ durationSeconds: number | null; width: number | null; height: number | null }>

interface DestinationToken {
  id: string
  projectId: string
  compositionId: string | null
  format: RippleExportFormat
  path: string
  createdAt: number
}

interface ActiveExport {
  abortController: AbortController
}

interface ProbeResult {
  durationSeconds: number | null
  width: number | null
  height: number | null
  formatName: string | null
  videoCodec: string | null
}

export interface StartExportInput {
  projectId: string
  compositionId?: string | null
  revisionId?: string | null
  chatId?: string | null
  format: RippleExportFormat
  fps: RippleExportFps
  qualityPreset: RippleExportQualityPreset
  settings?: RippleExportAdvancedSettings
  destinationToken?: string | null
  destinationPath?: string | null
}

const activeStatuses: RippleExportStatus[] = ["queued", "preparing", "running"]

function nowDate(optionsNow?: () => Date): Date {
  return optionsNow ? optionsNow() : new Date()
}

function compactError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toView(job: ExportJob): RippleExportJobView {
  return {
    id: job.id,
    projectId: job.projectId,
    compositionId: job.compositionId,
    revisionId: job.revisionId,
    sourceContextKey: job.sourceContextKey,
    sourceLabel: job.sourceLabel,
    label: job.label,
    format: job.format,
    fps: job.fps,
    qualityPreset: job.qualityPreset,
    settings: parseRippleExportSettingsJson(job.settingsJson),
    outputPath: job.outputPath,
    destinationPath: job.destinationPath,
    displayPath: getRippleExportDisplayPath(job),
    status: job.status,
    progress: job.progress,
    progressLabel: job.progressLabel,
    pid: job.pid,
    stdoutTail: job.stdoutTail,
    stderrTail: job.stderrTail,
    errorMessage: job.errorMessage,
    outputSizeBytes: job.outputSizeBytes,
    durationSeconds: job.durationSeconds,
    width: job.width,
    height: job.height,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    cancelledAt: job.cancelledAt,
  }
}

async function probeMediaOutput(outputPath: string): Promise<ProbeResult> {
  const args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,codec_name:format=duration,format_name",
    "-of",
    "json",
    outputPath,
  ]
  const env = buildHyperframesEnvironment(process.env)
  const candidates = [...getAppManagedCommandCandidates("ffprobe"), "ffprobe"]

  for (const command of candidates) {
    const result = await execFileSafe(command, args, {
      env,
      timeout: 15000,
    })
    if (!result.ok) continue

    const parsed = JSON.parse(result.stdout || "{}") as {
      streams?: Array<{ width?: number; height?: number; codec_name?: string }>
      format?: { duration?: string; format_name?: string }
    }
    const stream = parsed.streams?.[0]
    const duration = Number(parsed.format?.duration)
    return {
      durationSeconds: Number.isFinite(duration) ? Math.round(duration) : null,
      width: typeof stream?.width === "number" ? stream.width : null,
      height: typeof stream?.height === "number" ? stream.height : null,
      formatName: typeof parsed.format?.format_name === "string"
        ? parsed.format.format_name
        : null,
      videoCodec: typeof stream?.codec_name === "string" ? stream.codec_name : null,
    }
  }

  throw new HyperframesError(
    "Ripple could not inspect the completed export with FFprobe.",
    "EXPORT_FFPROBE_FAILED",
  )
}

function getSourceIdsFromJob(job: ExportJob): {
  revisionId: string | null
  chatId: string | null
} {
  const revisionId =
    job.revisionId ?? parseRippleRevisionPreviewProjectId(job.sourceContextKey)
  if (revisionId) {
    return { revisionId, chatId: null }
  }

  return {
    revisionId: null,
    chatId: parseRippleChatWorktreePreviewProjectId(job.sourceContextKey),
  }
}

function isProbeContainerCompatible(
  format: RippleExportFormat,
  formatName: string | null,
): boolean {
  if (!formatName) return false
  const names = formatName.toLowerCase().split(",").map((name) => name.trim())
  switch (format) {
    case "mp4":
      return names.includes("mp4") || names.includes("mov")
    case "mov":
      return names.includes("mov") || names.includes("quicktime")
    case "webm":
      return names.includes("webm") || names.includes("matroska")
  }
}

function isProbeCodecCompatible(
  format: RippleExportFormat,
  codec: string | null,
): boolean {
  if (!codec) return false
  const normalized = codec.toLowerCase()
  switch (format) {
    case "mp4":
      return ["h264", "hevc", "h265"].includes(normalized)
    case "mov":
      return ["prores", "qtrle", "png", "h264", "hevc", "h265"].includes(normalized)
    case "webm":
      return ["vp8", "vp9", "av1"].includes(normalized)
  }
}

function assertValidProbeResult(input: {
  job: ExportJob
  producerResult: Awaited<ReturnType<ProducerExecutor>>
  probe: ProbeResult
}): void {
  const { job, producerResult, probe } = input
  if (!probe.width || !probe.height) {
    throw new HyperframesError(
      "Ripple could not confirm the export dimensions.",
      "EXPORT_OUTPUT_VALIDATION_FAILED",
    )
  }
  if (job.width && job.height && (probe.width !== job.width || probe.height !== job.height)) {
    throw new HyperframesError(
      `Export dimensions were ${probe.width}x${probe.height}, expected ${job.width}x${job.height}.`,
      "EXPORT_OUTPUT_DIMENSIONS_MISMATCH",
    )
  }
  if (!probe.durationSeconds || probe.durationSeconds <= 0) {
    throw new HyperframesError(
      "Ripple could not confirm the export duration.",
      "EXPORT_OUTPUT_VALIDATION_FAILED",
    )
  }
  if (
    producerResult.durationSeconds &&
    Math.abs(probe.durationSeconds - Math.round(producerResult.durationSeconds)) > 1
  ) {
    throw new HyperframesError(
      "Export duration does not match the completed export.",
      "EXPORT_OUTPUT_DURATION_MISMATCH",
    )
  }
  if (!isProbeContainerCompatible(job.format, probe.formatName)) {
    throw new HyperframesError(
      `Export container did not match ${job.format.toUpperCase()}.`,
      "EXPORT_OUTPUT_FORMAT_MISMATCH",
    )
  }
  if (!isProbeCodecCompatible(job.format, probe.videoCodec)) {
    throw new HyperframesError(
      `Export codec did not match ${job.format.toUpperCase()}.`,
      "EXPORT_OUTPUT_CODEC_MISMATCH",
    )
  }
}

export class ExportService {
  private readonly active = new Map<string, ActiveExport>()
  private readonly destinationTokens = new Map<string, DestinationToken>()
  private recovered = false

  constructor(
    private readonly options: {
      db?: ExportDb
      now?: () => Date
      execute?: ProducerExecutor
      probeOutput?: (outputPath: string) => Promise<ProbeResult>
      resolveProjectContext?: ProjectContextResolver
      resolvePreviewContext?: PreviewContextResolver
    } = {},
  ) {}

  createDestinationToken(input: {
    projectId: string
    compositionId?: string | null
    format: RippleExportFormat
    path: string
  }): DestinationToken {
    const token: DestinationToken = {
      id: createId(),
      projectId: input.projectId,
      compositionId: input.compositionId ?? null,
      format: input.format,
      path: resolve(input.path),
      createdAt: Date.now(),
    }
    assertDestinationMatchesFormat({ path: token.path, format: input.format })
    this.destinationTokens.set(token.id, token)
    return token
  }

  list(input: { projectId: string; limit?: number }): RippleExportJobView[] {
    this.recoverInterruptedJobs()
    return this.db()
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.projectId, input.projectId))
      .orderBy(desc(exportJobs.createdAt))
      .limit(input.limit ?? 50)
      .all()
      .map(toView)
  }

  get(jobId: string): RippleExportJobView | null {
    this.recoverInterruptedJobs()
    const job = this.getJob(jobId)
    return job ? toView(job) : null
  }

  getActiveCount(projectId?: string): number {
    this.recoverInterruptedJobs()
    const rows = projectId
      ? this.db()
        .select()
        .from(exportJobs)
        .where(and(
          eq(exportJobs.projectId, projectId),
          inArray(exportJobs.status, activeStatuses),
        ))
        .all()
      : this.db()
        .select()
        .from(exportJobs)
        .where(inArray(exportJobs.status, activeStatuses))
        .all()

    return rows.length
  }

  async start(input: StartExportInput): Promise<RippleExportJobView> {
    this.recoverInterruptedJobs()
    if (input.revisionId && input.chatId) {
      throw new HyperframesError(
        "Choose one preview source to export.",
        "EXPORT_SOURCE_CONFLICT",
      )
    }

    const db = this.db()
    const projectContext = await this.resolveProjectContext({
      projectId: input.projectId,
    })
    assertHyperframesProjectFiles(projectContext.projectPath)

    const sourceContext = await this.resolvePreviewContext({
      projectId: input.projectId,
      revisionId: input.revisionId,
      chatId: input.chatId,
    })
    assertHyperframesProjectFiles(sourceContext.projectPath)

    const composition = this.resolveComposition({
      projectId: input.projectId,
      compositionId: input.compositionId ?? projectContext.project.activeCompositionId,
    })
    const entryFile = assertProjectLocalEntryFile({
      context: sourceContext,
      filePath: composition.filePath,
    })

    const jobId = createId()
    const outputPath = await createExportOutputPath({
      projectContext,
      jobId,
      compositionName: composition.name,
      format: input.format,
    })
    if (input.destinationToken && input.destinationPath) {
      throw new HyperframesError(
        "Choose one export destination.",
        "EXPORT_DESTINATION_CONFLICT",
      )
    }
    const destinationPath = input.destinationPath
      ? this.resolveStoredDestinationPath({
          path: input.destinationPath,
          format: input.format,
        })
      : this.resolveDestinationToken({
          tokenId: input.destinationToken,
          projectId: input.projectId,
          compositionId: composition.id,
          format: input.format,
        })
    const createdAt = nowDate(this.options.now)
    const sourceLabel = input.revisionId || input.chatId ? "Current Preview" : "Main"
    const label = `${composition.name} ${input.format.toUpperCase()}`

    const inserted = db
      .insert(exportJobs)
      .values({
        id: jobId,
        projectId: input.projectId,
        compositionId: composition.id,
        revisionId: input.revisionId ?? null,
        sourceContextKey: sourceContext.key,
        sourceLabel,
        label,
        format: input.format,
        fps: input.fps,
        qualityPreset: input.qualityPreset,
        settingsJson: JSON.stringify(input.settings ?? {}),
        outputPath,
        destinationPath,
        status: "queued",
        progress: 0,
        progressLabel: "Queued",
        stdoutTail: "",
        stderrTail: "",
        width: composition.width,
        height: composition.height,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
      .get()

    void this.runJob(inserted.id, entryFile)
    return toView(inserted)
  }

  async cancel(jobId: string): Promise<RippleExportJobView | null> {
    this.recoverInterruptedJobs()
    const job = this.getJob(jobId)
    if (!job) return null

    if (isRippleExportTerminalStatus(job.status)) {
      return toView(job)
    }

    const active = this.active.get(jobId)
    active?.abortController.abort()
    const updated = this.updateJob(jobId, {
      status: "cancelled",
      progressLabel: "Cancelled",
      pid: null,
      errorMessage: null,
      cancelledAt: nowDate(this.options.now),
      completedAt: nowDate(this.options.now),
    })
    return updated ? toView(updated) : null
  }

  async cancelAll(): Promise<RippleExportJobView[]> {
    const ids = Array.from(this.active.keys())
    const cancelled = await Promise.all(ids.map((id) => this.cancel(id)))
    return cancelled.filter((job): job is RippleExportJobView => Boolean(job))
  }

  async retry(jobId: string): Promise<RippleExportJobView> {
    this.recoverInterruptedJobs()
    const job = this.getJob(jobId)
    if (!job) {
      throw new HyperframesError("Export job not found.", "EXPORT_JOB_NOT_FOUND")
    }
    if (!isRippleExportTerminalStatus(job.status)) {
      throw new HyperframesError(
        "Wait for this export to finish before retrying it.",
        "EXPORT_JOB_ACTIVE",
      )
    }

    const sourceIds = getSourceIdsFromJob(job)
    return this.start({
      projectId: job.projectId,
      compositionId: job.compositionId,
      revisionId: sourceIds.revisionId,
      chatId: sourceIds.chatId,
      format: job.format,
      fps: job.fps,
      qualityPreset: job.qualityPreset,
      settings: parseRippleExportSettingsJson(job.settingsJson),
      destinationPath: job.destinationPath,
    })
  }

  clearCompleted(projectId: string): { deleted: number } {
    this.recoverInterruptedJobs()
    const result = this.db()
      .delete(exportJobs)
      .where(and(
        eq(exportJobs.projectId, projectId),
        inArray(exportJobs.status, [...rippleExportTerminalStatuses]),
      ))
      .run()

    return { deleted: result.changes ?? 0 }
  }

  remove(jobId: string): { deleted: number } {
    this.recoverInterruptedJobs()
    const job = this.getJob(jobId)
    if (!job) return { deleted: 0 }
    if (!isRippleExportTerminalStatus(job.status)) {
      throw new HyperframesError(
        "Cancel this export before removing it.",
        "EXPORT_JOB_ACTIVE",
      )
    }
    const result = this.db().delete(exportJobs).where(eq(exportJobs.id, jobId)).run()
    return { deleted: result.changes ?? 0 }
  }

  async revealOutput(jobId: string): Promise<{ success: true; path: string }> {
    const path = this.getCompletedOutputPath(jobId)
    shell.showItemInFolder(path)
    return { success: true, path }
  }

  async openOutput(jobId: string): Promise<{ success: true; path: string }> {
    const path = this.getCompletedOutputPath(jobId)
    const message = await shell.openPath(path)
    if (message) {
      throw new HyperframesError(message, "EXPORT_OPEN_FAILED")
    }
    return { success: true, path }
  }

  recoverInterruptedJobs(): { interrupted: number } {
    if (this.recovered) return { interrupted: 0 }
    this.recovered = true

    const now = nowDate(this.options.now)
    const activeIds = new Set(this.active.keys())
    const stale = this.db()
      .select()
      .from(exportJobs)
      .where(inArray(exportJobs.status, activeStatuses))
      .all()
      .filter((job) => !activeIds.has(job.id))

    for (const job of stale) {
      this.updateJob(job.id, {
        status: "interrupted",
        progressLabel: "Interrupted",
        pid: null,
        errorMessage: "Ripple closed before this export finished.",
        completedAt: now,
      })
    }

    return { interrupted: stale.length }
  }

  private async runJob(jobId: string, entryFile: string): Promise<void> {
    const job = this.getJob(jobId)
    if (!job || job.status === "cancelled") return

    const abortController = new AbortController()
    this.active.set(jobId, { abortController })
    const startedAt = nowDate(this.options.now)
    this.updateJob(jobId, {
      status: "preparing",
      progress: 1,
      progressLabel: "Preparing export",
      pid: process.pid,
      startedAt,
      updatedAt: startedAt,
    })
    const markCancelledIfRequested = () => {
      if (!abortController.signal.aborted) return false
      this.markCancelled(jobId)
      return true
    }

    try {
      const sourceIds = getSourceIdsFromJob(job)
      const context = await this.resolvePreviewContext({
        projectId: job.projectId,
        revisionId: sourceIds.revisionId,
        chatId: sourceIds.chatId,
      })
      const settings = parseRippleExportSettingsJson(job.settingsJson)
      const execute = this.options.execute ?? executeProducerExport
      let lastProgressWrite = 0
      const result = await execute({
        projectDir: context.projectPath,
        entryFile,
        outputPath: job.outputPath!,
        format: job.format,
        fps: job.fps,
        qualityPreset: job.qualityPreset,
        settings,
        signal: abortController.signal,
        onProgress: (progress) => {
          lastProgressWrite = this.writeProgress({
            jobId,
            progress,
            lastProgressWrite,
          })
        },
        onLog: (log) => {
          this.appendLog(jobId, log)
        },
      })

      if (markCancelledIfRequested()) return

      const fileStat = await stat(job.outputPath!)
      if (markCancelledIfRequested()) return
      if (fileStat.size <= 0) {
        throw new HyperframesError("Export output was empty.", "EXPORT_EMPTY_OUTPUT")
      }

      const probe = await (this.options.probeOutput ?? probeMediaOutput)(job.outputPath!)
      assertValidProbeResult({ job, producerResult: result, probe })
      if (markCancelledIfRequested()) return

      if (job.destinationPath && job.destinationPath !== job.outputPath) {
        await prepareDestinationDirectory(job.destinationPath)
        if (markCancelledIfRequested()) return
        await copyFile(job.outputPath!, job.destinationPath)
        if (markCancelledIfRequested()) return
      }

      const completedAt = nowDate(this.options.now)
      this.updateJob(jobId, {
        status: "completed",
        progress: 100,
        progressLabel: "Complete",
        pid: null,
        errorMessage: null,
        outputSizeBytes: fileStat.size,
        durationSeconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        completedAt,
        updatedAt: completedAt,
      })
    } catch (error) {
      if (abortController.signal.aborted || isProducerCancellationError(error)) {
        this.markCancelled(jobId)
        return
      }

      const completedAt = nowDate(this.options.now)
      this.updateJob(jobId, {
        status: "failed",
        progressLabel: "Failed",
        pid: null,
        errorMessage: compactError(error),
        completedAt,
        updatedAt: completedAt,
      })
    } finally {
      this.active.delete(jobId)
    }
  }

  private writeProgress(input: {
    jobId: string
    progress: ProducerExportProgress
    lastProgressWrite: number
  }): number {
    const now = Date.now()
    const normalized = normalizeProgressUpdate(input.progress)
    if (
      normalized.status !== "completed" &&
      now - input.lastProgressWrite < 250
    ) {
      return input.lastProgressWrite
    }
    const timestamp = nowDate(this.options.now)
    this.updateJob(input.jobId, {
      status: normalized.status,
      progress: normalized.progress,
      progressLabel: normalized.progressLabel,
      durationSeconds: input.progress.durationSeconds
        ? Math.round(input.progress.durationSeconds)
        : undefined,
      width: input.progress.width,
      height: input.progress.height,
      updatedAt: timestamp,
    })
    return now
  }

  private appendLog(jobId: string, log: ProducerExportLog): void {
    const job = this.getJob(jobId)
    if (!job) return
    const line = `${log.level.toUpperCase()} ${log.message}`
    if (log.level === "error" || log.level === "warn") {
      this.updateJob(jobId, {
        stderrTail: trimExportLogTail(`${job.stderrTail}${line}\n`),
      })
      return
    }
    this.updateJob(jobId, {
      stdoutTail: trimExportLogTail(`${job.stdoutTail}${line}\n`),
    })
  }

  private markCancelled(jobId: string): void {
    const now = nowDate(this.options.now)
    this.updateJob(jobId, {
      status: "cancelled",
      progressLabel: "Cancelled",
      pid: null,
      errorMessage: null,
      cancelledAt: now,
      completedAt: now,
      updatedAt: now,
    })
  }

  private getCompletedOutputPath(jobId: string): string {
    this.recoverInterruptedJobs()
    const job = this.getJob(jobId)
    if (!job) {
      throw new HyperframesError("Export job not found.", "EXPORT_JOB_NOT_FOUND")
    }
    if (job.status !== "completed") {
      throw new HyperframesError(
        "This export is not ready yet.",
        "EXPORT_JOB_NOT_COMPLETED",
      )
    }
    const outputPath = getRippleExportDisplayPath(job)
    if (!outputPath) {
      throw new HyperframesError(
        "This export has no output path.",
        "EXPORT_OUTPUT_MISSING",
      )
    }
    return outputPath
  }

  private resolveComposition(input: {
    projectId: string
    compositionId?: string | null
  }): Composition {
    const db = this.db()
    if (input.compositionId) {
      const composition = db
        .select()
        .from(compositions)
        .where(and(
          eq(compositions.id, input.compositionId),
          eq(compositions.projectId, input.projectId),
        ))
        .get()
      if (composition) return composition
      throw new HyperframesError(
        "The selected composition is not available to export.",
        "EXPORT_COMPOSITION_MISSING",
      )
    }

    const fallback = db
      .select()
      .from(compositions)
      .where(eq(compositions.projectId, input.projectId))
      .orderBy(desc(compositions.updatedAt))
      .get()
    if (fallback) return fallback

    throw new HyperframesError(
      "No composition is available to export.",
      "EXPORT_COMPOSITION_MISSING",
    )
  }

  private resolveDestinationToken(input: {
    tokenId?: string | null
    projectId: string
    compositionId: string
    format: RippleExportFormat
  }): string | null {
    if (!input.tokenId) return null

    const token = this.destinationTokens.get(input.tokenId)
    this.destinationTokens.delete(input.tokenId)
    if (!token) {
      throw new HyperframesError(
        "Choose the export destination again.",
        "EXPORT_DESTINATION_TOKEN_MISSING",
      )
    }
    if (Date.now() - token.createdAt > 15 * 60 * 1000) {
      throw new HyperframesError(
        "Choose the export destination again.",
        "EXPORT_DESTINATION_TOKEN_EXPIRED",
      )
    }
    if (
      token.projectId !== input.projectId ||
      token.compositionId !== input.compositionId ||
      token.format !== input.format
    ) {
      throw new HyperframesError(
        "This destination belongs to a different export.",
        "EXPORT_DESTINATION_TOKEN_MISMATCH",
      )
    }

    assertDestinationMatchesFormat({ path: token.path, format: input.format })
    return token.path
  }

  private resolveStoredDestinationPath(input: {
    path: string
    format: RippleExportFormat
  }): string {
    const path = input.path.trim()
    if (!path) {
      throw new HyperframesError(
        "Choose the export destination again.",
        "EXPORT_DESTINATION_MISSING",
      )
    }
    const destinationPath = resolve(path)
    assertDestinationMatchesFormat({ path: destinationPath, format: input.format })
    return destinationPath
  }

  private db(): ExportDb {
    return this.options.db ?? getDatabase()
  }

  private resolveProjectContext(
    input: Parameters<ProjectContextResolver>[0],
  ): Promise<HyperframesProjectContext> {
    return (this.options.resolveProjectContext ?? resolveHyperframesProjectContext)(input)
  }

  private resolvePreviewContext(
    input: Parameters<PreviewContextResolver>[0],
  ): Promise<HyperframesProjectContext> {
    return (this.options.resolvePreviewContext ?? resolveHyperframesPreviewContext)(input)
  }

  private getJob(jobId: string): ExportJob | null {
    return this.db()
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId))
      .get() ?? null
  }

  private updateJob(
    jobId: string,
    values: Partial<typeof exportJobs.$inferInsert>,
  ): ExportJob | null {
    return this.db()
      .update(exportJobs)
      .set({
        ...values,
        updatedAt: values.updatedAt ?? nowDate(this.options.now),
      })
      .where(eq(exportJobs.id, jobId))
      .returning()
      .get() ?? null
  }
}

export const exportService = new ExportService()

export function recoverExportJobsOnStartup(): { interrupted: number } {
  return exportService.recoverInterruptedJobs()
}

export async function cancelAllExports(): Promise<RippleExportJobView[]> {
  return exportService.cancelAll()
}

export function buildDefaultExportFileName(input: {
  projectName: string
  compositionName: string
  format: RippleExportFormat
}): string {
  return `${safeExportStem(input.projectName)}-${safeExportStem(input.compositionName)}.${input.format}`
}
