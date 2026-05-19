import { app } from "electron"
import { existsSync } from "node:fs"
import { resolve, sep } from "node:path"
import { z } from "zod"
import { bucketCount } from "../../../../shared/ripple-analytics"
import { router, publicProcedure } from "../index"
import {
  captureAnalyticsEvent,
  trackPreviewFailed,
  trackPreviewReady,
} from "../../analytics"
import { checkRippleEnvironment } from "../../ripple-projects/environment"
import {
  captureHyperframesSnapshot,
  assertHyperframesProjectFiles,
  buildHyperframesPlayerSourceDocument,
  buildHyperframesProjectBrowserModel,
  buildHyperframesStaticTimelineModel,
  insertHyperframesTimelineAsset,
  importHyperframesProjectAssets,
  listSavedHyperframesCompositions,
  previewManager,
  refreshHyperframesCompositions,
  resolveHyperframesProjectContext,
  resolveHyperframesPreviewContext,
  runHyperframesCommand,
  selectHyperframesPlayerComposition,
  updateHyperframesTimelineClip,
  type HyperframesCommandResult,
} from "../../hyperframes"

function getRepoRoot(): string | undefined {
  if (app.isPackaged) return undefined
  return app.getAppPath()
}

function commandResultFromError(error: unknown): HyperframesCommandResult {
  return {
    ok: false,
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
    error: error instanceof Error ? error : undefined,
  }
}

function hasDuplicateCompositionFileRows(
  compositions: Array<{ filePath: string }>,
): boolean {
  const seen = new Set<string>()
  return compositions.some((composition) => {
    if (seen.has(composition.filePath)) return true
    seen.add(composition.filePath)
    return false
  })
}

function isInsideProject(projectPath: string, filePath: string): boolean {
  const root = resolve(projectPath)
  const resolved = resolve(root, filePath)
  return resolved === root || resolved.startsWith(`${root}${sep}`)
}

function hasMissingCompositionFileRows(
  projectPath: string,
  compositions: Array<{ filePath: string }>,
): boolean {
  return compositions.some((composition) => {
    if (!isInsideProject(projectPath, composition.filePath)) return true
    return !existsSync(resolve(projectPath, composition.filePath))
  })
}

async function resolvePreviewCompositions(input: {
  projectId: string
  revisionId?: string | null
  chatId?: string | null
}) {
  let context = await resolveHyperframesPreviewContext(input)
  assertHyperframesProjectFiles(context.projectPath)

  let compositions = await listSavedHyperframesCompositions(context.project.id)
  if (
    compositions.length === 0 ||
    hasDuplicateCompositionFileRows(compositions) ||
    hasMissingCompositionFileRows(context.projectPath, compositions)
  ) {
    const refreshed = await refreshHyperframesCompositions({
      projectId: context.project.id,
      repoRoot: getRepoRoot(),
    })
    context = { ...context, project: refreshed.project }
    compositions = refreshed.compositions
  }

  return { context, compositions }
}

