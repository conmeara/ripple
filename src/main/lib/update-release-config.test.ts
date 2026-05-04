import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

type PackageJson = {
  scripts: Record<string, string>
  build?: {
    publish?: Array<Record<string, unknown>>
  }
}

describe("Phase 18 release configuration", () => {
  test("publishes official updates through electron-builder GitHub Releases", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as PackageJson
    const publish = pkg.build?.publish?.[0]

    expect(publish).toMatchObject({
      provider: "github",
      owner: "conmeara",
      repo: "ripple",
      private: false,
      channel: "${channel}",
      releaseType: "draft",
      publishAutoUpdate: true,
    })
    expect(pkg.scripts.release).toContain("--publish never")
    expect(pkg.scripts.release).not.toContain("dist:manifest")
    expect(pkg.scripts["release:github:mac"]).toContain("--publish always")
    expect(pkg.scripts["dist:manifest:fallback"]).toContain("generate-update-manifest")
  })

  test("release workflow is manual, permission-scoped, signed, and metadata-aware", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf-8")

    expect(workflow).toContain("workflow_dispatch")
    expect(workflow).not.toContain("pull_request")
    expect(workflow).toContain("contents: write")
    expect(workflow).toContain("environment: release")
    expect(workflow).toContain("actions/setup-python@v5")
    expect(workflow).toContain("CSC_LINK")
    expect(workflow).toContain("APPLE_API_KEY_P8")
    expect(workflow).toContain("-c.mac.notarize=true")
    expect(workflow).toContain("codesign --verify --deep --strict")
    expect(workflow).toContain("spctl --assess --type execute")
    expect(workflow).toContain("xcrun stapler validate")
    expect(workflow).toContain("electron-builder publish")
    expect(workflow).toContain("latest-mac*.yml")
    expect(workflow).toContain("beta-mac*.yml")
  })

  test("primary update settings avoid inherited developer-tool language", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/app-updates-tab.tsx",
      "utf-8",
    )
    const forbidden = [
      "Agents",
      "workspace",
      "PR",
      "commit",
      "branch",
      "worktree",
      "repo",
      "clone",
      "sub-chat",
      "account email",
      "dev mode?",
      "bypasses CDN cache",
    ]

    for (const text of forbidden) {
      expect(source).not.toContain(text)
    }
    expect(source).toContain("App Updates")
    expect(source).toContain("Automatic Checks")
    expect(source).toContain("Early Access")
    expect(source).toContain("Restart to update")
  })
})
