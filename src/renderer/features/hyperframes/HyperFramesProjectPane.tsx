"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react"
import { useAtom } from "jotai"
import {
  AlertTriangle,
  Clapperboard,
  FileQuestion,
  Film,
  ImageIcon,
  Loader2,
  Music2,
  Plus,
  Type,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import {
  formatAssetSize,
  markActiveRippleProjectCompositions,
  type RippleProjectAssetItem,
  type RippleProjectAssetKind,
  type RippleProjectCompositionItem,
} from "../../../shared/hyperframes-project-model"
import {
  HYPERFRAMES_TIMELINE_ASSET_MIME,
  RIPPLE_TIMELINE_ASSET_MIME,
} from "../../../shared/hyperframes-timeline-editing"
import { Button } from "../../components/ui/button"
import { IconDoubleChevronLeft, IconOpenSidebar } from "../../components/ui/icons"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import { selectedProjectAtom, toSelectedProject } from "../agents/atoms"
import { TemplateChooserDialog } from "../templates/TemplateChooserDialog"
import {
  buildHyperframesPlayerFetchUrl,
  buildHyperframesThumbnailBlobDocument,
} from "./player-source-url"

interface HyperFramesProjectPaneProps {
  projectId: string
  activeCompositionId?: string | null
  onClose?: () => void
  onOpenProjectRail?: () => void
}

type WindowWithElectronWebUtils = Window & {
  webUtils?: {
    getPathForFile?: (file: File) => string
  }
}

const assetKindLabel: Record<RippleProjectAssetKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  font: "Font",
  other: "Asset",
}

function AssetIcon({
  kind,
  className,
}: {
  kind: RippleProjectAssetKind
  className?: string
}) {
  const iconClassName = cn("h-4 w-4", className)
  if (kind === "image") return <ImageIcon className={iconClassName} />
  if (kind === "video") return <Film className={iconClassName} />
  if (kind === "audio") return <Music2 className={iconClassName} />
  if (kind === "font") return <Type className={iconClassName} />
  return <FileQuestion className={iconClassName} />
}

