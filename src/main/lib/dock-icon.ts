export const DOCK_ICON_LIGHT_ASSET = "icon-light.png"
export const DOCK_ICON_DARK_ASSET = "icon-dark.png"

export function getDockIconAssetName(shouldUseDarkColors: boolean): string {
  return shouldUseDarkColors ? DOCK_ICON_DARK_ASSET : DOCK_ICON_LIGHT_ASSET
}
