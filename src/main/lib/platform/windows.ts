/**
 * Windows Platform Provider
 */

import { existsSync } from "node:fs"
import { mkdir, unlink, rmdir, writeFile } from "node:fs/promises"
import * as path from "node:path"
import { win32 as winPath } from "node:path"
import { BasePlatformProvider } from "./base"
import type {
  ShellConfig,
  PathConfig,
  CliConfig,
  EnvironmentConfig,
} from "./types"
import { RIPPLE_IDENTITY } from "../../../shared/app-identity"

export function buildInstalledWindowsCliScript(sourcePath: string): string {
  const resourcesBinDir = winPath.dirname(sourcePath)
  const resourcesDir = winPath.dirname(resourcesBinDir)
  const appRoot = winPath.dirname(resourcesDir)
  const appExecutable = winPath.join(appRoot, `${RIPPLE_IDENTITY.productName}.exe`)
  const appAsar = winPath.join(resourcesDir, "app.asar")
  const cliScript = winPath.join(appAsar, "out", "main", "ripple-cli.js")

  return [
    "@echo off",
    "setlocal",
    "",
    `set "APP_EXECUTABLE=${appExecutable}"`,
    `set "CLI_SCRIPT=${cliScript}"`,
    `set "APP_ASAR=${appAsar}"`,
    "",
    `if exist "%APP_EXECUTABLE%" if exist "%APP_ASAR%" (`,
    `  set "ELECTRON_RUN_AS_NODE=1"`,
    `  "%APP_EXECUTABLE%" "%CLI_SCRIPT%" %*`,
    `  exit /b %ERRORLEVEL%`,
    ")",
    "",
    "echo Ripple CLI requires the packaged app runtime. 1>&2",
    "exit /b 1",
    "",
  ].join("\r\n")
}

export class WindowsPlatformProvider extends BasePlatformProvider {
  readonly platform = "win32" as const
  readonly displayName = "Windows"

  getShellConfig(): ShellConfig {
    const powershellPath =
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    const cmdPath = process.env.COMSPEC || "C:\\Windows\\System32\\cmd.exe"

    return {
      executable: process.env.COMSPEC || powershellPath,
      loginArgs: [], // Windows shells don't have login mode like Unix
      execArgs: (command: string) => ["/c", command],
    }
  }

  getPathConfig(): PathConfig {
    const home = this.getHome()
    const systemRoot = process.env.SystemRoot || "C:\\Windows"

    return {
      separator: ";",
      commonPaths: [
        // Git for Windows
        "C:\\Program Files\\Git\\cmd",
        "C:\\Program Files\\Git\\bin",
        "C:\\Program Files\\Git\\usr\\bin",
        // Node.js
        "C:\\Program Files\\nodejs",
        // System
        path.join(systemRoot, "System32"),
        systemRoot,
      ],
      localBin: path.join(home, ".local", "bin"),
      packageManagerPaths: [
        path.join(home, "AppData", "Roaming", "npm"),
        path.join(home, ".bun", "bin"),
        path.join(home, ".cargo", "bin"),
        path.join(home, "scoop", "shims"),
        path.join(home, "AppData", "Local", "pnpm"),
      ],
    }
  }

  getCliConfig(): CliConfig {
    // Install to ~/.local/bin which is already included in buildExtendedPath()
    // This avoids needing to modify the system PATH
    const home = this.getHome()

    return {
      installPath: path.join(home, ".local", "bin", `${RIPPLE_IDENTITY.cliCommand}.cmd`),
      scriptName: `${RIPPLE_IDENTITY.cliCommand}.cmd`,
      requiresAdmin: false, // Install to user directory, no admin needed
    }
  }

  private getLegacyCliInstallPath(): string {
    return path.join(
      this.getHome(),
      ".local",
      "bin",
      `${RIPPLE_IDENTITY.legacyCliCommand}.cmd`,
    )
  }

  private async removeCliPathIfPresent(installPath: string): Promise<void> {
    if (existsSync(installPath)) {
      await unlink(installPath)
    }
  }

