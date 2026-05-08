#!/usr/bin/env node
import { chmod, copyFile, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const nodeBinDir = join(repoRoot, "node_modules", ".bin")
const packageBinScript = join(repoRoot, "bin", "ripple.js")
const resourcesCliDir = join(repoRoot, "resources", "cli")
const resourcesBinRoot = join(repoRoot, "resources", "bin")

function platformArch() {
  return `${process.platform}-${process.arch}`
}

function posixRelative(fromDir, target) {
  const value = relative(fromDir, target).replaceAll("\\", "/")
  return value.startsWith(".") ? value : `./${value}`
}

async function stageNodeBinShim() {
  await mkdir(nodeBinDir, { recursive: true })
  await chmod(packageBinScript, 0o755)

  if (process.platform === "win32") {
    const cmdPath = join(nodeBinDir, "ripple.cmd")
    const relativeScript = relative(nodeBinDir, packageBinScript)
    await writeFile(
      cmdPath,
      [
        "@echo off",
        "setlocal",
        `node "%~dp0\\${relativeScript}" %*`,
        "exit /b %ERRORLEVEL%",
        "",
      ].join("\r\n"),
      "utf8",
    )
    return
  }

  const shimPath = join(nodeBinDir, "ripple")
  await rm(shimPath, { force: true })
  await symlink(posixRelative(nodeBinDir, packageBinScript), shimPath)
}

async function stagePackagedBinWrappers() {
  await mkdir(join(resourcesBinRoot, platformArch()), { recursive: true })
  const entries = await readdir(resourcesBinRoot, { withFileTypes: true })
  const platformDirs = entries
    .filter((entry) => entry.isDirectory() && /^[a-z0-9]+-[a-z0-9]+$/i.test(entry.name))
    .map((entry) => entry.name)

  for (const dirName of new Set([...platformDirs, platformArch()])) {
    const isWindows = dirName.startsWith("win32-")
    const source = join(resourcesCliDir, isWindows ? "ripple.cmd" : "ripple")
    if (!existsSync(source)) continue
    const destination = join(resourcesBinRoot, dirName, isWindows ? "ripple.cmd" : "ripple")
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
    if (!isWindows) await chmod(destination, 0o755)
  }
}

await stageNodeBinShim()
await stagePackagedBinWrappers()
