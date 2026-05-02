"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Clapperboard, Play, Plus, Sparkles } from "lucide-react"
import {
  rippleTemplateCategories,
  type RippleTemplateCategory,
  type RippleTemplateTarget,
  type RippleTemplateView,
} from "../../../shared/hyperframes-templates"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { IconSpinner } from "../../components/ui/icons"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import { templateHasHoverPreview } from "./template-hover-preview"

interface TemplateGalleryProps {
  templates: RippleTemplateView[]
  selectedTemplateId: string
  onSelectTemplate: (templateId: string) => void
  disabled?: boolean
  compact?: boolean
}

interface TemplateChooserDialogProps {
  open: boolean
  target: RippleTemplateTarget
  title: string
  actionLabel: string
  isCreating?: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (templateId: string) => void
}

function categoryOrderForTemplates(templates: RippleTemplateView[]): RippleTemplateCategory[] {
  const available = new Set(templates.map((template) => template.category))
  return rippleTemplateCategories.filter((category) => available.has(category))
}

function useTemplateCategoryFilter(templates: RippleTemplateView[]) {
  const categories = useMemo(() => categoryOrderForTemplates(templates), [templates])
  const [category, setCategory] = useState<RippleTemplateCategory | "All">("All")
  const filteredTemplates = useMemo(() => {
    return category === "All"
      ? templates
      : templates.filter((template) => template.category === category)
  }, [category, templates])

  return {
    categories,
    category,
    filteredTemplates,
    setCategory,
  }
}

function TemplatePoster({
  template,
  previewActive,
}: {
  template: RippleTemplateView
  previewActive: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const timelineProgressRef = useRef<HTMLSpanElement | null>(null)
  const hasHoverPreview = templateHasHoverPreview(template)
  const hasMotionPreview = Boolean(template.previewVideoDataUrl)

  useEffect(() => {
    const video = videoRef.current
    const progress = timelineProgressRef.current
    if (!video) {
      progress?.style.setProperty("--template-preview-progress", "0")
      return
    }

    let animationFrame = 0
    const setProgress = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : template.durationSeconds
      const nextProgress = duration > 0
        ? Math.min(1, Math.max(0, video.currentTime / duration))
        : 0
      progress?.style.setProperty("--template-preview-progress", String(nextProgress))
    }
    const updateProgress = () => {
      setProgress()
      animationFrame = window.requestAnimationFrame(updateProgress)
    }
    const resetProgress = () => {
      progress?.style.setProperty("--template-preview-progress", "0")
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (previewActive && !reduceMotion) {
      video.currentTime = 0
      void video.play().catch(() => undefined)
      updateProgress()
      return () => window.cancelAnimationFrame(animationFrame)
    }

    video.pause()
    try {
      video.currentTime = 0
    } catch {
      // Metadata may not be loaded yet; the next active preview resets time again.
    }
    resetProgress()

    return () => window.cancelAnimationFrame(animationFrame)
  }, [previewActive, template.durationSeconds, template.previewVideoDataUrl])

  return (
    <div
      className="template-hover-preview-frame relative flex h-28 w-full items-center justify-center overflow-hidden border-b border-border/60 bg-foreground/[0.04]"
      style={{
        aspectRatio: `${template.width} / ${template.height}`,
        maxHeight: 144,
        minHeight: 96,
      }}
    >
      {template.previewPosterDataUrl ? (
        <img
          src={template.previewPosterDataUrl}
          alt=""
          className="template-hover-preview-poster h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <Clapperboard className="h-5 w-5 text-muted-foreground" />
      )}
      {hasHoverPreview && (
        <div
          aria-hidden="true"
          className="template-hover-preview-active pointer-events-none absolute inset-0 opacity-0"
        >
          {hasMotionPreview ? (
            <video
              ref={videoRef}
              src={template.previewVideoDataUrl ?? undefined}
              poster={template.previewPosterDataUrl ?? undefined}
              className="template-hover-preview-video h-full w-full object-cover"
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={template.previewPosterDataUrl ?? undefined}
              alt=""
              className="template-hover-preview-image h-full w-full object-cover"
              draggable={false}
            />
          )}
          <div className="template-hover-preview-shine absolute inset-y-0 -left-1/2 w-1/2" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-background/10" />
          <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white shadow-sm">
            <Play className="h-3 w-3 fill-current" />
          </div>
          <div className="template-hover-preview-timeline absolute bottom-2 left-2 right-2 h-1 overflow-hidden rounded-full bg-white/20">
            <span
              ref={timelineProgressRef}
              className={hasMotionPreview ? undefined : "template-hover-preview-progress-fallback"}
            />
          </div>
        </div>
      )}
      <div className="absolute bottom-2 right-2 rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
        {template.aspectRatioLabel}
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  selected,
  disabled,
  onSelect,
}: {
  template: RippleTemplateView
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  const [previewActive, setPreviewActive] = useState(false)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      onBlur={() => setPreviewActive(false)}
      onFocus={() => setPreviewActive(true)}
      onPointerEnter={() => setPreviewActive(true)}
      onPointerLeave={() => setPreviewActive(false)}
      className={cn(
        "group flex min-h-[218px] min-w-0 flex-col overflow-hidden rounded-md border bg-background text-left outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70 disabled:pointer-events-none disabled:opacity-60",
        selected
          ? "border-primary/80 bg-primary/[0.04]"
          : "border-border/70 hover:border-primary/50 hover:bg-foreground/[0.025]",
      )}
    >
      <TemplatePoster template={template} previewActive={previewActive} />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-foreground">
              {template.name}
            </div>
            <div className="mt-1 line-clamp-2 min-h-[32px] text-[11px] leading-4 text-muted-foreground">
              {template.description}
            </div>
          </div>
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-transparent",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/30",
            )}
          >
            <Check className="h-3 w-3" />
          </span>
        </div>
        <div className="mt-auto flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
          <span className="truncate">{template.category}</span>
          <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-muted-foreground/50" />
          <span className="shrink-0">{template.durationLabel}</span>
        </div>
      </div>
    </button>
  )
}

