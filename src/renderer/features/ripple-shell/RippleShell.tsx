"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect } from "react"
import { useAtom, useAtomValue } from "jotai"
import {
  CirclePlay,
  MoreHorizontal,
} from "lucide-react"
import {
  TbLayoutDistributeVertical,
  TbLayoutSidebar,
  TbLayoutSidebarRight,
} from "react-icons/tb"
import { Button } from "../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { Kbd } from "../../components/ui/kbd"
import { ResizableSidebar } from "../../components/ui/resizable-sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { isDesktopAtom, isFullscreenAtom } from "../../lib/atoms"
import { useResolvedHotkeyDisplay } from "../../lib/hotkeys"
import { cn } from "../../lib/utils"
import { TrafficLights } from "../agents/components/traffic-light-spacer"
import {
  hyperframesProjectPaneWidthAtom,
  type SelectedProject,
} from "../agents/atoms"
import { ChatView } from "../agents/main/active-chat"
import { HyperFramesPreviewPlayer } from "../hyperframes/HyperFramesPreviewPlayer"
import { HyperFramesProjectPane } from "../hyperframes/HyperFramesProjectPane"
import {
  RippleReviewPane,
  UtilityModeIcon,
  rightPaneLabels,
} from "./RippleReviewPane"
import {
  rippleShellAssetsPanelOpenAtom,
  rippleShellCenterStageOpenAtom,
  rippleShellReviewPaneOpenAtom,
  rippleShellRightPaneModeAtom,
} from "./ripple-shell-atoms"
import {
  applyRippleShellShortcut,
  getRippleReviewContentKey,
  RIPPLE_UTILITY_MODES,
  resolveRippleShellState,
  setRippleRightPaneMode,
  toggleRippleShellPanel,
  type RippleRightPaneMode,
  type RippleShellPanel,
  type RippleShellState,
} from "./ripple-shell-layout"

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  )
}