function CompositionPreview({
  projectId,
  composition,
}: {
  projectId: string
  composition: RippleProjectCompositionItem
}) {
  const visibilityTimeoutRef = useRef<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [hasSampledPreview, setHasSampledPreview] = useState(false)
  const sourceQuery = trpc.hyperframes.getPlayerSource.useQuery(
    { projectId, compositionId: composition.id },
    {
      enabled: Boolean(projectId && composition.id),
      placeholderData: (previousData) => previousData,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  )

  useEffect(() => {
    const sourceUrl = sourceQuery.data?.source.sourceUrl
    if (!sourceUrl) {
      setPreviewUrl(null)
      return
    }
    const narrowedSourceUrl = sourceUrl

    let objectUrl: string | null = null
    const abortController = new AbortController()

    async function loadPreview() {
      try {
        const response = await fetch(buildHyperframesPlayerFetchUrl(narrowedSourceUrl, 0), {
          cache: "no-store",
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`Preview source request failed with ${response.status}`)
        }

        const html = await response.text()
        if (abortController.signal.aborted) return

        const documentHtml = buildHyperframesThumbnailBlobDocument({
          html,
          sourceUrl: narrowedSourceUrl,
        })
        objectUrl = URL.createObjectURL(new Blob([documentHtml], { type: "text/html" }))
        setPreviewUrl(objectUrl)
      } catch {
        if (!abortController.signal.aborted) {
          setPreviewUrl(null)
        }
      }
    }

    void loadPreview()

    return () => {
      abortController.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [sourceQuery.data?.source.sourceUrl])

  useEffect(() => {
    if (visibilityTimeoutRef.current !== null) {
      window.clearTimeout(visibilityTimeoutRef.current)
      visibilityTimeoutRef.current = null
    }
    setHasSampledPreview(false)
  }, [previewUrl])

  useEffect(() => {
    return () => {
      if (visibilityTimeoutRef.current !== null) {
        window.clearTimeout(visibilityTimeoutRef.current)
      }
    }
  }, [])

  const handlePreviewLoad = () => {
    if (visibilityTimeoutRef.current !== null) {
      window.clearTimeout(visibilityTimeoutRef.current)
    }
    visibilityTimeoutRef.current = window.setTimeout(() => {
      setHasSampledPreview(true)
      visibilityTimeoutRef.current = null
    }, 450)
  }

  const thumbnailWidth = 104
  const thumbnailHeight = 58
  const previewScale = Math.min(
    thumbnailWidth / composition.width,
    thumbnailHeight / composition.height,
  )
  const scaledWidth = composition.width * previewScale
  const scaledHeight = composition.height * previewScale

  return (
    <div className="relative flex h-[58px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-foreground/[0.045]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,hsl(var(--foreground)/0.14),hsl(var(--foreground)/0.04)_55%,hsl(var(--foreground)/0.02))]" />
      {previewUrl ? (
        <div
          className="relative overflow-hidden bg-black"
          style={{ width: scaledWidth, height: scaledHeight }}
        >
          <iframe
            title={`${compositionDisplayName(composition)} preview`}
            src={previewUrl}
            sandbox="allow-scripts"
            scrolling="no"
            onLoad={handlePreviewLoad}
            className={cn(
              "pointer-events-none block border-0 transition-opacity duration-150",
              hasSampledPreview ? "opacity-100" : "opacity-0",
            )}
            style={{
              width: composition.width,
              height: composition.height,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      ) : (
        <div className="relative h-8 w-14 overflow-hidden rounded-[3px] bg-foreground/[0.04]">
          <div className="absolute inset-x-1 bottom-1 h-1 rounded-full bg-primary/60" />
        </div>
      )}
    </div>
  )
}

function compositionDisplayName(composition: RippleProjectCompositionItem): string {
  const fileName = composition.filePath.split("/").pop() ?? composition.name
  return fileName.replace(/\.html$/i, "") || composition.name
}

function getPathForFile(file: File): string | undefined {
  return (window as WindowWithElectronWebUtils).webUtils?.getPathForFile?.(file) ??
    (file as File & { path?: string }).path
}

function CompositionRow({
  composition,
  disabled,
  onSelect,
  projectId,
}: {
  composition: RippleProjectCompositionItem
  disabled: boolean
  onSelect: (compositionId: string) => void
  projectId: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(composition.id)}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70 disabled:pointer-events-none disabled:opacity-70",
        composition.isActive
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      <CompositionPreview projectId={projectId} composition={composition} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">
          {compositionDisplayName(composition)}
        </span>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground/75">
          {composition.filePath}
        </div>
      </div>
    </button>
  )
}

function AssetPreview({ asset }: { asset: RippleProjectAssetItem }) {
  if (asset.kind === "image" && asset.previewUrl) {
    return (
      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border/70 bg-background">
        <img
          src={asset.previewUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
    )
  }

  return (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-sm border border-border/70 bg-background text-muted-foreground">
      <AssetIcon kind={asset.kind} />
    </div>
  )
}

function AssetRow({ asset }: { asset: RippleProjectAssetItem }) {
  const draggable = asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!draggable) return
    const payload = JSON.stringify({
      relativePath: asset.relativePath,
      label: asset.label,
      kind: asset.kind,
    })
    event.dataTransfer.effectAllowed = "copy"
    event.dataTransfer.setData(RIPPLE_TIMELINE_ASSET_MIME, payload)
    event.dataTransfer.setData(HYPERFRAMES_TIMELINE_ASSET_MIME, asset.relativePath)
    event.dataTransfer.setData("text/plain", asset.relativePath)
  }

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
      draggable={draggable}
      onDragStart={handleDragStart}
    >
      <AssetPreview asset={asset} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">
          {asset.label}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground/75">
          {asset.relativePath}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-normal text-muted-foreground/65">
          <span>{assetKindLabel[asset.kind]}</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/40" />
          <span>{formatAssetSize(asset.sizeBytes)}</span>
        </div>
      </div>
    </div>
  )
}

function PaneEmptyState({
  icon,
  title,
}: {
  icon: ReactNode
  title: string
}) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border/70 bg-background">
        {icon}
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
    </div>
  )
}

