import { existsSync } from "node:fs"
import { join, parse, resolve } from "node:path"

export type ProjectPathLike = {
  localPath?: string | null
  path: string
}

export function resolveProjectPath(project: ProjectPathLike): string {
  return resolve(project.localPath || project.path)
}

export function assertSafeProjectTrashPath(
  projectPathInput: string,
  homePathInput: string,
): string {
  const projectPath = resolve(projectPathInput)
  const rootPath = parse(projectPath).root
  const homePath = resolve(homePathInput)

  if (projectPath === rootPath || projectPath === homePath) {
    throw new Error("Refusing to delete this folder.")
  }

  if (!existsSync(projectPath)) {
    throw new Error("Project folder does not exist on disk.")
  }

  if (
    !existsSync(join(projectPath, "index.html")) ||
    !existsSync(join(projectPath, "hyperframes.json"))
  ) {
    throw new Error("This folder no longer looks like a Ripple project.")
  }

  return projectPath
}