  getEnvironmentConfig(): EnvironmentConfig {
    const home = this.getHome()

    return {
      homeVar: "USERPROFILE",
      userVar: "USERNAME",
      additionalVars: {
        USERPROFILE: home,
        HOME: home,
        APPDATA: path.join(home, "AppData", "Roaming"),
        LOCALAPPDATA: path.join(home, "AppData", "Local"),
        TEMP: process.env.TEMP || path.join(home, "AppData", "Local", "Temp"),
        TMP: process.env.TMP || path.join(home, "AppData", "Local", "Temp"),
      },
    }
  }

  override getDefaultShell(): string {
    // Prefer PowerShell, fall back to cmd.exe
    return (
      process.env.COMSPEC ||
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    )
  }

  override async detectShell(): Promise<string> {
    // Windows doesn't have a per-user shell preference like Unix
    // Just return the default
    return this.getDefaultShell()
  }

  override async detectLocale(): Promise<string> {
    // Windows uses different locale mechanism
    // Try environment first
    if (process.env.LANG) {
      return process.env.LANG
    }

    // Could query Windows locale via PowerShell, but for simplicity use default
    return "en_US.UTF-8"
  }

  async installCli(
    sourcePath: string
  ): Promise<{ success: boolean; error?: string; pathHint?: string }> {
    const cliConfig = this.getCliConfig()
    const installPath = cliConfig.installPath
    const installDir = path.dirname(installPath)

    if (!existsSync(sourcePath)) {
      return { success: false, error: "CLI script not found in app bundle" }
    }

    try {
      // Create directory and write an installed wrapper with absolute app paths.
      await mkdir(installDir, { recursive: true })
      await this.removeCliPathIfPresent(this.getLegacyCliInstallPath())
      await writeFile(
        installPath,
        buildInstalledWindowsCliScript(sourcePath),
        "utf8",
      )

      // Note: We intentionally do NOT use `setx PATH` here because:
      // 1. setx has a 1024 character limit that silently truncates PATH
      // 2. It can corrupt the user's PATH environment variable
      // Instead, the install directory is included in buildExtendedPath()
      // which ensures the CLI is found when running from the app.
      //
      // For terminal usage, users can manually add to PATH:
      // $env:Path += ";${installDir}"

      console.log(`[CLI] Installed ${RIPPLE_IDENTITY.cliCommand} command to`, installPath)
      console.log(
        "[CLI] To use from terminal, add to PATH:",
        `$env:Path += ";${installDir}"`
      )

      return {
        success: true,
        pathHint: `To use ${RIPPLE_IDENTITY.cliCommand} from terminal, add to your PATH: ${installDir}`,
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Installation failed"
      console.error("[CLI] Failed to install:", error)
      return { success: false, error: errorMessage }
    }
  }

  async uninstallCli(): Promise<{ success: boolean; error?: string }> {
    const cliConfig = this.getCliConfig()
    const installPath = cliConfig.installPath

    try {
      const legacyInstallPath = this.getLegacyCliInstallPath()
      if (!existsSync(installPath) && !existsSync(legacyInstallPath)) {
        console.log("[CLI] CLI command not installed, nothing to uninstall")
        return { success: true }
      }

      await this.removeCliPathIfPresent(installPath)
      await this.removeCliPathIfPresent(legacyInstallPath)

      // Try to remove directory if empty
      try {
        await rmdir(path.dirname(installPath))
      } catch {
        // Directory not empty or other error, that's okay
      }

      console.log(`[CLI] Uninstalled ${RIPPLE_IDENTITY.cliCommand} command`)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Uninstallation failed"
      console.error("[CLI] Failed to uninstall:", error)
      return { success: false, error: errorMessage }
    }
  }

  isCliInstalled(sourcePath: string): boolean {
    const cliConfig = this.getCliConfig()
    try {
      // Windows: just check if the file exists
      return existsSync(cliConfig.installPath)
    } catch {
      return false
    }
  }
}
