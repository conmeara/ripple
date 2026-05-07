import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

describe("Phase 18 updater runtime guardrails", () => {
  test("uses GitHub update config by default and keeps generic feeds fallback-only", () => {
    const source = readFileSync("src/main/lib/auto-updater.ts", "utf-8")

    expect(source).toContain("app-update.yml")
    expect(source).toContain("FALLBACK_UPDATE_FEED_URL")
    expect(source).toContain("Using bundled GitHub Releases update config")
    expect(source).toContain("Using explicit fallback update feed")
  })

  test("enables automatic checks by default and gates automatic entry points", () => {
    const source = readFileSync("src/main/lib/auto-updater.ts", "utf-8")
    const mainSource = readFileSync("src/main/index.ts", "utf-8")

    expect(source).toContain("const DEFAULT_AUTO_UPDATE_CHECKS_ENABLED = true")
    expect(source).toMatch(
      /export function getAutoUpdateChecksEnabled\(\): boolean \{[\s\S]*return DEFAULT_AUTO_UPDATE_CHECKS_ENABLED[\s\S]*\}/,
    )
    expect(source).toContain('source === "automatic" && !getAutoUpdateChecksEnabled()')
    expect(source).toContain("autoCheckEnabled")
    expect(source).toContain("app.isPackaged && getAutoUpdateChecksEnabled()")
    expect(source).toContain("Window focused; automatic update checks disabled")
    expect(source).toContain('await checkForUpdates(true, "automatic")')
    expect(source).toContain("Post-preference-change check failed")
    expect(mainSource).not.toContain("setupFocusUpdateCheck")
    expect(mainSource).not.toContain('checkForUpdates(true, "automatic")')
  })

  test("enables beta prerelease discovery without allowing downgrades", () => {
    const source = readFileSync("src/main/lib/auto-updater.ts", "utf-8")

    expect(source).toContain('autoUpdater.allowPrerelease = channel === "beta"')
    expect(source).toContain("autoUpdater.allowDowngrade = false")
    expect(source).toContain('await checkForUpdates(true, "automatic")')
  })

  test("keeps downloaded updates behind the explicit restart action", () => {
    const source = readFileSync("src/main/lib/auto-updater.ts", "utf-8")

    expect(source).toContain("autoUpdater.autoInstallOnAppQuit = false")
    expect(source).not.toContain("autoUpdater.autoInstallOnAppQuit = true")
    expect(source).toContain("quitAndInstall")
  })
})