export const hyperframesRouter = router({
  doctor: publicProcedure
    .input(z.object({ projectId: z.string().optional() }).optional())
    .query(async () => {
      const repoRoot = getRepoRoot()
      const setup = await checkRippleEnvironment(repoRoot)
      const command = await runHyperframesCommand(["doctor"], {
        repoRoot,
        timeout: 20000,
      }).catch(commandResultFromError)

      return { setup, command }
    }),

  listCompositions: publicProcedure
    .input(z.object({ projectId: z.string(), refresh: z.boolean().optional() }))
    .query(async ({ input }) => {
      if (input.refresh === false) {
        const context = await resolveHyperframesProjectContext({
          projectId: input.projectId,
          allowArchived: true,
        })
        return {
          project: context.project,
          compositions: await listSavedHyperframesCompositions(input.projectId),
          cliCompositions: [],
          command: null,
        }
      }

      return refreshHyperframesCompositions({
        projectId: input.projectId,
        repoRoot: getRepoRoot(),
      })
    }),

  getProjectBrowserModel: publicProcedure
    .input(z.object({
      projectId: z.string(),
      refreshCompositions: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      let context = await resolveHyperframesProjectContext({
        projectId: input.projectId,
        allowArchived: true,
      })
      assertHyperframesProjectFiles(context.projectPath)

      let compositions = await listSavedHyperframesCompositions(input.projectId)
      if (
        input.refreshCompositions ||
        compositions.length === 0 ||
        hasMissingCompositionFileRows(context.projectPath, compositions)
      ) {
        const refreshed = await refreshHyperframesCompositions({
          projectId: input.projectId,
          repoRoot: getRepoRoot(),
        })
        context = { ...context, project: refreshed.project }
        compositions = refreshed.compositions
      }

      return buildHyperframesProjectBrowserModel({
        context,
        compositions,
      })
    }),

  importAssets: publicProcedure
    .input(z.object({
      projectId: z.string(),
      sourcePaths: z.array(z.string().min(1)).min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      const context = await resolveHyperframesProjectContext({
        projectId: input.projectId,
      })
      assertHyperframesProjectFiles(context.projectPath)

      const result = await importHyperframesProjectAssets({
        context,
        sourcePaths: input.sourcePaths,
      })
      captureAnalyticsEvent({
        name: "ripple_asset_imported",
        properties: {
          asset_kind: "mixed",
          result: "success",
          asset_count_bucket: bucketCount(input.sourcePaths.length),
        },
      })
      const compositions = await listSavedHyperframesCompositions(input.projectId)

      return {
        ...result,
        model: await buildHyperframesProjectBrowserModel({
          context,
          compositions,
        }),
      }
    }),

  insertAssetOnTimeline: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      assetPath: z.string().min(1),
      start: z.number().min(0),
      track: z.number().int().min(0),
      duration: z.number().min(0.05).max(7200).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { context, compositions } = await resolvePreviewCompositions({
        projectId: input.projectId,
      })
      const composition = selectHyperframesPlayerComposition({
        project: context.project,
        compositions,
        compositionId: input.compositionId,
      })

      if (!composition) {
        throw new Error("No HyperFrames composition is available for this project.")
      }

      const result = await insertHyperframesTimelineAsset({
        context,
        composition,
        assetPath: input.assetPath,
        start: input.start,
        track: input.track,
        duration: input.duration,
      })
      captureAnalyticsEvent({
        name: "ripple_timeline_interaction",
        properties: {
          action: "asset_inserted",
          target_kind: "asset_clip",
        },
      })
      return result
    }),

  updateTimelineClip: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      clip: z.object({
        key: z.string().nullable().optional(),
        sourceFile: z.string().nullable().optional(),
        domId: z.string().nullable().optional(),
        selector: z.string().nullable().optional(),
        selectorIndex: z.number().int().min(0).nullable().optional(),
        label: z.string().nullable().optional(),
        tagName: z.string().nullable().optional(),
        start: z.number().nullable().optional(),
        duration: z.number().nullable().optional(),
        track: z.number().nullable().optional(),
      }),
      start: z.number().min(0),
      duration: z.number().min(0.05).max(7200),
      track: z.number().int().min(0),
      playbackStart: z.number().min(0).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { context, compositions } = await resolvePreviewCompositions({
        projectId: input.projectId,
      })
      const composition = selectHyperframesPlayerComposition({
        project: context.project,
        compositions,
        compositionId: input.compositionId,
      })

      if (!composition) {
        throw new Error("No HyperFrames composition is available for this project.")
      }

      const result = await updateHyperframesTimelineClip({
        context,
        composition,
        clip: input.clip,
        start: input.start,
        duration: input.duration,
        track: input.track,
        playbackStart: input.playbackStart,
      })
      captureAnalyticsEvent({
        name: "ripple_timeline_interaction",
        properties: {
          action: "clip_updated",
          target_kind: "timeline_clip",
        },
      })
      return result
    }),

  getPlayerSource: publicProcedure
    .input(z.object({
      projectId: z.string(),
      revisionId: z.string().nullable().optional(),
      chatId: z.string().nullable().optional(),
      compositionId: z.string().nullable().optional(),
    }))
    .query(async ({ input }) => {
      const { context, compositions } = await resolvePreviewCompositions(input)

      const composition = selectHyperframesPlayerComposition({
        project: context.project,
        compositions,
        compositionId: input.compositionId,
      })

      if (!composition) {
        throw new Error("No HyperFrames composition is available for this project.")
      }

      return {
        project: context.project,
        projectPath: context.projectPath,
        composition,
        source: buildHyperframesPlayerSourceDocument({ context, composition }),
      }
    }),

  getTimelineModel: publicProcedure
    .input(z.object({
      projectId: z.string(),
      revisionId: z.string().nullable().optional(),
      chatId: z.string().nullable().optional(),
      compositionId: z.string().nullable().optional(),
    }))
    .query(async ({ input }) => {
      const { context, compositions } = await resolvePreviewCompositions(input)

      const composition = selectHyperframesPlayerComposition({
        project: context.project,
        compositions,
        compositionId: input.compositionId,
      })

      if (!composition) {
        throw new Error("No HyperFrames composition is available for this project.")
      }

      return {
        project: context.project,
        projectPath: context.projectPath,
        composition,
        model: buildHyperframesStaticTimelineModel({ context, composition }),
      }
    }),

  startPreview: publicProcedure
    .input(z.object({
      projectId: z.string(),
      forceRestart: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const startedAt = Date.now()
      const context = await resolveHyperframesProjectContext({ projectId: input.projectId })
      try {
        const preview = await previewManager.start({
          context,
          forceRestart: input.forceRestart,
          repoRoot: getRepoRoot(),
        })
        const running = await previewManager.waitUntilRunning(preview.key)
        trackPreviewReady({
          previewSource: input.forceRestart ? "restart_preview" : "start_preview",
          durationSeconds: (Date.now() - startedAt) / 1000,
          runtimeStatus: running.status,
        })
        return running
      } catch (error) {
        trackPreviewFailed({
          previewSource: input.forceRestart ? "restart_preview" : "start_preview",
          error,
        })
        throw error
      }
    }),

  stopPreview: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const context = await resolveHyperframesProjectContext({
        projectId: input.projectId,
        allowArchived: true,
      })
      return previewManager.stop(context.key)
    }),

  getPreviewStatus: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const context = await resolveHyperframesProjectContext({
        projectId: input.projectId,
        allowArchived: true,
      })
      return previewManager.getStatus(context.key)
    }),

  snapshot: publicProcedure
    .input(z.object({
      projectId: z.string(),
      frames: z.number().int().min(1).max(20).optional(),
      at: z.array(z.number().min(0)).min(1).max(20).optional(),
      timeout: z.number().int().min(1000).max(60000).optional(),
    }))
    .mutation(({ input }) => {
      return captureHyperframesSnapshot({
        projectId: input.projectId,
        frames: input.frames,
        at: input.at,
        timeout: input.timeout,
        repoRoot: getRepoRoot(),
      })
    }),

})