function PanelToggleButton({
  label,
  shortcut,
  active,
  onClick,
  children,
}: {
  label: string
  shortcut: string
  active: boolean
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
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            "h-7 w-7 rounded-md border border-transparent bg-transparent p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground",
            active && "text-primary",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        <span className="ml-2 text-[10px] text-muted-foreground">
          {shortcut}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

function UtilityMenuButton({
  activeMode,
  active,
  onModeChange,
}: {
  activeMode: RippleRightPaneMode
  active: boolean
  onModeChange: (mode: RippleRightPaneMode) => void
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-md p-0 text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground",
                active && "bg-foreground/[0.10] text-foreground",
              )}
              aria-label="Right pane pages"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Right pane pages</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        {RIPPLE_UTILITY_MODES.map((utilityMode) => (
          <DropdownMenuItem
            key={utilityMode}
            className={cn(
              "gap-2",
              activeMode === utilityMode && "bg-foreground/5",
            )}
            onSelect={() => onModeChange(utilityMode)}
          >
            <UtilityModeIcon mode={utilityMode} />
            {rightPaneLabels[utilityMode]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RippleShell({
  selectedProject,
  chatId,
  isSidebarOpen,
  onToggleSidebar,
  selectedTeamName,
  selectedTeamImageUrl,
}: {
  selectedProject: NonNullable<SelectedProject>
  chatId: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  selectedTeamName?: string
  selectedTeamImageUrl?: string
}) {
  const toggleSidebarHotkey = useResolvedHotkeyDisplay("toggle-sidebar")
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)
  const [assetsPanelOpen, setAssetsPanelOpen] = useAtom(
    rippleShellAssetsPanelOpenAtom,
  )
  const [centerStageOpen, setCenterStageOpen] = useAtom(
    rippleShellCenterStageOpenAtom,
  )
  const [reviewPaneOpen, setReviewPaneOpen] = useAtom(
    rippleShellReviewPaneOpenAtom,
  )
  const [rightPaneMode, setRightPaneModeAtom] = useAtom(
    rippleShellRightPaneModeAtom,
  )
  const shellState = resolveRippleShellState({
    assetsPanelOpen,
    centerStageOpen,
    reviewPaneOpen,
    rightPaneMode,
  })

  const commitShellState = useCallback(
    (nextState: RippleShellState) => {
      const resolved = resolveRippleShellState(nextState)
      setAssetsPanelOpen(resolved.assetsPanelOpen)
      setCenterStageOpen(resolved.centerStageOpen)
      setReviewPaneOpen(resolved.reviewPaneOpen)
      setRightPaneModeAtom(resolved.rightPaneMode)
    },
    [
      setAssetsPanelOpen,
      setCenterStageOpen,
      setReviewPaneOpen,
      setRightPaneModeAtom,
    ],
  )

  const togglePanel = useCallback((panel: RippleShellPanel) => {
    commitShellState(toggleRippleShellPanel(shellState, panel))
  }, [commitShellState, shellState])

  const handleModeChange = useCallback((mode: RippleRightPaneMode) => {
    commitShellState(setRippleRightPaneMode(shellState, mode))
  }, [commitShellState, shellState])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return

      const key = event.key.toLowerCase()
      if (key === "a") {
        event.preventDefault()
        commitShellState(applyRippleShellShortcut(shellState, "toggle-assets"))
      } else if (key === "p") {
        event.preventDefault()
        commitShellState(applyRippleShellShortcut(shellState, "toggle-center"))
      } else if (key === "r") {
        event.preventDefault()
        commitShellState(applyRippleShellShortcut(shellState, "toggle-review"))
      } else if (key === "c") {
        event.preventDefault()
        commitShellState(applyRippleShellShortcut(shellState, "show-chat"))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [commitShellState, shellState])

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background">
      {!isSidebarOpen && (
        <TrafficLights
          isFullscreen={isFullscreen}
          isDesktop={isDesktop}
          className="absolute left-[15px] top-[12px] z-20"
        />
      )}
      <div
        className={cn(
          "drag-region flex h-[44px] shrink-0 items-center justify-between border-b border-border/60 bg-tl-background pr-2.5",
          isSidebarOpen ? "pl-3" : "pl-[78px]",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {!isSidebarOpen && (
            <div className="no-drag">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Open sidebar"
                    onClick={onToggleSidebar}
                    className="h-7 w-7 rounded-md border border-transparent bg-transparent p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
                  >
                    <TbLayoutSidebar className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Open sidebar
                  {toggleSidebarHotkey && <Kbd>{toggleSidebarHotkey}</Kbd>}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          <div className="min-w-0 truncate text-sm font-semibold text-foreground/90">
            {selectedProject.name}
          </div>
        </div>

        <div className="no-drag flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled
                className="h-7 gap-1.5 rounded-md px-2 text-xs text-muted-foreground"
              >
                <CirclePlay className="h-3 w-3" />
                Renders
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Renders</TooltipContent>
          </Tooltip>

          <UtilityMenuButton
            activeMode={shellState.rightPaneMode}
            active={
              shellState.reviewPaneOpen &&
              shellState.rightPaneMode !== "chat" &&
              shellState.rightPaneMode !== "comments"
            }
            onModeChange={handleModeChange}
          />

          <div className="flex items-center gap-0">
            <PanelToggleButton
              label="Toggle assets"
              shortcut="Shift+Cmd+A"
              active={shellState.assetsPanelOpen}
              onClick={() => togglePanel("assets")}
            >
              <TbLayoutSidebar className="h-3.5 w-3.5" />
            </PanelToggleButton>

            <PanelToggleButton
              label="Toggle preview"
              shortcut="Shift+Cmd+P"
              active={shellState.centerStageOpen}
              onClick={() => togglePanel("center")}
            >
              <TbLayoutDistributeVertical className="h-3.5 w-3.5" />
            </PanelToggleButton>

            <PanelToggleButton
              label="Toggle review"
              shortcut="Shift+Cmd+R"
              active={shellState.reviewPaneOpen}
              onClick={() => togglePanel("review")}
            >
              <TbLayoutSidebarRight className="h-3.5 w-3.5" />
            </PanelToggleButton>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <ResizableSidebar
          isOpen={shellState.assetsPanelOpen}
          onClose={() => togglePanel("assets")}
          widthAtom={hyperframesProjectPaneWidthAtom}
          minWidth={260}
          maxWidth={380}
          side="left"
          animationDuration={0.18}
          initialWidth={0}
          exitWidth={0}
          disableClickToClose={true}
          className="border-r bg-tl-background"
          style={{ borderRightWidth: "0.5px" }}
        >
          <HyperFramesProjectPane
            projectId={selectedProject.id}
            activeCompositionId={selectedProject.activeCompositionId}
            onClose={() => togglePanel("assets")}
          />
        </ResizableSidebar>

        {shellState.centerStageOpen ? (
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-black">
            <HyperFramesPreviewPlayer
              projectId={selectedProject.id}
              compositionId={selectedProject.activeCompositionId}
            />
          </main>
        ) : null}

        <div
          className={cn(
            shellState.reviewPaneOpen ? "flex" : "hidden",
            !shellState.centerStageOpen && "min-w-0 flex-1",
          )}
        >
          <RippleReviewPane
            mode={shellState.rightPaneMode}
            onModeChange={handleModeChange}
            expanded={!shellState.centerStageOpen}
          >
            <ChatView
              key={getRippleReviewContentKey(chatId, shellState.rightPaneMode)}
              chatId={chatId}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={onToggleSidebar}
              selectedTeamName={selectedTeamName}
              selectedTeamImageUrl={selectedTeamImageUrl}
              hideHeader={true}
              suppressSecondarySidebars={true}
              rightPaneMode={shellState.rightPaneMode}
              onRightPaneModeChange={handleModeChange}
            />
          </RippleReviewPane>
        </div>
      </div>
    </div>
  )
}
