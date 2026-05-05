"use client"

import { useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { ArrowLeft, FolderOpen, Plus, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "../../components/ui/button"
import { IconSpinner } from "../../components/ui/icons"
import { Input } from "../../components/ui/input"
import { Logo } from "../../components/ui/logo"
import { trpc } from "../../lib/trpc"
import { showProjectSetupNotice } from "../../lib/project-setup-toast"
import { TemplateGallery } from "../templates/TemplateChooserDialog"
import { RippleFirstRunDialog } from "./RippleFirstRunDialog"
import {
  rippleOnboardingStateAtom,
  shouldShowRippleOnboarding,
} from "./ripple-onboarding-state"
import {
  projectEntryReturnProjectAtom,
  selectedProjectAtom,
  toSelectedProject,
} from "../agents/atoms"

export function ProjectEntryPage() {
  const [, setSelectedProject] = useAtom(selectedProjectAtom)
  const [returnProject, setReturnProject] = useAtom(projectEntryReturnProjectAtom)
  const onboardingState = useAtomValue(rippleOnboardingStateAtom)
  const [projectName, setProjectName] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState("blank")
  const utils = trpc.useUtils()
  const { data: projects } = trpc.projects.list.useQuery()
  const { data: archivedProjects } = trpc.projects.listArchived.useQuery()
  const { data: templates = [] } = trpc.templates.list.useQuery({
    target: "new-project",
  })

  const selectProject = (project: Parameters<typeof toSelectedProject>[0]) => {
    setSelectedProject(toSelectedProject(project))
  }

  const createProject = trpc.projects.createRippleProject.useMutation({
    onSuccess: (result) => {
      utils.projects.list.setData(undefined, (oldData) => {
        if (!oldData) return [result.project]
        const exists = oldData.some((project) => project.id === result.project.id)
        if (exists) {
          return oldData.map((project) =>
            project.id === result.project.id ? result.project : project,
          )
        }
        return [result.project, ...oldData]
      })

      setReturnProject(null)
      selectProject(result.project)
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

      utils.projects.list.setData(undefined, (oldData) => {
        if (!oldData) return [result.project]
        const exists = oldData.some((project) => project.id === result.project.id)
        if (exists) {
          return oldData.map((project) =>
            project.id === result.project.id ? result.project : project,
          )
        }
        return [result.project, ...oldData]
      })

      setReturnProject(null)
      selectProject(result.project)
      toast.success("Project opened")
      showProjectSetupNotice(result)
    },
    onError: (error) => {
      toast.error("Project was not opened", { description: error.message })
    },
  })

  const restoreProject = trpc.projects.restore.useMutation({
    onSuccess: (project) => {
      utils.projects.list.setData(undefined, (oldData) => {
        if (!oldData) return [project]
        const exists = oldData.some((item) => item.id === project.id)
        if (exists) {
          return oldData.map((item) => item.id === project.id ? project : item)
        }
        return [project, ...oldData]
      })
      utils.projects.listArchived.setData(undefined, (oldData) =>
        oldData?.filter((item) => item.id !== project.id) ?? oldData,
      )
      utils.projects.list.invalidate()
      utils.projects.listArchived.invalidate()

      setReturnProject(null)
      selectProject(project)
      toast.success("Project restored")
    },
    onError: (error) => {
      toast.error("Project was not restored", { description: error.message })
    },
  })

  const isBusy = createProject.isPending || openProject.isPending || restoreProject.isPending
  const returnProjectRecord = returnProject
    ? projects?.find((project) => project.id === returnProject.id)
    : null
  const fallbackProject = returnProjectRecord ?? projects?.[0] ?? null
  const canGoBack = Boolean(returnProject || fallbackProject)
  const showFirstRunDialog = shouldShowRippleOnboarding(onboardingState)
  const archivedOnlyProjects =
    projects && projects.length === 0
      ? archivedProjects ?? []
      : []

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = projectName.trim()
    if (!name || isBusy) return
    await createProject.mutateAsync({
      name,
      templateId: selectedTemplateId,
    })
  }

  const handleBack = () => {
    if (isBusy) return

    if (fallbackProject) {
      selectProject(fallbackProject)
    } else if (returnProject) {
      setSelectedProject(returnProject)
    }

    setReturnProject(null)
  }

  return (
    <div
      className="h-screen w-screen overflow-y-auto bg-background select-none"
      data-testid="ripple-project-entry"
    >
      <RippleFirstRunDialog />
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />
      {canGoBack && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="fixed left-4 top-12 gap-2"
          disabled={isBusy}
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      )}

      <form
        onSubmit={handleCreateProject}
        className="mx-auto flex min-h-screen w-full max-w-[920px] flex-col justify-center space-y-7 px-5 py-20"
        data-testid="ripple-project-entry-form"
      >
        <div className="mx-auto w-full max-w-[460px] text-center space-y-4">
          <div className="flex items-center justify-center mx-auto w-max">
            <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center">
              <Logo className="w-6 h-6" fill="white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Create a project
            </h1>
            <p className="text-sm text-muted-foreground">
              Local files are saved in ~/Ripple
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[460px] space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="project-name">
              Project name
            </label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="My Project"
              autoFocus={!showFirstRunDialog}
              disabled={isBusy}
              className="h-10"
              data-testid="ripple-project-name-input"
            />
          </div>
        </div>

        <div className="mx-auto w-full max-w-[460px] space-y-3">
          <Button
            type="submit"
            className="h-9 w-full gap-2"
            disabled={!projectName.trim() || isBusy}
            data-testid="ripple-create-project-button"
          >
            {createProject.isPending ? (
              <IconSpinner className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create Project
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 w-full gap-2"
            disabled={isBusy}
            onClick={() => openProject.mutate()}
            data-testid="ripple-open-project-button"
          >
            {openProject.isPending ? (
              <IconSpinner className="h-4 w-4" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            Open Existing Project
          </Button>
          {archivedOnlyProjects.length > 0 && (
            <div className="space-y-2 border-t border-border/70 pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Archived projects
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {archivedOnlyProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex min-h-9 items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {project.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2"
                      disabled={isBusy}
                      onClick={() => restoreProject.mutate({ id: project.id })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Templates</h2>
          </div>
          <TemplateGallery
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={setSelectedTemplateId}
            disabled={isBusy}
          />
        </div>
      </form>
    </div>
  )
}
