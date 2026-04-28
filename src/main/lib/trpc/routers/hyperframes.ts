import { app } from "electron"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { checkRippleEnvironment } from "../../ripple-projects/environment"
import {
  captureHyperframesSnapshot,
  assertHyperframesProjectFiles,
  buildHyperframesPlayerSourceDocument,
  buildHyperframesProjectBrowserModel,
  buildHyperframesStaticTimelineModel,
  hyperframesRenderFormats,
  hyperframesRenderQualities,
  importHyperframesProjectAssets,
  listSavedHyperframesCompositions,
  previewManager,
  refreshHyperframesCompositions,
  renderManager,
  resolveHyperframesProjectContext,
  resolveHyperframesPreviewContext,
  runHyperframesCommand,
  selectHyperframesPlayerComposition,
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

const renderFpsInput = z.union([z.literal(24), z.literal(30), z.literal(60)])

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

async function resolvePreviewCompositions(input: {
  projectId: string
  revisionId?: string | null
}) {
  let context = await resolveHyperframesPreviewContext(input)
  assertHyperframesProjectFiles(context.projectPath)

  let compositions = await listSavedHyperframesCompositions(context.project.id)
  if (compositions.length === 0 || hasDuplicateCompositionFileRows(compositions)) {
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
      if (input.refreshCompositions || compositions.length === 0) {
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
      const compositions = await listSavedHyperframesCompositions(input.projectId)

      return {
        ...result,
        model: await buildHyperframesProjectBrowserModel({
          context,
          compositions,
        }),
      }
    }),

  getPlayerSource: publicProcedure
    .input(z.object({
      projectId: z.string(),
      revisionId: z.string().nullable().optional(),
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
        composition,
        source: buildHyperframesPlayerSourceDocument({ context, composition }),
      }
    }),

  getTimelineModel: publicProcedure
    .input(z.object({
      projectId: z.string(),
      revisionId: z.string().nullable().optional(),
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
      const context = await resolveHyperframesProjectContext({ projectId: input.projectId })
      const preview = await previewManager.start({
        context,
        forceRestart: input.forceRestart,
        repoRoot: getRepoRoot(),
      })
      return previewManager.waitUntilRunning(preview.key)
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

  render: publicProcedure
    .input(z.object({
      projectId: z.string(),
      format: z.enum(hyperframesRenderFormats).optional(),
      fps: renderFpsInput.optional(),
      quality: z.enum(hyperframesRenderQualities).optional(),
    }))
    .mutation(async ({ input }) => {
      const context = await resolveHyperframesProjectContext({ projectId: input.projectId })
      return renderManager.start({
        context,
        format: input.format ?? "mp4",
        fps: input.fps ?? 30,
        quality: input.quality ?? "standard",
        repoRoot: getRepoRoot(),
      })
    }),

  getRenderStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      return renderManager.getStatus(input.jobId)
    }),

  cancelRender: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ input }) => {
      return renderManager.cancel(input.jobId)
    }),
})
