#!/usr/bin/env node

/**
 * Legacy fallback: generate generic update manifest files for electron-updater.
 *
 * Official Ripple app updates use electron-builder's GitHub provider and the
 * metadata published to GitHub Releases. Keep this script only for explicit
 * maintainer fallback-provider tests where MAIN_VITE_RIPPLE_UPDATE_URL points
 * at a generic static host.
 *
 * This script generates the Apple Silicon `latest-mac.yml` file that
 * electron-updater uses to check for and download updates.
 *
 * Usage:
 *   node scripts/generate-update-manifest.mjs
 *
 * The script expects Ripple ZIP files to exist in the release/ directory.
 *
 * Run `bun run dist:manifest:fallback` only when testing the fallback path.
 */

import { createHash } from "crypto"
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Parse --channel argument (default: "latest")
const channelArgIndex = process.argv.indexOf("--channel")
const channel = channelArgIndex !== -1 && process.argv[channelArgIndex + 1]
  ? process.argv[channelArgIndex + 1]
  : "latest"

if (channel !== "latest" && channel !== "beta") {
  console.error(`Invalid channel: "${channel}". Must be "latest" or "beta".`)
  process.exit(1)
}

// Get version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
)
const version = process.env.VERSION || packageJson.version

const releaseDir = join(__dirname, "../release")

/**
 * Calculate SHA512 hash of a file and return base64 encoded string
 */
function calculateSha512(filePath) {
  const content = readFileSync(filePath)
  return createHash("sha512").update(content).digest("base64")
}

/**
 * Get file size in bytes using stat (more efficient than reading entire file)
 */
function getFileSize(filePath) {
  return statSync(filePath).size
}

/**
 * Find file matching pattern and extension in release directory
 */
function findReleaseFile(patterns, ext = ".zip") {
  if (!existsSync(releaseDir)) {
    console.error(`Release directory not found: ${releaseDir}`)
    process.exit(1)
  }

  const patternList = Array.isArray(patterns) ? patterns : [patterns]
  const files = readdirSync(releaseDir)
  const match = files.find((f) =>
    patternList.some((pattern) => f.includes(pattern)) && f.endsWith(ext)
  )
  return match ? join(releaseDir, match) : null
}

/**
 * Generate Apple Silicon macOS update manifest.
 */
function generateManifest() {
  const patterns = [`Ripple-${version}-arm64`, `${version}-arm64-mac`, `${version}-arm64`]
  const zipPath = findReleaseFile(patterns, ".zip")

  if (!zipPath) {
    console.warn(`Warning: ZIP file not found for patterns: ${patterns.join(", ")}`)
    console.warn(`Skipping ${arch} manifest generation`)
    return null
  }

  const zipName = zipPath.split("/").pop()
  const sha512 = calculateSha512(zipPath)
  const size = getFileSize(zipPath)

  // electron-updater manifest format
  const manifest = {
    version,
    files: [
      {
        url: zipName,
        sha512,
        size,
      },
    ],
    path: zipName,
    sha512,
    releaseDate: new Date().toISOString(),
  }

  // Manifest file names expected by electron-updater:
  // For stable (latest): latest-mac.yml
  // For beta: beta-mac.yml
  const prefix = channel === "beta" ? "beta" : "latest"
  const manifestFileName = `${prefix}-mac.yml`
  const manifestPath = join(releaseDir, manifestFileName)

  // Convert to YAML format (simple implementation)
  const yaml = objectToYaml(manifest)
  writeFileSync(manifestPath, yaml)

  console.log(`Generated ${manifestFileName}:`)
  console.log(`  Version: ${version}`)
  console.log(`  File: ${zipName}`)
  console.log(`  Size: ${formatBytes(size)}`)
  console.log(`  SHA512: ${sha512.substring(0, 20)}...`)
  console.log()

  return manifestPath
}

/**
 * Convert object to YAML string (simple implementation)
 */
function objectToYaml(obj, indent = 0) {
  const spaces = "  ".repeat(indent)
  let yaml = ""

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`
      for (const item of value) {
        if (typeof item === "object") {
          yaml += `${spaces}  - `
          const itemYaml = objectToYaml(item, 0)
            .split("\n")
            .filter(Boolean)
            .map((line, i) => (i === 0 ? line : `${spaces}    ${line}`))
            .join("\n")
          yaml += itemYaml + "\n"
        } else {
          yaml += `${spaces}  - ${item}\n`
        }
      }
    } else if (typeof value === "object" && value !== null) {
      yaml += `${spaces}${key}:\n`
      yaml += objectToYaml(value, indent + 1)
    } else {
      yaml += `${spaces}${key}: ${value}\n`
    }
  }

  return yaml
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

/**
 * Generate manifest for Linux AppImage
 */
function generateLinuxManifest() {
  const appImagePath = findReleaseFile(`${version}`, ".AppImage")

  if (!appImagePath) {
    console.warn(`Warning: AppImage file not found for version: ${version}`)
    console.warn(`Skipping Linux manifest generation`)
    return null
  }

  const appImageName = appImagePath.split("/").pop()
  const sha512 = calculateSha512(appImagePath)
  const size = getFileSize(appImagePath)

  const manifest = {
    version,
    files: [
      {
        url: appImageName,
        sha512,
        size,
      },
    ],
    path: appImageName,
    sha512,
    releaseDate: new Date().toISOString(),
  }

  const prefix = channel === "beta" ? "beta" : "latest"
  const manifestFileName = `${prefix}-linux.yml`
  const manifestPath = join(releaseDir, manifestFileName)

  const yaml = objectToYaml(manifest)
  writeFileSync(manifestPath, yaml)

  console.log(`Generated ${manifestFileName}:`)
  console.log(`  Version: ${version}`)
  console.log(`  File: ${appImageName}`)
  console.log(`  Size: ${formatBytes(size)}`)
  console.log(`  SHA512: ${sha512.substring(0, 20)}...`)
  console.log()

  return manifestPath
}

// Main execution
console.log("=".repeat(50))
console.log("Generating electron-updater manifests")
console.log("=".repeat(50))
console.log(`Version: ${version}`)
console.log(`Channel: ${channel}`)
console.log(`Release dir: ${releaseDir}`)
console.log()

const arm64Manifest = generateManifest()
const linuxManifest = generateLinuxManifest()

if (!arm64Manifest && !linuxManifest) {
  console.error("No manifest files were generated!")
  console.error("Make sure you have built the app with: npm run dist")
  process.exit(1)
}

console.log("=".repeat(50))
console.log("Manifest generation complete!")
console.log()
const prefix = channel === "beta" ? "beta" : "latest"
console.log("Next steps:")
const uploadDestination = process.env.RIPPLE_RELEASE_UPLOAD_URL || "<configured Ripple release destination>"
console.log(`1. Upload the following files to ${uploadDestination}:`)
if (arm64Manifest) {
  console.log(`   - ${prefix}-mac.yml`)
  console.log(`   - Ripple ${version} arm64 zip and dmg artifacts`)
}
if (linuxManifest) {
  console.log(`   - ${prefix}-linux.yml`)
  console.log(`   - Ripple ${version} Linux AppImage artifact`)
}
console.log("2. Publish release notes in the configured Ripple release channel")
console.log("=".repeat(50))
