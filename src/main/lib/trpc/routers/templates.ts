import { z } from "zod"
import { app } from "electron"
import { router, publicProcedure } from "../index"
import { captureAnalyticsEvent } from "../../analytics"
import { rippleTemplateTargets } from "../../../../shared/hyperframes-templates"
import {
  buildHyperframesProjectBrowserModel,
  resolveHyperframesProjectContext,
} from "../../hyperframes"
import { listRippleTemplateViews } from "../../hyperframes/templates/catalog"
import { createCompositionFromTemplate } from "../../hyperframes/templates/installer"

function getRepoRoot(): string | undefined {
  if (app.isPackaged) return undefined
  return app.getAppPath()
}

export const templatesRouter = router({
  list: publicProcedure
    .input(z.object({
      target: z.enum(rippleTemplateTargets).optional(),
    }).optional())
    .query(({ input }) => {
      return listRippleTemplateViews({
        target: input?.target,
      })
    }),

  createComposition: publicProcedure
    .input(z.object({
      projectId: z.string().min(1),
      templateId: z.string().min(1),
      setActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await createCompositionFromTemplate({
        projectId: input.projectId,
        templateId: input.templateId,
        setActive: input.setActive,
        repoRoot: getRepoRoot(),
      })
      captureAnalyticsEvent({
        name: "ripple_template_selected",
        properties: {
          template_id: input.templateId,
          template_category: "composition",
          target: "composition",
        },
      })
      captureAnalyticsEvent({
        name: "ripple_composition_created",
        properties: {
          creation_source: "template",
          result: "success",
          template_id: input.templateId,
          composition_kind: "html",
        },
      })
      const context = await resolveHyperframesProjectContext({
        projectId: input.projectId,
        allowArchived: true,
      })

      return {
        ...result,
        model: await buildHyperframesProjectBrowserModel({
          context: {
            ...context,
            project: result.project,
          },
          compositions: result.compositions,
        }),
      }
    }),
})
