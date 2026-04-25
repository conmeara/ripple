import { toast } from "sonner"

interface ProjectSetupToastInput {
  setup?: {
    status?: string | null
    summary?: string | null
  } | null
}

export function showProjectSetupNotice(result: ProjectSetupToastInput): void {
  if (!result.setup?.summary || result.setup.status === "ready") return

  toast.warning("Video tools are still being prepared", {
    description: result.setup.summary,
  })
}
