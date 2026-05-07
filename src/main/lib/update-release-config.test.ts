import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

type PackageJson = {
  scripts: Record<string, string>
  build?: {
    publish?: Array<Record<string, unknown>>
    mac?: {
      target?: Array<{
        target?: string
        arch?: string[]
      }>
    }
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

  test("targets Apple Silicon macOS packages for the public release path", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as PackageJson

    expect(pkg.build?.mac?.target).toEqual([
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] },
    ])
  })

  test("release workflow is manual, permission-scoped, signed, and metadata-aware", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf-8")

    expect(workflow).toContain("workflow_dispatch")
    expect(workflow).not.toContain("pull_request")
    expect(workflow).toContain("contents: write")
    expect(workflow).toContain("environment: release")
    expect(workflow).toContain("NODE_OPTIONS: --max-old-space-size=8192")
    expect(workflow).toContain("GITHUB_TOKEN: ${{ github.token }}")
    expect(workflow).toContain("actions/setup-python@v5")
    expect(workflow).toContain("CSC_LINK")
    expect(workflow).toContain("APPLE_API_KEY_P8")
    expect(workflow).toContain("MAIN_VITE_RIPPLE_ANALYTICS_KEY")
    expect(workflow).toContain("MAIN_VITE_RIPPLE_ANALYTICS_HOST")
    expect(workflow).toContain("Download Ripple for Apple Silicon Macs with the .dmg file.")
    expect(workflow).toContain("build/github-release-notes.md")
    expect(workflow).toContain("electron-builder --mac --arm64 --publish never")
    expect(workflow).toContain("-c.mac.notarize=true")
    expect(workflow).toContain("codesign --verify --deep --strict")
    expect(workflow).toContain("spctl --assess --type execute")
    expect(workflow).toContain("xcrun stapler validate")
    expect(workflow).toContain("Unexpected non-Apple-Silicon app bundle")
    expect(workflow).toContain("Unexpected Intel macOS update metadata")
    expect(workflow).toContain("ripple-macos-apple-silicon")
    expect(workflow).toContain("gh release create")
    expect(workflow).toContain("gh release upload")
    expect(workflow).toContain("gh release edit")
    expect(workflow).toContain("latest-mac*.yml")
    expect(workflow).toContain("beta-mac*.yml")
    expect(workflow).not.toContain("mapfile")
    expect(workflow).not.toContain("readarray")
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
    expect(source).toContain("checkForUpdates(true)")
  })
})
