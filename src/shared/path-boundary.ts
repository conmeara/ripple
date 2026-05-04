import {
  isAbsolute as defaultIsAbsolute,
  relative as defaultRelative,
  resolve as defaultResolve,
  sep as defaultSep,
} from "node:path"

interface PathBoundaryApi {
  resolve: typeof defaultResolve
  relative: typeof defaultRelative
  isAbsolute: typeof defaultIsAbsolute
  sep: string
}

const defaultPathBoundaryApi: PathBoundaryApi = {
  resolve: defaultResolve,
  relative: defaultRelative,
  isAbsolute: defaultIsAbsolute,
  sep: defaultSep,
}

export function isRelativePathInsideDirectory(
  relativePath: string,
  pathApi: Pick<PathBoundaryApi, "isAbsolute" | "sep"> = defaultPathBoundaryApi,
): boolean {
  return relativePath === "" ||
    (
      !relativePath.startsWith("..") &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${pathApi.sep}`) &&
      !pathApi.isAbsolute(relativePath)
    )
}

export function isPathInsideDirectory(
  rootPath: string,
  candidatePath: string,
  pathApi: PathBoundaryApi = defaultPathBoundaryApi,
): boolean {
  const resolvedRoot = pathApi.resolve(rootPath)
  const resolvedCandidate = pathApi.resolve(candidatePath)
  const result = pathApi.relative(resolvedRoot, resolvedCandidate)

  return isRelativePathInsideDirectory(result, pathApi)
}
