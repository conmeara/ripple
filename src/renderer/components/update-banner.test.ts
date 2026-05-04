import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

describe("Phase 18 update banner behavior", () => {
  test("requires explicit restart after a downloaded update", () => {
    const source = readFileSync("src/renderer/components/update-banner.tsx", "utf-8")

    expect(source).not.toContain("hasTriggeredInstall")
    expect(source).not.toContain("Auto-install when download completes")
    expect(source).not.toMatch(/setTimeout\([\s\S]*installUpdate\(\)/)
    expect(source).toContain("Restart to update")
    expect(source).toContain("is ready to install")
    expect(source).toContain("Later")
  })

  test("opens version-specific release pages", () => {
    const bannerSource = readFileSync("src/renderer/components/update-banner.tsx", "utf-8")
    const justUpdatedSource = readFileSync("src/renderer/lib/hooks/use-just-updated.ts", "utf-8")

    expect(bannerSource).toContain("/releases/tag/v${version}")
    expect(justUpdatedSource).toContain("/tag/v${justUpdatedVersion}")
  })
})
