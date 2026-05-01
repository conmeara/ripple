import { and, eq } from "drizzle-orm"
import { dialog, type SaveDialogOptions } from "electron"
import { join } from "node:path"
import { z } from "zod"
import {
  rippleExportFormats,
  rippleExportFpsValues,
  rippleExportQualityPresets,
  type RippleExportFormat,
} from "../../../../shared/ripple-exports"
import { compositions } from "../../db/schema"
import { getDatabase } from "../../db"
import { resolveHyperframesProjectContext } from "../../hyperframes/project-context"
import { HyperframesError } from "../../hyperframes/types"
import {
  buildDefaultExportFileName,
  exportService,
} from "../../exports"
import { publicProcedure, router } from "../index"

const exportFormatInput = z.enum(rippleExportFormats)
const exportFpsInput = z.union([
  z.literal(rippleExportFpsValues[0]),
  z.literal(rippleExportFpsValues[1]),
  z.literal(rippleExportFpsValues[2]),
])
const exportQualityInput = z.enum(rippleExportQualityPresets)

const exportSettingsInput = z.object({
  workers: z.union([z.number().int().min(1).max(16), z.literal("auto")]).nullable().optional(),
  useGpu: z.boolean().nullable().optional(),
  hdrMode: z.enum(["auto", "force-hdr", "force-sdr"]).nullable().optional(),
  crf: z.number().int().min(0).max(63).nullable().optional(),
  videoBitrate: z.string().min(1).max(20).nullable().optional(),
  debug: z.boolean().nullable().optional(),
}).optional()

function getCompositionForDestination(input: {
  projectId: string
  compositionId?: string | null
}) {
  const db = getDatabase()
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

  const composition = db
    .select()
    .from(compositions)
    .where(eq(compositions.projectId, input.projectId))
    .get()
  if (!composition) {
    throw new HyperframesError(
      "No composition is available to export.",
      "EXPORT_COMPOSITION_MISSING",
    )
  }
  return composition
}

export const exportsRouter = router({
  list: publicProcedure
    .input(z.object({
      projectId: z.string(),
      limit: z.number().int().min(1).max(200).optional(),
    }))
    .query(({ input }) => {
      return exportService.list(input)
    }),

  get: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      return exportService.get(input.jobId)
    }),

  activeCount: publicProcedure
    .input(z.object({ projectId: z.string().optional() }).optional())
    .query(({ input }) => {
      return exportService.getActiveCount(input?.projectId)
    }),

  chooseDestination: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      format: exportFormatInput,
    }))
    .mutation(async ({ input, ctx }) => {
      const projectContext = await resolveHyperframesProjectContext({
        projectId: input.projectId,
      })
      const composition = getCompositionForDestination(input)
      const fileName = buildDefaultExportFileName({
        projectName: projectContext.project.name,
        compositionName: composition.name,
        format: input.format,
      })

      const window = ctx.getWindow()
      const saveDialogOptions: SaveDialogOptions = {
        title: "Save export",
        defaultPath: join(projectContext.projectPath, "exports", fileName),
        buttonLabel: "Use Destination",
        filters: [
          {
            name: input.format.toUpperCase(),
            extensions: [input.format],
          },
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      }
      const result = window
        ? await dialog.showSaveDialog(window, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions)

      if (result.canceled || !result.filePath) {
        return null
      }

      const token = exportService.createDestinationToken({
        projectId: input.projectId,
        compositionId: composition.id,
        format: input.format as RippleExportFormat,
        path: result.filePath,
      })

      return {
        token: token.id,
        path: token.path,
      }
    }),

  start: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      chatId: z.string().nullable().optional(),
      revisionId: z.string().nullable().optional(),
      format: exportFormatInput.default("mp4"),
      fps: exportFpsInput.default(30),
      qualityPreset: exportQualityInput.default("standard"),
      settings: exportSettingsInput,
      destinationToken: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      return exportService.start({
        projectId: input.projectId,
        compositionId: input.compositionId,
        revisionId: input.revisionId,
        chatId: input.chatId,
        format: input.format,
        fps: input.fps,
        qualityPreset: input.qualityPreset,
        settings: input.settings,
        destinationToken: input.destinationToken,
      })
    }),

  cancel: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ input }) => {
      return exportService.cancel(input.jobId)
    }),

  retry: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ input }) => {
      return exportService.retry(input.jobId)
    }),

  clearCompleted: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(({ input }) => {
      return exportService.clearCompleted(input.projectId)
    }),

  remove: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ input }) => {
      return exportService.remove(input.jobId)
    }),

  revealOutput: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ input }) => {
      return exportService.revealOutput(input.jobId)
    }),

  openOutput: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ input }) => {
      return exportService.openOutput(input.jobId)
    }),
})
