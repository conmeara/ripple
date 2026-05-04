import { join } from "path"

export interface BuildAssetPathOptions {
  isPackaged?: boolean
  moduleDir?: string
  resourcesPath?: string
}

export function getBuildAssetPath(
  assetName: string,
  options: BuildAssetPathOptions = {},
): string {
  const isPackaged = options.isPackaged ?? false
  const resourcesPath =
    options.resourcesPath ??
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

  if (isPackaged && typeof resourcesPath === "string") {
    return join(resourcesPath, "build", assetName)
  }

  return join(options.moduleDir ?? __dirname, "../../build", assetName)
}