export function TemplateGallery({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  disabled,
  compact,
}: TemplateGalleryProps) {
  const {
    categories,
    category,
    filteredTemplates,
    setCategory,
  } = useTemplateCategoryFilter(templates)

  if (templates.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center rounded-md border border-border/70 bg-muted/20 text-sm text-muted-foreground">
        Loading templates
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <Button
          type="button"
          variant={category === "All" ? "secondary" : "ghost"}
          size="sm"
          disabled={disabled}
          onClick={() => setCategory("All")}
          className="h-7 shrink-0 px-2 text-[11px]"
        >
          All
        </Button>
        {categories.map((item) => (
          <Button
            key={item}
            type="button"
            variant={category === item ? "secondary" : "ghost"}
            size="sm"
            disabled={disabled}
            onClick={() => setCategory(item)}
            className="h-7 shrink-0 px-2 text-[11px]"
          >
            {item}
          </Button>
        ))}
      </div>
      <div
        className={cn(
          "grid gap-3",
          compact
            ? "grid-cols-[repeat(auto-fill,minmax(176px,1fr))]"
            : "grid-cols-[repeat(auto-fill,minmax(190px,1fr))]",
        )}
      >
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={template.id === selectedTemplateId}
            disabled={disabled}
            onSelect={() => onSelectTemplate(template.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function TemplateChooserDialog({
  open,
  target,
  title,
  actionLabel,
  isCreating,
  onOpenChange,
  onCreate,
}: TemplateChooserDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("blank")
  const templatesQuery = trpc.templates.list.useQuery(
    { target },
    {
      enabled: open,
      staleTime: 60_000,
    },
  )
  const templates = templatesQuery.data ?? []
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ??
    templates[0] ??
    null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[860px] gap-0 overflow-hidden rounded-lg p-0" showCloseButton={!isCreating}>
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-muted/30">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-base">{title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="max-h-[min(66vh,620px)] overflow-y-auto p-5">
          <TemplateGallery
            templates={templates}
            selectedTemplateId={selectedTemplate?.id ?? selectedTemplateId}
            onSelectTemplate={setSelectedTemplateId}
            disabled={isCreating || templatesQuery.isLoading}
            compact
          />
        </div>
        <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            disabled={isCreating}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedTemplate || isCreating}
            onClick={() => selectedTemplate && onCreate(selectedTemplate.id)}
            className="gap-2"
          >
            {isCreating ? (
              <IconSpinner className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
