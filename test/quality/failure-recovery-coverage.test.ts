import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

describe("Ripple failure recovery coverage", () => {
  test("maps release recovery claims to concrete regression evidence", () => {
    const environmentTests = readFileSync(
      "src/main/lib/ripple-projects/environment.test.ts",
      "utf8",
    )
    const previewTests = readFileSync(
      "src/main/lib/hyperframes/preview-manager.test.ts",
      "utf8",
    )
    const exportTests = readFileSync(
      "src/main/lib/exports/service.test.ts",
      "utf8",
    )
    const rendersPane = readFileSync(
      "src/renderer/features/renders/RippleRendersPane.tsx",
      "utf8",
    )
    const updaterTests = readFileSync(
      "src/main/lib/auto-updater-source.test.ts",
      "utf8",
    )
    const updatesTab = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/app-updates-tab.tsx",
      "utf8",
    )

    expect(environmentTests).toContain("reports missing render tools without throwing")
    expect(environmentTests).toContain("falls back to the app runtime")
    expect(previewTests).toContain("PREVIEW_START_TIMEOUT")
    expect(previewTests).toContain("PREVIEW_START_FAILED")
    expect(exportTests).toContain("fails the job when FFprobe facts do not match")
    expect(exportTests).toContain("retries a failed export to the same chosen destination")
    expect(exportTests).toContain("marks stale running jobs as interrupted once")
    expect(rendersPane).toContain('job.status === "failed" || job.status === "interrupted"')
    expect(rendersPane).toContain('label="Retry"')
    expect(updaterTests).toContain("keeps automatic checks opt-in")
    expect(updaterTests).toContain("keeps downloaded updates behind the explicit restart action")
    expect(updatesTab).toContain("Update check failed.")
    expect(updatesTab).toContain("Update download failed. Try again when your connection is stable.")
  })
})
