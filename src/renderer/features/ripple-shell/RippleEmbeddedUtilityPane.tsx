"use client"

import { useRef, useState, type ReactNode } from "react"
import { Button } from "../../components/ui/button"
import {
  CollapseIcon,
  ExpandIcon,
  SearchIcon,
} from "../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { AgentsMcpTab } from "../../components/dialogs/settings-tabs/agents-mcp-tab"
import { ChangesPanel } from "../changes"
import { FileViewerSidebar } from "../file-viewer"
import { FilesTab } from "../details-sidebar/sections/files-tab"
import type { FilesTabHandle } from "../details-sidebar/sections/files-tab"
import { InfoSection } from "../details-sidebar/sections/info-section"
import { McpWidget } from "../details-sidebar/sections/mcp-widget"
import { PlanWidget } from "../details-sidebar/sections/plan-widget"
import { TerminalSection } from "../details-sidebar/sections/terminal-section"
import { TerminalWidget } from "../details-sidebar/sections/terminal-widget"
import { TodoWidget } from "../details-sidebar/sections/todo-widget"
import { ChangesWidget } from "../details-sidebar/sections/changes-widget"
import type { AgentMode } from "../agents/atoms"
import {
  AgentDiffView,
  type ParsedDiffFile,
} from "../agents/ui/agent-diff-view"
import { AgentPlanSidebar } from "../agents/ui/agent-plan-sidebar"
import type { RippleRightPaneMode, RippleUtilityMode } from "./ripple-shell-layout"

type RippleDiffStats = {
  additions: number
  deletions: number
  fileCount: number
  isLoading?: boolean
  hasChanges?: boolean
}

function getParsedDiffDisplayPath(file: ParsedDiffFile): string | null {
  const path = file.newPath && file.newPath !== "/dev/null"
    ? file.newPath
    : file.oldPath
  return path && path !== "/dev/null" ? path : null
}

function getFirstParsedDiffPath(files?: ParsedDiffFile[] | null): string | null {
  if (!files) return null
  for (const file of files) {
    const path = getParsedDiffDisplayPath(file)
    if (path) return path
  }
  return null
}

function RippleUtilityCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="mx-2 mb-2">
      <div className="overflow-hidden rounded-lg border border-border/50">
        <div className="flex h-8 items-center gap-2 bg-muted/30 px-2">
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

function RippleUtilityHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/50 bg-tl-background px-3">
      <div className="min-w-0 truncate text-sm font-medium text-foreground">
        {title}
      </div>
      {children ? <div className="flex items-center gap-0.5">{children}</div> : null}
    </div>
  )
}

function RippleUtilityEmptyState({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-1 items-center justify-center px-6 text-center">
      <div className="text-sm text-muted-foreground">{title}</div>
    </div>
  )
}

