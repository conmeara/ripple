import { app } from "electron"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { checkRippleEnvironment } from "../../ripple-projects/environment"
import {
  captureHyperframesSnapshot,
  assertHyperframesProjectFiles,
  buildHyperframesPlayerSourceDocument,
  hyperframesRenderFormats,
  hyperframesRenderQualities,
  listSavedHyperframesCompositions,
  previewManager,
  refreshHyperframesCompositions,
  renderManager,
  resolveHyperframesProjectContext,
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

  getPlayerSource: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
    }))
    .query(async ({ input }) => {
      let context = await resolveHyperframesProjectContext({ projectId: input.projectId })
      assertHyperframesProjectFiles(context.projectPath)

      let compositions = await listSavedHyperframesCompositions(input.projectId)
      if (compositions.length === 0) {
        const refreshed = await refreshHyperframesCompositions({
          projectId: input.projectId,
          repoRoot: getRepoRoot(),
        })
        context = { ...context, project: refreshed.project }
        compositions = refreshed.compositions
      }

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

  startPreview: publicProcedure
    .input(z.object({
      projectId: z.string(),
      forceRestart: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const context = await resolveHyperframesProjectContext({ projectId: input.projectId })
      return previewManager.start({
        context,
        forceRestart: input.forceRestart,
        repoRoot: getRepoRoot(),
      })
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
