import { describe, expect, test } from "bun:test"
import { join } from "path"
import { getBuildAssetPath } from "./packaged-assets"

describe("packaged build asset paths", () => {
  test("resolves packaged assets from Electron resourcesPath", () => {
    expect(
      getBuildAssetPath("icon.png", {
        isPackaged: true,
        resourcesPath: "/Applications/Ripple.app/Contents/Resources",
        moduleDir: "/Applications/Ripple.app/Contents/Resources/app.asar/out/main",
      }),
    ).toBe(
      join("/Applications/Ripple.app/Contents/Resources", "build", "icon.png"),
    )
  })

  test("resolves development assets relative to the bundled main module", () => {
    expect(
      getBuildAssetPath("settingsTemplate.png", {
        isPackaged: false,
        moduleDir: "/Users/conmeara/code/ripple/out/main",
      }),
    ).toBe(
      join(
        "/Users/conmeara/code/ripple/out/main",
        "../../build",
        "settingsTemplate.png",
      ),
    )
  })
})