export function HyperFramesProjectPane({
  projectId,
  activeCompositionId,
  onClose,
  onOpenProjectRail,
}: HyperFramesProjectPaneProps) {
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [tab, setTab] = useState<"compositions" | "assets">("compositions")
  const [isDraggingAssets, setIsDraggingAssets] = useState(false)
  const [compositionChooserOpen, setCompositionChooserOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const utils = trpc.useUtils()
  const browserQuery = trpc.hyperframes.getProjectBrowserModel.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      retry: 1,
    },
  )
  const setActiveCompositionMutation = trpc.projects.setActiveComposition.useMutation({
    onMutate: ({ compositionId }) => {
      setSelectedProject((current) =>
        current && current.id === projectId
          ? { ...current, activeCompositionId: compositionId }
          : current,
      )
    },
    onSuccess: (project) => {
      if (project) {
        setSelectedProject(toSelectedProject(project))
      }
      void utils.projects.list.invalidate()
      void utils.projects.listCompositions.invalidate({ projectId })
    },
    onError: (error) => {
      if (selectedProject?.id === projectId) {
        setSelectedProject(selectedProject)
      }
      toast.error("Composition was not selected", {
        description: error.message,
      })
    },
  })
  const importAssetsMutation = trpc.hyperframes.importAssets.useMutation({
    onSuccess: (result) => {
      utils.hyperframes.getProjectBrowserModel.setData({ projectId }, result.model)

      if (result.imported.length > 0) {
        toast.success(
          result.imported.length === 1
            ? "Imported 1 media file"
            : `Imported ${result.imported.length} media files`,
        )
      }

      if (result.rejected.length > 0) {
        const firstRejected = result.rejected[0]
        toast.error(
          result.imported.length > 0 ? "Some media could not be imported" : "Media was not imported",
          {
            description: firstRejected
              ? `${firstRejected.reason}`
              : "The selected files could not be imported.",
          },
        )
      }
    },
    onError: (error) => {
      toast.error("Media was not imported", {
        description: error.message,
      })
    },
  })
  const createCompositionMutation = trpc.templates.createComposition.useMutation({
    onSuccess: (result) => {
      utils.hyperframes.getProjectBrowserModel.setData({ projectId }, result.model)
      setSelectedProject(toSelectedProject(result.project))
      setCompositionChooserOpen(false)
      setTab("compositions")
      void utils.projects.list.invalidate()
      void utils.projects.listCompositions.invalidate({ projectId })
      void utils.hyperframes.getPlayerSource.invalidate()
      void utils.hyperframes.getTimelineModel.invalidate()
      toast.success("Composition created", {
        description: result.composition.name,
      })
    },
    onError: (error) => {
      toast.error("Composition was not created", {
        description: error.message,
      })
    },
  })

  const model = browserQuery.data
  const compositions = model?.compositions ?? []
  const assets = model?.assets ?? []
  const activeId =
    selectedProject?.id === projectId
      ? selectedProject.activeCompositionId ?? activeCompositionId ?? model?.project.activeCompositionId
      : activeCompositionId ?? model?.project.activeCompositionId
  const displayedCompositions = useMemo(
    () => markActiveRippleProjectCompositions(compositions, activeId),
    [activeId, compositions],
  )
  const setupWarning =
    model?.project.setupStatus === "needs_environment" || model?.project.setupStatus === "error"
      ? model.project.setupError || "Preview setup needs attention."
      : null

  const handleSelectComposition = (compositionId: string) => {
    if (compositionId === activeId || setActiveCompositionMutation.isPending) return
    setActiveCompositionMutation.mutate({ projectId, compositionId })
  }

  const importFiles = useCallback((files: FileList | File[]) => {
    const sourcePaths = Array.from(files)
      .map((file) => getPathForFile(file) ?? "")
      .filter((path): path is string => path.length > 0)

    if (sourcePaths.length === 0) {
      toast.error("Media was not imported", {
        description: "Ripple could not read file paths for the selected media.",
      })
      return
    }

    importAssetsMutation.mutate({ projectId, sourcePaths })
  }, [importAssetsMutation, projectId])

  const handleAssetDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setIsDraggingAssets(true)
  }

  const handleAssetDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setIsDraggingAssets(false)
  }

  const handleAssetDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingAssets(false)
    if (event.dataTransfer.files.length > 0) {
      importFiles(event.dataTransfer.files)
    }
  }

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden bg-tl-background">
      <TemplateChooserDialog
        open={compositionChooserOpen}
        target="new-composition"
        title="New composition"
        actionLabel="Create Composition"
        isCreating={createCompositionMutation.isPending}
        onOpenChange={setCompositionChooserOpen}
        onCreate={(templateId) =>
          createCompositionMutation.mutate({
            projectId,
            templateId,
            setActive: true,
          })
        }
      />
      {setupWarning && (
        <div className="flex shrink-0 items-start gap-2 border-b border-border/60 px-3 py-2 text-[12px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-plan-mode" />
          <span className="line-clamp-2">{setupWarning}</span>
        </div>
      )}

      {browserQuery.isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-md px-2 py-2.5">
              <div className="h-[58px] w-[104px] rounded-md bg-foreground/5" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded-full bg-foreground/5" />
                <div className="h-2 w-full rounded-full bg-foreground/5" />
              </div>
            </div>
          ))}
        </div>
      ) : browserQuery.error ? (
        <PaneEmptyState
          icon={<AlertTriangle className="h-4 w-4" />}
          title={browserQuery.error.message}
        />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "compositions" | "assets")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="relative shrink-0 border-b border-border/60">
            {onOpenProjectRail && (
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onOpenProjectRail}
                    className="absolute left-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md p-0 text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground active:scale-[0.97]"
                    aria-label="Open project rail"
                  >
                    <IconOpenSidebar className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open project rail</TooltipContent>
              </Tooltip>
            )}
            <TabsList className={cn(
              "grid h-12 w-full grid-cols-2 rounded-none bg-transparent p-0 pr-9",
              onOpenProjectRail && "pl-9",
            )}>
              <TabsTrigger
                value="compositions"
                className="h-12 rounded-none border-b-2 border-transparent px-2 text-[12px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Compositions
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {compositions.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="assets"
                className="h-12 rounded-none border-b-2 border-transparent px-2 text-[12px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Assets
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {assets.length}
                </span>
              </TabsTrigger>
            </TabsList>
            {onClose && (
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md p-0 text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground active:scale-[0.97]"
                    aria-label="Close project pane"
                  >
                    <IconDoubleChevronLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close project pane</TooltipContent>
              </Tooltip>
            )}
          </div>

          <TabsContent value="compositions" className="m-0 min-h-0 flex-1 overflow-y-auto p-0">
            {displayedCompositions.length > 0 ? (
              <div className="space-y-2 p-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 w-full gap-1.5 text-[12px]"
                  disabled={createCompositionMutation.isPending}
                  onClick={() => setCompositionChooserOpen(true)}
                >
                  {createCompositionMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  New Composition
                </Button>
                {displayedCompositions.map((composition) => (
                  <CompositionRow
                    key={composition.id}
                    composition={composition}
                    disabled={setActiveCompositionMutation.isPending}
                    onSelect={handleSelectComposition}
                    projectId={projectId}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="shrink-0 border-b border-border/60 p-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 w-full gap-1.5 text-[12px]"
                    disabled={createCompositionMutation.isPending}
                    onClick={() => setCompositionChooserOpen(true)}
                  >
                    {createCompositionMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    New Composition
                  </Button>
                </div>
                <PaneEmptyState
                  icon={<Clapperboard className="h-4 w-4" />}
                  title="No compositions"
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="assets" className="m-0 min-h-0 flex-1">
            <div
              className={cn(
                "flex h-full min-h-0 flex-col transition-colors",
                isDraggingAssets && "bg-primary/[0.04]",
              )}
              onDragOver={handleAssetDragOver}
              onDragLeave={handleAssetDragLeave}
              onDrop={handleAssetDrop}
            >
              <div className="shrink-0 border-b border-border/60 px-4 py-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importAssetsMutation.isPending}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/70 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70 disabled:pointer-events-none disabled:opacity-60"
                >
                  {importAssetsMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Import media
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.currentTarget.files?.length) {
                      importFiles(event.currentTarget.files)
                    }
                    event.currentTarget.value = ""
                  }}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {assets.length > 0 ? (
                  <div className="space-y-2 p-3">
                    {assets.map((asset) => (
                      <AssetRow key={asset.id} asset={asset} />
                    ))}
                  </div>
                ) : (
                  <PaneEmptyState
                    icon={<Upload className="h-5 w-5" />}
                    title="Drop media files here"
                  />
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </aside>
  )
}
