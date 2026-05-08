import { app } from "electron"
import { existsSync } from "node:fs"
import { join } from "node:path"

function resolveBundledBinaryPath(binaryName: string): string {
  const platformBinaryName =
    process.platform === "win32" ? `${binaryName}.exe` : binaryName
  const candidatePaths = app.isPackaged
    ? [join(process.resourcesPath, "bin", platformBinaryName)]
    : developmentAppRoots().map((root) =>
        join(
          root,
          "resources",
          "bin",
          `${process.platform}-${process.arch}`,
          platformBinaryName,
        )
      )

  return candidatePaths.find((candidate) => existsSync(candidate)) ?? candidatePaths[0]
}

function developmentAppRoots(): string[] {
  return Array.from(new Set([
    app.getAppPath(),
    process.cwd(),
    join(app.getAppPath(), "..", ".."),
  ]))
}

export function getBundledCodexCliPath(): string {
  const binaryPath = resolveBundledBinaryPath("codex")
  if (!existsSync(binaryPath)) {
    throw new Error(
      "Codex is not installed for this app yet. Download Codex from Settings, then try again.",
    )
  }
  return binaryPath
}

export function getBundledClaudeCodePath(): string {
  const binaryPath = resolveBundledBinaryPath("claude")
  if (!existsSync(binaryPath)) {
    throw new Error(
      "Claude is not installed for this app yet. Download Claude from Settings, then try again.",
    )
  }
  return binaryPath
}
