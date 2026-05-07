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
const ICON_LIGHT_PNG = join(BUILD_DIR, "icon-light.png")
const ICON_DARK_PNG = join(BUILD_DIR, "icon-dark.png")
const ICON_ICO = join(BUILD_DIR, "icon.ico")
const ICONSET_DIR = join(BUILD_DIR, "icon.iconset")
const ICON_ICNS = join(BUILD_DIR, "icon.icns")
const ICON_COMPOSER_DIR = join(BUILD_DIR, "icon.icon")
const ICON_COMPOSER_ASSETS_DIR = join(ICON_COMPOSER_DIR, "Assets")
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
const APP_ICON_MARK_SCALE = 0.78
const APP_ICON_MARK_OFFSET = Number(((1024 * (1 - APP_ICON_MARK_SCALE)) / 2).toFixed(2))
const DOCK_ICON_TILE_SCALE = 0.86
const DOCK_ICON_TILE_OFFSET = Number(((1024 * (1 - DOCK_ICON_TILE_SCALE)) / 2).toFixed(2))

function appIconMarkTransform() {
  return `translate(${APP_ICON_MARK_OFFSET} ${APP_ICON_MARK_OFFSET}) scale(${APP_ICON_MARK_SCALE})`
}

function dockIconTileTransform() {
  return `translate(${DOCK_ICON_TILE_OFFSET} ${DOCK_ICON_TILE_OFFSET}) scale(${DOCK_ICON_TILE_SCALE})`
}

function assertFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing required icon source: ${path}`)
  }
}

function svgDataUrl(path) {
  const svg = readFileSync(path, "utf8")
  return svgMarkupDataUrl(svg)
}

function svgMarkupDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

async function renderSvg(browser, sourcePath, size, outputPath) {
  return renderSvgDataUrl(browser, svgDataUrl(sourcePath), size, outputPath)
}

async function renderSvgMarkup(browser, svg, size, outputPath) {
  return renderSvgDataUrl(browser, svgMarkupDataUrl(svg), size, outputPath)
}

async function renderSvgDataUrl(browser, dataUrl, size, outputPath) {
  const page = await browser.newPage()
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><html><head><style>
      html, body { margin: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
      img { display: block; width: ${size}px; height: ${size}px; }
    </style></head><body><img src="${dataUrl}" alt=""></body></html>`,
  )

  const screenshot = await page.screenshot({
    path: outputPath,
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await page.close()
  return Buffer.from(screenshot)
}

function appIconDefs(markColor) {
  return `<defs>
    <filter id="mark-shadow" x="198" y="323" width="628" height="378" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000000" flood-opacity="${markColor === "#FFFFFF" ? "0.34" : "0.16"}"/>
    </filter>
    <filter id="playhead-shadow" x="433" y="108" width="158" height="808" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#000000" flood-opacity="${markColor === "#FFFFFF" ? "0.34" : "0.16"}"/>
    </filter>
    <clipPath id="tileClip">
      <rect width="1024" height="1024" rx="220"/>
    </clipPath>
  </defs>`
}

function appIconTile({ backgroundColor, markColor }) {
  return `<g clip-path="url(#tileClip)">
    <rect width="1024" height="1024" rx="220" fill="${backgroundColor}"/>

    <g transform="${appIconMarkTransform()}">
      <g filter="url(#mark-shadow)" stroke="${markColor}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round">
        <path d="M360 390L254 512L360 634"/>
        <path d="M664 390L770 512L664 634"/>
      </g>

      <g filter="url(#playhead-shadow)">
        <rect x="480" y="154" width="64" height="716" rx="32" fill="${markColor}"/>
      </g>
    </g>
  </g>`
}

function appIconSvg({ backgroundColor, markColor }) {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${appIconDefs(markColor)}

  ${appIconTile({ backgroundColor, markColor })}
</svg>`
}

function dockIconSvg({ backgroundColor, markColor }) {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${appIconDefs(markColor)}

  <g transform="${dockIconTileTransform()}">
    ${appIconTile({ backgroundColor, markColor })}
  </g>
</svg>`
}

function iconComposerMarkSvg() {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g transform="${appIconMarkTransform()}">
    <g stroke="black" stroke-width="56" stroke-linecap="round" stroke-linejoin="round">
      <path d="M360 390L254 512L360 634"/>
      <path d="M664 390L770 512L664 634"/>
    </g>
    <rect x="480" y="154" width="64" height="716" rx="32" fill="black"/>
  </g>
</svg>`
}

function writeIconComposerDocument() {
  if (existsSync(ICON_COMPOSER_DIR)) {
    rmSync(ICON_COMPOSER_DIR, { recursive: true, force: true })
  }

  mkdirSync(ICON_COMPOSER_ASSETS_DIR, { recursive: true })
  writeFileSync(join(ICON_COMPOSER_ASSETS_DIR, "ripple-mark.svg"), iconComposerMarkSvg())
  writeFileSync(
    join(ICON_COMPOSER_DIR, "icon.json"),
    `${JSON.stringify({
      fill: {
        solid: "display-p3:0.98000,0.98000,0.96000,1.00000",
      },
      "fill-specializations": [
        {
          appearance: "dark",
          value: {
            solid: "display-p3:0.02000,0.02000,0.02000,1.00000",
          },
        },
        {
          appearance: "tinted",
          value: "system-light",
        },
      ],
      groups: [
        {
          layers: [
            {
              "fill-specializations": [
                {
                  value: {
                    solid: "display-p3:0.02000,0.02000,0.02000,1.00000",
                  },
                },
                {
                  appearance: "dark",
                  value: {
                    solid: "display-p3:0.98000,0.98000,0.96000,1.00000",
                  },
                },
                {
                  appearance: "tinted",
                  value: {
                    solid: "display-p3:0.98000,0.98000,0.96000,1.00000",
                  },
                },
              ],
              glass: false,
              hidden: false,
              "image-name": "ripple-mark.svg",
              name: "Ripple Mark",
              opacity: 1,
            },
          ],
          shadow: {
            kind: "layer-color",
            opacity: 0.24,
          },
          translucency: {
            enabled: false,
            value: 0,
          },
        },
      ],
      "supported-platforms": {
        squares: [
          "macOS",
        ],
      },
    }, null, 2)}\n`,
  )
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

    await renderSvgMarkup(
      browser,
      dockIconSvg({
        backgroundColor: "#FBFBF6",
        markColor: "#050505",
      }),
      1024,
      ICON_LIGHT_PNG,
    )
    console.log("  wrote build/icon-light.png")

    await renderSvgMarkup(
      browser,
      dockIconSvg({
        backgroundColor: "#050505",
        markColor: "#FFFFFF",
      }),
      1024,
      ICON_DARK_PNG,
    )
    console.log("  wrote build/icon-dark.png")

    writeIconComposerDocument()
    console.log("  wrote build/icon.icon")

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
