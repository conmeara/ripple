import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const requiredWorkflowIds = [
  "BOOT-01",
  "BOOT-02",
  "PROJECT-01",
  "PROJECT-02",
  "PROJECT-03",
  "PROJECT-04",
  "PREVIEW-01",
  "PREVIEW-02",
  "PREVIEW-03",
  "TIMELINE-01",
  "TIMELINE-02",
  "ASSET-01",
  "COMMENTS-01",
  "COMMENTS-02",
  "REVISIONS-01",
  "REVISIONS-02",
  "CHAT-01",
  "CHAT-02",
  "AGENT-01",
  "AGENT-02",
  "AGENT-03",
  "VISUAL-01",
  "EXPORT-01",
  "EXPORT-02",
  "EXPORT-03",
  "ANALYTICS-01",
  "ANALYTICS-02",
  "UPDATES-01",
  "UPDATES-02",
  "PACKAGE-01",
  "PACKAGE-02",
  "FAILURE-01",
  "LAYOUT-01",
  "SECURITY-01",
  "DB-01",
  "QUALITY-01",
]

const requiredScripts = [
  "bin:stage",
  "package:stage",
  "test:quality",
  "test:ux",
  "test:agent",
  "test:export",
  "test:export:smoke",
  "test:e2e",
  "test:e2e:update",
  "test:visual",
  "test:live",
  "test:package:smoke",
  "test:closeout",
  "test:release",
]

describe("Ripple workflow coverage matrix", () => {
  test("maps every v1 workflow to automated or release-gated evidence", () => {
    const matrix = readFileSync("docs/testing/ux-workflow-coverage.md", "utf8")

    for (const id of requiredWorkflowIds) {
      expect(matrix).toContain(`| ${id} |`)
    }

    expect(matrix).not.toMatch(/\b(TBD|TODO|none)\b/i)
    expect(matrix).toContain("docs/release/v1-release-checklist.md")
    expect(matrix).toContain("Release-gated")
  })

  test("keeps future-agent closeout commands wired in package scripts", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>
    }
    const closeout = readFileSync("docs/testing/agent-closeout.md", "utf8")

    for (const script of requiredScripts) {
      expect(packageJson.scripts[script]).toBeTruthy()
      expect(closeout).toContain(script)
    }

    expect(packageJson.scripts["test:ripple"]).toContain("src/renderer/features/onboarding")
    expect(packageJson.scripts["test:ripple"]).toContain("src/renderer/features/templates")
    expect(packageJson.scripts["test:release"]).toContain("test:export:smoke")
    expect(packageJson.scripts["test:release"]).toContain("test:package:smoke")
    expect(packageJson.scripts["test:closeout"]).toContain("test:e2e")
    expect(packageJson.scripts["package"]).toContain("package:stage")
    expect(packageJson.scripts["package:stage"]).toContain("bin:stage")
  })
})
