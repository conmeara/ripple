"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  FolderOpen,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import {
  isRippleExportTerminalStatus,
  rippleExportFormats,
  rippleExportFormatDescriptions,
  rippleExportFpsValues,
  rippleExportQualityPresets,
  type RippleExportFormat,
  type RippleExportFps,
  type RippleExportJobView,
  type RippleExportQualityPreset,
} from "../../../shared/ripple-exports"
import { Button } from "../../components/ui/button"
import { Progress } from "../../components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import {
  getExportFileFacts,
  getExportFormatLabel,
  getExportPathLabel,
  getExportQualityLabel,
  getExportStatusLabel,
} from "./export-formatting"
import {
  getExportCompositionDetails,
  getExportCompositionName,
  isPreviewExportAvailable,
  resolveExportSource,
  type RippleExportTarget,
} from "./export-target"

function isActiveExport(job: RippleExportJobView): boolean {
  return job.status === "queued" ||
    job.status === "preparing" ||
    job.status === "running"
}

function formatCreatedAt(value: Date | null): string {
  if (!value) return ""
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value)
}

function statusClass(job: RippleExportJobView): string {
  switch (job.status) {
    case "completed":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "failed":
    case "interrupted":
      return "bg-destructive/10 text-destructive"
    case "cancelled":
      return "bg-foreground/10 text-muted-foreground"
    default:
      return "bg-primary/10 text-primary"
  }
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function ExportFormatOption({ format }: { format: RippleExportFormat }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
      <span className="text-xs font-medium leading-none">
        {getExportFormatLabel(format)}
      </span>
      <span
        data-desc
        className="max-w-[220px] whitespace-normal text-[11px] leading-snug text-muted-foreground"
      >
        {rippleExportFormatDescriptions[format]}
      </span>
    </span>
  )
}

function ExportSourceButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-7 min-w-0 flex-1 rounded-md px-2 text-[11px]",
        selected && "bg-background text-foreground shadow-sm",
      )}
    >
      <span className="truncate">{label}</span>
    </Button>
  )
}

