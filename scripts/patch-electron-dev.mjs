// Patches the Electron.app bundle in node_modules to show Ripple identity in macOS dev mode.
import { execFileSync } from "child_process"
import { copyFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const electronApp = join(root, "node_modules/electron/dist/Electron.app")
const plistPath = join(electronApp, "Contents/Info.plist")
const icnsSource = join(root, "build/icon.icns")
const icnsDest = join(electronApp, "Contents/Resources/electron.icns")

const devName = "Ripple Dev"
const devBundleId = "app.ripple.desktop.dev"

if (process.platform !== "darwin") {
  process.exit(0)
}

function setPlistValue(key, value) {
  execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath])
}

if (existsSync(plistPath)) {
  try {
    setPlistValue("CFBundleName", devName)
    setPlistValue("CFBundleDisplayName", devName)
    setPlistValue("CFBundleIdentifier", devBundleId)
    console.log(
      `[patch-electron-dev] Updated Info.plist: name -> ${devName}, bundle id -> ${devBundleId}`,
    )
  } catch (e) {
    console.warn("[patch-electron-dev] Failed to update Info.plist:", e.message)
  }
}

if (existsSync(icnsSource) && existsSync(icnsDest)) {
  copyFileSync(icnsSource, icnsDest)
  console.log("[patch-electron-dev] Replaced electron.icns with custom icon")
}

// Touch the .app bundle so macOS re-reads it
if (existsSync(electronApp)) {
  execFileSync("touch", [electronApp])
}
