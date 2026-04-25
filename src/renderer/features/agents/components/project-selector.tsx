import { useMemo, useState } from "react"
import { useAtom } from "jotai"
import { Check, ChevronDown, FolderOpen, FolderPlus, Plus } from "lucide-react"
import { toast } from "sonner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../../components/ui/command"
import {
  Dialog,
  DialogContent,
} from "../../../components/ui/dialog"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import { IconSpinner } from "../../../components/ui/icons"
import { ProjectIcon } from "../../../components/ui/project-icon"
import { showProjectSetupNotice } from "../../../lib/project-setup-toast"
import { trpc } from "../../../lib/trpc"
import {
  selectedProjectAtom,
  toSelectedProject,
} from "../atoms"

export function ProjectSelector() {
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const utils = trpc.useUtils()

  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()
  type ProjectRow = NonNullable<typeof projects>[number]

  const filteredProjects = useMemo(() => {
    if (!projects) return []
    if (!searchQuery.trim()) return projects
    const query = searchQuery.toLowerCase()
    return projects.filter((project) => {
      const localPath = project.localPath ?? project.path
      return (
        project.name.toLowerCase().includes(query) ||
        localPath.toLowerCase().includes(query)
      )
    })
  }, [projects, searchQuery])

  const rememberProject = (project: ProjectRow) => {
    utils.projects.list.setData(undefined, (oldData) => {
      if (!oldData) return [project]
      const exists = oldData.some((item) => item.id === project.id)
      if (exists) {
        return oldData.map((item) => (item.id === project.id ? project : item))
      }
      return [project, ...oldData]
    })

    setSelectedProject(toSelectedProject(project))
  }

  const createProject = trpc.projects.createRippleProject.useMutation({
    onSuccess: (result) => {
      rememberProject(result.project)
      setCreateDialogOpen(false)
      setProjectName("")
      toast.success("Project created")
      showProjectSetupNotice(result)
    },
    onError: (error) => {
      toast.error("Project was not created", { description: error.message })
    },
  })

  const openProject = trpc.projects.openRippleProjectFolder.useMutation({
    onSuccess: (result) => {
      if (!result) return
      rememberProject(result.project)
      toast.success("Project opened")
      showProjectSetupNotice(result)
    },
    onError: (error) => {
      toast.error("Project was not opened", { description: error.message })
    },
  })

  const handleOpenProject = async () => {
    setOpen(false)
    await openProject.mutateAsync()
  }

  const handleSelectProject = (projectId: string) => {
    const project = projects?.find((item) => item.id === projectId)
    if (project) {
      setSelectedProject(toSelectedProject(project))
      setOpen(false)
    }
  }

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = projectName.trim()
    if (!name || createProject.isPending) return
    await createProject.mutateAsync({ name })
  }

  const validSelection = useMemo(() => {
    if (!selectedProject) return null
    if (isLoadingProjects) return selectedProject
    if (!projects) return null
    const dbProject = projects.find((project) => project.id === selectedProject.id)
    return dbProject ? toSelectedProject(dbProject) : null
  }, [selectedProject, projects, isLoadingProjects])

  if (!validSelection && (!projects || projects.length === 0) && !isLoadingProjects) {
    return (
      <>
        <button
          onClick={() => setCreateDialogOpen(true)}
          disabled={createProject.isPending}
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          <span>{createProject.isPending ? "Creating..." : "New Project"}</span>
        </button>
        <CreateProjectDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          projectName={projectName}
          setProjectName={setProjectName}
          isPending={createProject.isPending}
          onSubmit={handleCreateProject}
        />
      </>
    )
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) setSearchQuery("")
        }}
      >
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
            type="button"
          >
            <ProjectIcon project={validSelection} className="h-4 w-4" />
            <span className="truncate max-w-[120px]">
              {validSelection?.name || "Select project"}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search projects..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList className="max-h-[300px] overflow-y-auto">
              {isLoadingProjects ? (
                <div className="px-2.5 py-4 text-center text-sm text-muted-foreground">
                  Loading...
                </div>
              ) : filteredProjects.length > 0 ? (
                <CommandGroup>
                  {filteredProjects.map((project) => {
                    const isSelected = validSelection?.id === project.id
                    const localPath = project.localPath ?? project.path
                    return (
                      <CommandItem
                        key={project.id}
                        value={`${project.name} ${localPath}`}
                        onSelect={() => handleSelectProject(project.id)}
                        className="gap-2"
                      >
                        <ProjectIcon project={project} className="h-4 w-4" />
                        <span className="truncate flex-1">{project.name}</span>
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ) : (
                <CommandEmpty>No projects found.</CommandEmpty>
              )}
            </CommandList>
            <div className="border-t border-border/50 py-1">
              <button
                onClick={() => {
                  setOpen(false)
                  setCreateDialogOpen(true)
                }}
                disabled={createProject.isPending}
                className="flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] rounded-md text-sm cursor-default select-none outline-none dark:hover:bg-neutral-800 hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                <span>{createProject.isPending ? "Creating..." : "New Project"}</span>
              </button>
              <button
                onClick={handleOpenProject}
                disabled={openProject.isPending}
                className="flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] rounded-md text-sm cursor-default select-none outline-none dark:hover:bg-neutral-800 hover:text-foreground transition-colors"
              >
                {openProject.isPending ? (
                  <IconSpinner className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{openProject.isPending ? "Opening..." : "Open Existing Project"}</span>
              </button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectName={projectName}
        setProjectName={setProjectName}
        isPending={createProject.isPending}
        onSubmit={handleCreateProject}
      />
    </>
  )
}

function CreateProjectDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  setProjectName: (name: string) => void
  isPending: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[400px] p-0 gap-0 overflow-hidden">
        <form onSubmit={props.onSubmit}>
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">New Project</h2>
            <Input
              placeholder="My Project"
              value={props.projectName}
              onChange={(event) => props.setProjectName(event.target.value)}
              className="w-full h-10 text-sm"
              autoFocus
              disabled={props.isPending}
            />
          </div>
          <div className="bg-muted p-4 flex justify-between border-t border-border">
            <Button
              type="button"
              onClick={() => props.onOpenChange(false)}
              variant="ghost"
              className="rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!props.projectName.trim() || props.isPending}
              variant="default"
              className="rounded-md gap-2"
            >
              {props.isPending && <IconSpinner className="h-4 w-4" />}
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