function ExportJobRow({
  job,
  onCancel,
  onRetry,
  onRemove,
  onReveal,
  onOpen,
  busy,
}: {
  job: RippleExportJobView
  onCancel: (jobId: string) => void
  onRetry: (jobId: string) => void
  onRemove: (jobId: string) => void
  onReveal: (jobId: string) => void
  onOpen: (jobId: string) => void
  busy: boolean
}) {
  const active = isActiveExport(job)
  const facts = getExportFileFacts(job)
  const pathLabel = getExportPathLabel(job.displayPath)
  const title = job.sourceLabel || job.label
  const meta = [
    getExportFormatLabel(job.format),
    `${job.fps} fps`,
    facts,
  ].filter(Boolean).join(" · ")

  return (
    <div className="rounded-lg border border-border/70 bg-background/60 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-md border border-border/70 bg-black text-white">
          <Film className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {title}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>{meta}</span>
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                statusClass(job),
              )}
            >
              {getExportStatusLabel(job)}
            </span>
          </div>

          {active ? (
            <div className="mt-3 space-y-1.5">
              <Progress value={job.progress} className="h-1.5" />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{job.progress}%</span>
                <span>{formatCreatedAt(job.createdAt)}</span>
              </div>
            </div>
          ) : null}

          {job.errorMessage ? (
            <div className="mt-2 line-clamp-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[12px] text-destructive">
              {job.errorMessage}
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[11px] text-muted-foreground">
              {pathLabel}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {active ? (
                <IconButton
                  label="Cancel"
                  disabled={busy}
                  onClick={() => onCancel(job.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              ) : null}
              {job.status === "completed" ? (
                <>
                  <IconButton
                    label="Open"
                    disabled={busy}
                    onClick={() => onOpen(job.id)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Reveal"
                    disabled={busy}
                    onClick={() => onReveal(job.id)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </IconButton>
                </>
              ) : null}
              {job.status === "failed" || job.status === "interrupted" ? (
                <IconButton
                  label="Retry"
                  disabled={busy}
                  onClick={() => onRetry(job.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </IconButton>
              ) : null}
              {isRippleExportTerminalStatus(job.status) ? (
                <IconButton
                  label="Remove"
                  disabled={busy}
                  onClick={() => onRemove(job.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RippleRendersPane({
  projectId,
  compositionId,
  activePreviewRevisionId,
  activePreviewChatId,
}: {
  projectId: string
  compositionId?: string | null
  activePreviewRevisionId?: string | null
  activePreviewChatId?: string | null
}) {
  const trpcUtils = trpc.useUtils()
  const previewAvailable = isPreviewExportAvailable(
    activePreviewRevisionId,
    activePreviewChatId,
  )
  const [target, setTarget] = useState<RippleExportTarget>("main")
  const [format, setFormat] = useState<RippleExportFormat>("mp4")
  const [qualityPreset, setQualityPreset] =
    useState<RippleExportQualityPreset>("standard")
  const [fps, setFps] = useState<RippleExportFps>(30)
  const [destination, setDestination] = useState<{
    token: string
    path: string
  } | null>(null)

  const compositionsQuery = trpc.hyperframes.listCompositions.useQuery(
    { projectId, refresh: false },
    {
      enabled: Boolean(projectId),
      staleTime: 30_000,
    },
  )

  useEffect(() => {
    if (!previewAvailable && target === "preview") {
      setTarget("main")
    }
  }, [previewAvailable, target])

  useEffect(() => {
    setDestination(null)
  }, [projectId, compositionId, format])

  const jobsQuery = trpc.exports.list.useQuery(
    { projectId, limit: 60 },
    {
      enabled: Boolean(projectId),
      refetchInterval: 1500,
    },
  )

  const jobs = jobsQuery.data ?? []
  const activeJobs = useMemo(() => jobs.filter(isActiveExport), [jobs])
  const activeComposition = useMemo(
    () =>
      compositionsQuery.data?.compositions.find(
        (composition) => composition.id === compositionId,
      ) ?? null,
    [compositionId, compositionsQuery.data?.compositions],
  )
  const compositionName = getExportCompositionName(activeComposition)
  const compositionDetails = getExportCompositionDetails(activeComposition)
  const exportSource = resolveExportSource({
    target,
    activePreviewRevisionId,
    activePreviewChatId,
  })
  const sourceLabel = exportSource.label

  const invalidate = async () => {
    await Promise.all([
      trpcUtils.exports.list.invalidate({ projectId, limit: 60 }),
      trpcUtils.exports.activeCount.invalidate({ projectId }),
    ])
  }

  const chooseDestination = trpc.exports.chooseDestination.useMutation({
    onSuccess: (result) => {
      if (result) setDestination(result)
    },
    onError: (error) => {
      toast.error("Destination was not set", { description: error.message })
    },
  })

  const startExport = trpc.exports.start.useMutation({
    onSuccess: async () => {
      setDestination(null)
      await invalidate()
    },
    onError: (error) => {
      toast.error("Export was not started", { description: error.message })
    },
  })

  const cancelExport = trpc.exports.cancel.useMutation({
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  })
  const retryExport = trpc.exports.retry.useMutation({
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  })
  const removeExport = trpc.exports.remove.useMutation({
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  })
  const clearCompleted = trpc.exports.clearCompleted.useMutation({
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  })
  const revealOutput = trpc.exports.revealOutput.useMutation({
    onError: (error) => toast.error(error.message),
  })
  const openOutput = trpc.exports.openOutput.useMutation({
    onError: (error) => toast.error(error.message),
  })

  const qualityLocked = format === "mov" || format === "png-sequence"
  const effectiveQuality = qualityLocked ? "standard" : qualityPreset
  const canStart = Boolean(projectId && compositionId) && !startExport.isPending

  const handleStart = () => {
    if (!compositionId) return
    startExport.mutate({
      projectId,
      compositionId,
      revisionId: exportSource.revisionId,
      chatId: exportSource.chatId,
      format,
      fps,
      qualityPreset: effectiveQuality,
      destinationToken: destination?.token ?? null,
    })
  }

  const handleChooseDestination = () => {
    if (!compositionId) return
    chooseDestination.mutate({ projectId, compositionId, format })
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-tl-background"
      data-testid="ripple-renders-pane"
    >
      <div className="border-b border-border/60 px-3 pb-3">
        <div className="mb-3 flex h-9 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground">Renders</div>
            {activeJobs.length ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {activeJobs.length} running
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!jobs.some((job) => isRippleExportTerminalStatus(job.status))}
            onClick={() => clearCompleted.mutate({ projectId })}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Clear
          </Button>
        </div>

        <div className="mb-3 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2">
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-muted-foreground">
              <Clapperboard className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                <span>Source</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span className="normal-case">{sourceLabel}</span>
              </div>
              <div className="mt-0.5 truncate text-xs font-medium text-foreground">
                {compositionName}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {compositionDetails}
              </div>
            </div>
          </div>

          {previewAvailable ? (
            <div className="mt-2 flex gap-1 rounded-md bg-foreground/5 p-1">
              <ExportSourceButton
                selected={target === "main"}
                onClick={() => setTarget("main")}
                label="Main"
              />
              <ExportSourceButton
                selected={target === "preview"}
                onClick={() => setTarget("preview")}
                label="Current Preview"
              />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            value={format}
            onValueChange={(value) => setFormat(value as RippleExportFormat)}
          >
            <SelectTrigger className="h-8 rounded-md text-xs">
              <span className="truncate">{getExportFormatLabel(format)}</span>
            </SelectTrigger>
            <SelectContent className="w-64">
              {rippleExportFormats.map((option) => (
                <SelectItem
                  key={option}
                  value={option}
                  textValue={getExportFormatLabel(option)}
                >
                  <ExportFormatOption format={option} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(fps)}
            onValueChange={(value) => setFps(Number(value) as RippleExportFps)}
          >
            <SelectTrigger className="h-8 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rippleExportFpsValues.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} fps
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={effectiveQuality}
            disabled={qualityLocked}
            onValueChange={(value) =>
              setQualityPreset(value as RippleExportQualityPreset)
            }
          >
            <SelectTrigger className="h-8 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rippleExportQualityPresets.map((option) => (
                <SelectItem key={option} value={option}>
                  {getExportQualityLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!compositionId || chooseDestination.isPending}
            onClick={handleChooseDestination}
            className="h-8 justify-start gap-1.5 truncate rounded-md px-2 text-xs"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="truncate">
              {destination ? getExportPathLabel(destination.path) : "Project exports"}
            </span>
          </Button>
        </div>

        {format === "mov" ? (
          <div className="mt-2 text-[11px] leading-snug text-muted-foreground">
            MOV uses fixed ProRes quality for editor-friendly transparency.
          </div>
        ) : null}

        {format === "png-sequence" ? (
          <div className="mt-2 text-[11px] leading-snug text-muted-foreground">
            PNG sequence creates a folder of lossless frames and an audio sidecar when audio is present.
          </div>
        ) : null}

        <Button
          type="button"
          size="sm"
          disabled={!canStart}
          onClick={handleStart}
          className="mt-2 h-8 w-full gap-1.5 rounded-md text-xs"
          data-testid="ripple-export-button"
        >
          {startExport.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {jobsQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-6 text-center">
            <Film className="mb-3 h-5 w-5 text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">No renders yet</div>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <ExportJobRow
                key={job.id}
                job={job}
                busy={
                  cancelExport.isPending ||
                  retryExport.isPending ||
                  removeExport.isPending ||
                  revealOutput.isPending ||
                  openOutput.isPending
                }
                onCancel={(jobId) => cancelExport.mutate({ jobId })}
                onRetry={(jobId) => retryExport.mutate({ jobId })}
                onRemove={(jobId) => removeExport.mutate({ jobId })}
                onReveal={(jobId) => revealOutput.mutate({ jobId })}
                onOpen={(jobId) => openOutput.mutate({ jobId })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
