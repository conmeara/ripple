#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BUILD_DIR = join(__dirname, "../build")
const SOURCE_SVG = join(BUILD_DIR, "ripple-logo-source.svg")
const TRAY_SOURCE_SVG = join(BUILD_DIR, "trayTemplate.svg")
const ICON_PNG = join(BUILD_DIR, "icon.png")
const ICON_ICO = join(BUILD_DIR, "icon.ico")
const ICONSET_DIR = join(BUILD_DIR, "icon.iconset")
const ICON_ICNS = join(BUILD_DIR, "icon.icns")
const TRAY_PNG = join(BUILD_DIR, "trayTemplate.png")
const TRAY_PNG_2X = join(BUILD_DIR, "trayTemplate@2x.png")

const ICONSET_SIZES = [
  { size: 16, scale: 1 },
  { size: 16, scale: 2 },
  { size: 32, scale: 1 },
  { size: 32, scale: 2 },
  { size: 128, scale: 1 },
  { size: 128, scale: 2 },
  { size: 256, scale: 1 },
  { size: 256, scale: 2 },
  { size: 512, scale: 1 },
  { size: 512, scale: 2 },
]

const ICO_SIZES = [16, 32, 48, 64, 128, 256]

function assertFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing required icon source: ${path}`)
  }
}

function svgDataUrl(path) {
  const svg = readFileSync(path, "utf8")
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

async function renderSvg(browser, sourcePath, size, outputPath) {
  const page = await browser.newPage()
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><html><head><style>
      html, body { margin: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
      img { display: block; width: ${size}px; height: ${size}px; }
    </style></head><body><img src="${svgDataUrl(sourcePath)}" alt=""></body></html>`,
  )

  const screenshot = await page.screenshot({
    path: outputPath,
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await page.close()
  return Buffer.from(screenshot)
}

function writePngIco(entries, outputPath) {
  const headerSize = 6
  const directorySize = 16 * entries.length
  let imageOffset = headerSize + directorySize

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directories = []
  for (const entry of entries) {
    const directory = Buffer.alloc(16)
    directory.writeUInt8(entry.size === 256 ? 0 : entry.size, 0)
    directory.writeUInt8(entry.size === 256 ? 0 : entry.size, 1)
    directory.writeUInt8(0, 2)
    directory.writeUInt8(0, 3)
    directory.writeUInt16LE(1, 4)
    directory.writeUInt16LE(32, 6)
    directory.writeUInt32LE(entry.buffer.length, 8)
    directory.writeUInt32LE(imageOffset, 12)
    directories.push(directory)
    imageOffset += entry.buffer.length
  }

  writeFileSync(outputPath, Buffer.concat([header, ...directories, ...entries.map((entry) => entry.buffer)]))
}

async function main() {
  assertFile(SOURCE_SVG)
  assertFile(TRAY_SOURCE_SVG)

  if (existsSync(ICONSET_DIR)) {
    rmSync(ICONSET_DIR, { recursive: true, force: true })
  }
  mkdirSync(ICONSET_DIR, { recursive: true })

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: puppeteer.executablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  try {
    console.log("Generating Ripple app icons from SVG source...")

    await renderSvg(browser, SOURCE_SVG, 1024, ICON_PNG)
    console.log("  wrote build/icon.png")

    for (const { size, scale } of ICONSET_SIZES) {
      const actualSize = size * scale
      const filename = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@${scale}x.png`
      await renderSvg(browser, SOURCE_SVG, actualSize, join(ICONSET_DIR, filename))
      console.log(`  wrote build/icon.iconset/${filename}`)
    }

    execFileSync("iconutil", ["-c", "icns", ICONSET_DIR, "-o", ICON_ICNS], { stdio: "pipe" })
    rmSync(ICONSET_DIR, { recursive: true, force: true })
    console.log("  wrote build/icon.icns")

    const icoEntries = []
    for (const size of ICO_SIZES) {
      icoEntries.push({ size, buffer: await renderSvg(browser, SOURCE_SVG, size) })
    }
    writePngIco(icoEntries, ICON_ICO)
    console.log("  wrote build/icon.ico")

    await renderSvg(browser, TRAY_SOURCE_SVG, 22, TRAY_PNG)
    await renderSvg(browser, TRAY_SOURCE_SVG, 44, TRAY_PNG_2X)
    console.log("  wrote tray template PNGs")
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
