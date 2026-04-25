import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { useAtomValue, useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { Button, buttonVariants } from "../../ui/button"
import { Input } from "../../ui/input"
import { Archive, RotateCcw, Trash2, FolderOpen, Plus } from "lucide-react"
import { ExternalLinkIcon, FolderFilledIcon, ImageIcon } from "../../ui/icons"
import { invalidateProjectIcon, useProjectIcon } from "../../../lib/hooks/use-project-icon"
import { showProjectSetupNotice } from "../../../lib/project-setup-toast"
import finderIcon from "../../../assets/app-icons/finder.png"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import {
  previousAgentChatIdAtom,
  selectedAgentChatIdAtom,
  selectedChatIsRemoteAtom,
  selectedDraftIdAtom,
  selectedProjectAtom,
  settingsProjectsSidebarWidthAtom,
  showNewChatFormAtom,
  toSelectedProject,
  type SelectedProject,
} from "../../../features/agents/atoms"
import { useAgentSubChatStore } from "../../../features/agents/stores/sub-chat-store"

function useClearSelectedThreadState() {
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedChatIsRemote = useSetAtom(selectedChatIsRemoteAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setPreviousChatId = useSetAtom(previousAgentChatIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)

  return useCallback(() => {
    if (selectedChatId) {
      window.desktopApi?.releaseChat?.(selectedChatId)
    }
    setSelectedChatId(null)
    setSelectedChatIsRemote(false)
    setSelectedDraftId(null)
    setPreviousChatId(null)
    setShowNewChatForm(true)
    useAgentSubChatStore.getState().reset()
  }, [
    selectedChatId,
    setPreviousChatId,
    setSelectedChatId,
    setSelectedChatIsRemote,
    setSelectedDraftId,
    setShowNewChatForm,
  ])
}

// --- Detail Panel ---
function ProjectDetail({
  projectId,
  onProjectUnavailable,
  fallbackProject,
}: {
  projectId: string
  onProjectUnavailable: () => void
  fallbackProject: NonNullable<SelectedProject> | null
}) {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const setSelectedProject = useSetAtom(selectedProjectAtom)
  const clearSelectedThreadState = useClearSelectedThreadState()
  const utils = trpc.useUtils()

  // Get project info
  const { data: project, refetch: refetchProject } = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: !!projectId },
  )

  // Cached project icon
  const { src: iconSrc } = useProjectIcon(project)

  // Rename mutation
  const renameMutation = trpc.projects.rename.useMutation({
    onSuccess: () => {
      refetchProject()
      toast.success("Project renamed")
    },
    onError: (err) => {
      toast.error(`Failed to rename: ${err.message}`)
    },
  })

  const refreshProjectLists = () => {
    utils.projects.list.invalidate()
    utils.projects.listArchived.invalidate()
    utils.chats.list.invalidate()
    utils.chats.listArchived.invalidate()
  }

  const hideCurrentProject = useCallback(() => {
    if (selectedProject?.id !== projectId) return

    setSelectedProject(fallbackProject)
    clearSelectedThreadState()
  }, [
    clearSelectedThreadState,
    fallbackProject,
    projectId,
    selectedProject?.id,
    setSelectedProject,
  ])

  const archiveMutation = trpc.projects.archive.useMutation({
    onSuccess: () => {
      toast.success("Project archived")
      refreshProjectLists()
      hideCurrentProject()
      onProjectUnavailable()
    },
    onError: (err) => {
      toast.error(`Failed to archive project: ${err.message}`)
    },
  })

  const restoreMutation = trpc.projects.restore.useMutation({
    onSuccess: (restoredProject) => {
      toast.success("Project restored")
      if (restoredProject) {
        setSelectedProject(toSelectedProject(restoredProject))
      }
      refetchProject()
      refreshProjectLists()
      onProjectUnavailable()
    },
    onError: (err) => {
      toast.error(`Failed to restore project: ${err.message}`)
    },
  })

  const removeMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("Project removed from list")
      refreshProjectLists()
      hideCurrentProject()
      onProjectUnavailable()
    },
    onError: (err) => {
      toast.error(`Failed to remove project: ${err.message}`)
    },
  })

  const deleteFilesMutation = trpc.projects.deleteFiles.useMutation({
    onSuccess: () => {
      toast.success("Project files moved to Trash")
      refreshProjectLists()
      hideCurrentProject()
      onProjectUnavailable()
    },
    onError: (err) => {
      toast.error(`Failed to delete project files: ${err.message}`)
    },
  })

  // Icon mutations
  const uploadIconMutation = trpc.projects.uploadIcon.useMutation({
    onSuccess: (data) => {
      if (!data) return // User cancelled file picker
      invalidateProjectIcon(projectId)
      refetchProject()
      toast.success("Icon updated")
    },
    onError: (err) => {
      toast.error(`Failed to upload icon: ${err.message}`)
    },
  })

  const removeIconMutation = trpc.projects.removeIcon.useMutation({
    onSuccess: () => {
      invalidateProjectIcon(projectId)
      refetchProject()
      toast.success("Icon removed")
    },
  })

  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [showDeleteFilesDialog, setShowDeleteFilesDialog] = useState(false)
  const [deleteFilesConfirmation, setDeleteFilesConfirmation] = useState("")

  // Project name editing
  const [projectName, setProjectName] = useState("")
  const savedNameRef = useRef("")

  useEffect(() => {
    if (project?.name) {
      setProjectName(project.name)
      savedNameRef.current = project.name
    }
  }, [project?.name])

  const handleNameBlur = useCallback(async () => {
    const trimmed = projectName.trim()
    if (!trimmed || trimmed === savedNameRef.current) {
      setProjectName(savedNameRef.current)
      return
    }
    renameMutation.mutate({ id: projectId, name: trimmed })
    savedNameRef.current = trimmed
  }, [projectName, projectId, renameMutation])

  const openInFinderMutation = trpc.external.openInFinder.useMutation()

  const handleOpenInFinder = () => {
    const projectPath = project?.localPath || project?.path
    if (projectPath) {
      openInFinderMutation.mutate(projectPath)
    }
  }

  const isArchived = Boolean(project?.archivedAt)
  const projectPath = project?.localPath || project?.path || ""
  const deleteConfirmationMatches =
    Boolean(project?.name) && deleteFilesConfirmation.trim() === project?.name

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* ── General ── */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">General</h4>
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            {/* Name */}
            <div className="flex items-center justify-between p-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">Name</span>
                <p className="text-sm text-muted-foreground">Display name for this project</p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onBlur={handleNameBlur}
                  className="w-full"
                  placeholder="Project name"
                />
              </div>
            </div>

            {/* Icon */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">Icon</span>
                <p className="text-sm text-muted-foreground">Project avatar in sidebar</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  className="relative h-10 w-10 rounded-lg border border-border overflow-hidden flex items-center justify-center cursor-pointer bg-muted group/icon"
                  onClick={() => uploadIconMutation.mutate({ id: projectId })}
                  title="Click to change icon"
                >
                  {iconSrc ? (
                    <img
                      src={iconSrc}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-150">
                    <ImageIcon className="h-4 w-4 text-white" />
                  </div>
                </button>
                {project?.iconPath && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => removeIconMutation.mutate({ id: projectId })}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Path */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex-1 min-w-0 mr-4">
                <span className="text-sm font-medium text-foreground">Path</span>
                <p className="text-sm text-muted-foreground truncate">{projectPath || "-"}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 flex-shrink-0 pl-2"
                onClick={handleOpenInFinder}
                disabled={!projectPath}
              >
                <img src={finderIcon} alt="" className="h-3.5 w-3.5" />
                Finder
              </Button>
            </div>

            {/* Repository */}
            {project?.gitOwner && project?.gitRepo && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">Repository</span>
                  <p className="text-sm text-muted-foreground">
                    {project.gitOwner}/{project.gitRepo}
                  </p>
                </div>
                {project.gitProvider === "github" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 flex-shrink-0 pl-2"
                    onClick={() => {
                      window.open(
                        `https://github.com/${project.gitOwner}/${project.gitRepo}`,
                        "_blank",
                      )
                    }}
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                    GitHub
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Visibility ── */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">Visibility</h4>
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  {isArchived ? "Archived project" : "Archive Project"}
                </span>
                <p className="text-sm text-muted-foreground">
                  {isArchived
                    ? "Restore this project to the left rail."
                    : "Hide this project from the left rail. Files stay on disk."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  isArchived
                    ? restoreMutation.mutate({ id: projectId })
                    : archiveMutation.mutate({ id: projectId })
                }
                disabled={archiveMutation.isPending || restoreMutation.isPending}
              >
                {isArchived ? (
                  <RotateCcw className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                {isArchived
                  ? restoreMutation.isPending ? "Restoring..." : "Restore"
                  : archiveMutation.isPending ? "Archiving..." : "Archive"}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Runtime ── */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">Runtime</h4>
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">Project setup</span>
                <p className="text-sm text-muted-foreground">
                  Ripple manages motion runtime files, project setup, preview, and export tooling for this project.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Danger Zone ── */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">Danger Zone</h4>
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">Remove From Ripple</span>
                <p className="text-sm text-muted-foreground">
                  Remove this project from Ripple. Files on disk will not be deleted.
                </p>
              </div>
              <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader className="px-6 pt-6 pb-5 space-y-2">
                    <AlertDialogTitle className="leading-6">Remove From Ripple?</AlertDialogTitle>
                    <AlertDialogDescription className="leading-6">
                      This will remove &quot;{project?.name}&quot; from your project list. Your files will not be deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="px-6 py-4">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => removeMutation.mutate({ id: projectId })}
                      disabled={removeMutation.isPending}
                      className={buttonVariants({ variant: "destructive" })}
                    >
                      {removeMutation.isPending ? "Removing..." : "Remove"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex-1 min-w-0 mr-4">
                <span className="text-sm font-medium text-foreground">Delete Project Files</span>
                <p className="text-sm text-muted-foreground">
                  Move the local project folder to Trash and remove it from Ripple.
                </p>
              </div>
              <AlertDialog
                open={showDeleteFilesDialog}
                onOpenChange={(open) => {
                  setShowDeleteFilesDialog(open)
                  if (!open) setDeleteFilesConfirmation("")
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Files
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader className="px-6 pt-6 pb-0 space-y-3">
                    <AlertDialogTitle className="leading-6">Delete Project Files?</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3 leading-6">
                      <span className="block">
                        This will move the local folder for &quot;{project?.name}&quot; to Trash and remove it from Ripple.
                      </span>
                      <span className="block rounded-md bg-muted/60 px-3 py-2 font-mono text-xs leading-5 text-foreground break-all">
                        {projectPath}
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogBody className="px-6 pt-5 pb-6 space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="delete-project-confirmation">
                      Type the project name to confirm
                    </label>
                    <Input
                      id="delete-project-confirmation"
                      value={deleteFilesConfirmation}
                      onChange={(event) => setDeleteFilesConfirmation(event.target.value)}
                      placeholder={project?.name ?? "Project name"}
                      autoComplete="off"
                    />
                  </AlertDialogBody>
                  <AlertDialogFooter className="px-6 py-4">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteFilesMutation.mutate({ id: projectId })}
                      disabled={!deleteConfirmationMatches || deleteFilesMutation.isPending}
                      className={buttonVariants({ variant: "destructive" })}
                    >
                      {deleteFilesMutation.isPending ? "Deleting..." : "Delete Files"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main Two-Panel Component ---
export function AgentsProjectsTab() {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const setSelectedProject = useSetAtom(selectedProjectAtom)
  const clearSelectedThreadState = useClearSelectedThreadState()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useUtils()

  // Focus search on "/" hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const activeProjectsQuery = trpc.projects.list.useQuery()
  const archivedProjectsQuery = trpc.projects.listArchived.useQuery()
  const projects = showArchived ? archivedProjectsQuery.data : activeProjectsQuery.data
  const isLoading = showArchived ? archivedProjectsQuery.isLoading : activeProjectsQuery.isLoading
  const fallbackProject = useMemo(() => {
    const nextActiveProject = activeProjectsQuery.data?.find(
      (project) => project.id !== selectedProjectId,
    )
    return nextActiveProject ? toSelectedProject(nextActiveProject) : null
  }, [activeProjectsQuery.data, selectedProjectId])

  const archiveListProjectMutation = trpc.projects.archive.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Project archived")
      utils.projects.list.invalidate()
      utils.projects.listArchived.invalidate()
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()

      const nextActiveProject = activeProjectsQuery.data?.find(
        (project) => project.id !== variables.id,
      )
      if (selectedProjectId === variables.id) {
        setSelectedProjectId(nextActiveProject?.id ?? null)
      }
      if (selectedProject?.id === variables.id) {
        setSelectedProject(nextActiveProject ? toSelectedProject(nextActiveProject) : null)
        clearSelectedThreadState()
      }
    },
    onError: (err) => {
      toast.error(`Failed to archive project: ${err.message}`)
    },
  })

  const openFolderMutation = trpc.projects.openRippleProjectFolder.useMutation({
    onSuccess: (result) => {
      if (!result) return

      const openedProject = result.project
      utils.projects.list.setData(undefined, (oldData) => {
        if (!oldData) return [openedProject]
        const exists = oldData.some((project) => project.id === openedProject.id)
        if (exists) {
          return oldData.map((project) =>
            project.id === openedProject.id ? openedProject : project,
          )
        }
        return [openedProject, ...oldData]
      })
      utils.projects.listArchived.setData(undefined, (oldData) =>
        oldData?.filter((project) => project.id !== openedProject.id) ?? oldData,
      )
      utils.projects.list.invalidate()
      utils.projects.listArchived.invalidate()

      setShowArchived(false)
      setSelectedProjectId(openedProject.id)
      showProjectSetupNotice(result)
    },
    onError: (error) => {
      toast.error("Project was not opened", { description: error.message })
    },
  })

  // Filter projects by search
  const filteredProjects = useMemo(() => {
    if (!projects) return []
    if (!searchQuery.trim()) return projects
    const q = searchQuery.toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.path?.toLowerCase().includes(q) ||
        p.gitRepo?.toLowerCase().includes(q),
    )
  }, [projects, searchQuery])

  const allProjectIds = useMemo(
    () => filteredProjects.map((p) => p.id),
    [filteredProjects]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allProjectIds,
    selectedItem: selectedProjectId,
    onSelect: setSelectedProjectId,
  })

  // Keep the detail selection available in the current active/archive view.
  useEffect(() => {
    if (isLoading) return
    if (!projects || projects.length === 0) {
      if (selectedProjectId) setSelectedProjectId(null)
      return
    }
    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]!.id)
    }
  }, [projects, selectedProjectId, isLoading])

  // Sync selection from global selectedProject (e.g., toast action)
  useEffect(() => {
    if (showArchived) return
    if (!selectedProject?.id) return
    setSelectedProjectId(selectedProject.id)
  }, [selectedProject?.id, showArchived])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar - project list */}
      <ResizableSidebar
        isOpen={true}
        onClose={() => {}}
        widthAtom={settingsProjectsSidebarWidthAtom}
        minWidth={200}
        maxWidth={400}
        side="left"
        animationDuration={0}
        initialWidth={240}
        exitWidth={240}
        disableClickToClose={true}
      >
        <div className="flex flex-col h-full bg-background border-r overflow-hidden" style={{ borderRightWidth: "0.5px" }}>
          {/* Search + Add */}
          <div className="px-2 pt-2 flex-shrink-0 flex items-center gap-1.5">
            <input
              ref={searchInputRef}
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={() => openFolderMutation.mutate()}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title="Add project folder"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="px-2 pt-2 flex-shrink-0">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className={cn(
                  "h-6 rounded-md text-xs font-medium transition-colors",
                  !showArchived
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={!showArchived}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className={cn(
                  "h-6 rounded-md text-xs font-medium transition-colors",
                  showArchived
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={showArchived}
              >
                Archived
              </button>
            </div>
          </div>

          {/* Project list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                Loading...
              </div>
            ) : !projects || projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <p className="text-sm text-muted-foreground mb-1">
                  {showArchived ? "No archived projects" : "No projects"}
                </p>
                {!showArchived && (
                  <button
                    onClick={() => openFolderMutation.mutate()}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Add your first project
                  </button>
                )}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">No results found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredProjects.map((project) => {
                  const isSelected = selectedProjectId === project.id
                  return (
                    <div
                      key={project.id}
                      className="group/project relative"
                    >
                      <button
                        data-item-id={project.id}
                        onClick={() => setSelectedProjectId(project.id)}
                        className={cn(
                          "w-full min-h-9 text-left py-2 pl-3 pr-10 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
                          isSelected
                            ? "bg-foreground/5 text-foreground"
                            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                        )}
                      >
                        <span className="block text-sm truncate">
                          {project.name}
                        </span>
                      </button>
                      {!showArchived && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            archiveListProjectMutation.mutate({ id: project.id })
                          }}
                          disabled={archiveListProjectMutation.isPending}
                          className={cn(
                            "absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,opacity,transform] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
                            "opacity-0 pointer-events-none group-hover/project:pointer-events-auto group-hover/project:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                          )}
                          aria-label={`Archive ${project.name}`}
                          title="Archive project"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ResizableSidebar>

      {/* Right content - detail panel */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {selectedProjectId ? (
          <ProjectDetail
            projectId={selectedProjectId}
            onProjectUnavailable={() => setSelectedProjectId(null)}
            fallbackProject={fallbackProject}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <FolderFilledIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {projects && projects.length > 0
                ? "Select a project to view settings"
                : showArchived
                  ? "No archived projects"
                  : "No projects added yet"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Keep legacy export for backward compatibility
export const AgentsProjectWorktreeTab = AgentsProjectsTab