export function RippleEmbeddedUtilityPane({
  mode,
  chatId,
  worktreePath,
  remoteInfo,
  currentMode,
  activeSubChatId,
  currentPlanPath,
  planEditRefetchTrigger,
  fileViewerPath,
  canOpenDiff,
  diffStats,
  diffContent,
  parsedFileDiffs,
  prefetchedFileContents,
  selectedDiffFilePath,
  gitStatus,
  isGitStatusLoading,
  branchName,
  subChatsWithFiles,
  onBuildPlan,
  onCommit,
  onCommitAndPush,
  isCommitting,
  onOpenFile,
  onSelectDiffFile,
  onModeChange,
  onRefreshDiff,
  onDiffStatsChange,
}: {
  mode: RippleUtilityMode
  chatId: string
  worktreePath: string | null
  remoteInfo: {
    repository?: string
    branch?: string | null
    sandboxId?: string
  } | null
  currentMode: AgentMode
  activeSubChatId?: string | null
  currentPlanPath: string | null
  planEditRefetchTrigger?: number
  fileViewerPath: string | null
  canOpenDiff: boolean
  diffStats?: RippleDiffStats | null
  diffContent?: string | null
  parsedFileDiffs?: ParsedDiffFile[] | null
  prefetchedFileContents?: Record<string, string>
  selectedDiffFilePath?: string | null
  gitStatus?: {
    pushCount?: number
    pullCount?: number
    hasUpstream?: boolean
  } | null
  isGitStatusLoading?: boolean
  branchName?: string
  subChatsWithFiles: Array<{
    id: string
    name: string
    filePaths: string[]
    fileCount: number
    updatedAt: string
  }>
  onBuildPlan?: () => void
  onCommit?: (selectedPaths: string[]) => void
  onCommitAndPush?: (selectedPaths: string[]) => void
  isCommitting?: boolean
  onOpenFile: (filePath: string | null) => void
  onSelectDiffFile: (filePath: string) => void
  onModeChange?: (mode: RippleRightPaneMode) => void
  onRefreshDiff?: () => void
  onDiffStatsChange?: (stats: Required<RippleDiffStats>) => void
}) {
  const filesTabRef = useRef<FilesTabHandle>(null)
  const [filesAllExpanded, setFilesAllExpanded] = useState(false)

  if (mode === "details") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-tl-background py-2">
        <RippleUtilityCard title="Project">
          <InfoSection
            chatId={chatId}
            worktreePath={worktreePath}
            remoteInfo={remoteInfo}
          />
        </RippleUtilityCard>
        <TodoWidget subChatId={activeSubChatId || null} />
        {currentPlanPath ? (
          <PlanWidget
            chatId={chatId}
            activeSubChatId={activeSubChatId}
            planPath={currentPlanPath}
            refetchTrigger={planEditRefetchTrigger}
            mode={currentMode}
            onApprovePlan={onBuildPlan}
            onExpandPlan={() => onModeChange?.("plan")}
          />
        ) : null}
        {worktreePath ? (
          <TerminalWidget
            chatId={chatId}
            cwd={worktreePath}
            workspaceId={chatId}
            onExpand={() => onModeChange?.("terminal")}
          />
        ) : null}
        {canOpenDiff || diffStats ? (
          <ChangesWidget
            chatId={chatId}
            worktreePath={worktreePath}
            diffStats={diffStats}
            parsedFileDiffs={parsedFileDiffs}
            onCommit={worktreePath ? onCommit : undefined}
            onCommitAndPush={worktreePath ? onCommitAndPush : undefined}
            isCommitting={isCommitting}
            pushCount={gitStatus?.pushCount ?? 0}
            pullCount={gitStatus?.pullCount ?? 0}
            hasUpstream={gitStatus?.hasUpstream ?? true}
            isSyncStatusLoading={isGitStatusLoading}
            currentBranch={branchName}
            onExpand={() => onModeChange?.("changes")}
            onFileSelect={(filePath) => {
              onSelectDiffFile(filePath)
              onModeChange?.("changes")
            }}
          />
        ) : null}
        <RippleUtilityCard title="MCP Servers">
          <McpWidget />
        </RippleUtilityCard>
      </div>
    )
  }

  if (mode === "files") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-tl-background">
        {fileViewerPath && worktreePath ? (
          <FileViewerSidebar
            filePath={fileViewerPath}
            projectPath={worktreePath}
            onClose={() => onOpenFile(null)}
          />
        ) : (
          <>
            <RippleUtilityHeader title="Files">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md p-0 text-muted-foreground"
                    aria-label="Search files"
                    onClick={() => filesTabRef.current?.openSearch()}
                  >
                    <SearchIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Search files</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md p-0 text-muted-foreground"
                    aria-label={filesAllExpanded ? "Collapse all" : "Expand all"}
                    onClick={() => filesTabRef.current?.toggleExpandCollapse()}
                  >
                    {filesAllExpanded ? (
                      <CollapseIcon className="h-3.5 w-3.5" />
                    ) : (
                      <ExpandIcon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {filesAllExpanded ? "Collapse all" : "Expand all"}
                </TooltipContent>
              </Tooltip>
            </RippleUtilityHeader>
            <FilesTab
              ref={filesTabRef}
              worktreePath={worktreePath}
              onSelectFile={onOpenFile}
              onExpandedStateChange={setFilesAllExpanded}
              currentViewerFilePath={fileViewerPath}
              className="min-h-0 flex-1"
            />
          </>
        )}
      </div>
    )
  }

  if (mode === "changes") {
    if (!worktreePath) {
      return <RippleUtilityEmptyState title="No local changes available" />
    }

    const hasParsedDiffs = Array.isArray(parsedFileDiffs)
    const initialDiff = hasParsedDiffs ? null : diffContent ?? undefined
    const initialSelectedFile =
      selectedDiffFilePath ?? getFirstParsedDiffPath(parsedFileDiffs)

    return (
      <div className="flex h-full min-h-0 flex-col bg-tl-background">
        <div className="h-[45%] min-h-[200px] shrink-0 overflow-hidden border-b border-border/50">
          <ChangesPanel
            worktreePath={worktreePath}
            chatId={chatId}
            selectedFilePath={selectedDiffFilePath}
            onFileSelect={(file) => {
              onSelectDiffFile(file.path)
            }}
            onFileOpenPinned={(file) => {
              onOpenFile(`${worktreePath}/${file.path}`)
            }}
            onCommitSuccess={onRefreshDiff}
            onDiscardSuccess={onRefreshDiff}
            subChats={subChatsWithFiles}
            pushCount={gitStatus?.pushCount ?? 0}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-background">
          <AgentDiffView
            chatId={chatId}
            sandboxId=""
            worktreePath={worktreePath}
            initialDiff={initialDiff}
            initialParsedFiles={parsedFileDiffs ?? null}
            prefetchedFileContents={prefetchedFileContents}
            showFooter={false}
            onStatsChange={onDiffStatsChange}
            initialSelectedFile={initialSelectedFile}
          />
        </div>
      </div>
    )
  }

  if (mode === "plan") {
    return (
      <AgentPlanSidebar
        chatId={activeSubChatId || chatId}
        planPath={currentPlanPath}
        onClose={() => onModeChange?.("chat")}
        onBuildPlan={onBuildPlan}
        refetchTrigger={planEditRefetchTrigger}
        mode={currentMode}
      />
    )
  }

  if (mode === "terminal") {
    if (!worktreePath) {
      return <RippleUtilityEmptyState title="No terminal available" />
    }

    return (
      <div className="flex h-full min-h-0 flex-col bg-tl-background">
        <RippleUtilityHeader title="Terminal" />
        <div className="min-h-0 flex-1 overflow-hidden">
          <TerminalSection
            chatId={chatId}
            cwd={worktreePath}
            workspaceId={chatId}
            isExpanded
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 bg-tl-background">
      <AgentsMcpTab compact />
    </div>
  )
}
