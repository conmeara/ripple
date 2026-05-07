import { describe, expect, test } from "bun:test"
import { createServer, type Server } from "node:http"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { extname, isAbsolute, join, relative, resolve } from "node:path"
import { inflateSync } from "node:zlib"
import {
  captureFramesWithFastBrowser,
  runFrameSheetCommand,
} from "../../../cli/frame-sheet"
import {
  buildHyperframesEnvironment,
  resolveProducerBrowserPath,
  runHyperframesCommand,
} from "./runtime"

const repoRoot = process.cwd()
const qaFixtureRoot = resolve(repoRoot, "test", "fixtures", "hyperframes", "visual-capture-qa")
const appManagedBrowserPath = resolveProducerBrowserPath(repoRoot)
const timedTest = test as unknown as (
  name: string,
  fn: () => unknown | Promise<unknown>,
  timeout: number,
) => void

function shouldSkipBrowserQa(): boolean {
  return !appManagedBrowserPath
}

interface DecodedPng {
  width: number
  height: number
  data: Uint8Array
}

interface Rgb {
  r: number
  g: number
  b: number
}

async function makeQaProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-visual-capture-qa-"))
  await cp(qaFixtureRoot, projectDir, { recursive: true })
  return projectDir
}

function contentTypeForPath(path: string): string {
  if (extname(path) === ".html") return "text/html; charset=utf-8"
  if (extname(path) === ".js") return "text/javascript; charset=utf-8"
  if (extname(path) === ".json") return "application/json; charset=utf-8"
  if (extname(path) === ".png") return "image/png"
  return "application/octet-stream"
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose())
  })
}

async function serveStaticProject(projectDir: string): Promise<{
  server: Server
  url: string
}> {
  const projectRoot = resolve(projectDir)
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")
      const requestPath = requestUrl.pathname === "/"
        ? "index.html"
        : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "")
      const filePath = resolve(projectRoot, requestPath)
      const rel = relative(projectRoot, filePath)
      if (rel.startsWith("..") || isAbsolute(rel)) {
        response.writeHead(403)
        response.end("Forbidden")
        return
      }

      response.writeHead(200, { "content-type": contentTypeForPath(filePath) })
      response.end(await readFile(filePath))
    } catch {
      response.writeHead(404)
      response.end("Not found")
    }
  })

  const port = await new Promise<number>((resolvePort, rejectPort) => {
    server.on("error", rejectPort)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address === "object" && address?.port) {
        resolvePort(address.port)
      } else {
        rejectPort(new Error("Failed to bind visual capture QA server."))
      }
    })
  })

  return {
    server,
    url: `http://127.0.0.1:${port}`,
  }
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  if (aboveDistance <= upperLeftDistance) return above
  return upperLeft
}

function decodePngBytes(buffer: Buffer): DecodedPng {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error("Expected a PNG image.")
  }

  let offset = signature.length
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString("ascii", offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const data = buffer.subarray(dataStart, dataEnd)
    offset = dataEnd + 4

    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data))
    } else if (type === "IEND") {
      break
    }
  }

  if (width <= 0 || height <= 0) throw new Error("PNG image is missing dimensions.")
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`)
  }

  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const inflated = inflateSync(Buffer.concat(idatChunks))
  const rgba = new Uint8Array(width * height * 4)
  let rawOffset = 0
  let rgbaOffset = 0
  let previous = new Uint8Array(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[rawOffset]
    rawOffset += 1
    const row = new Uint8Array(stride)

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[rawOffset + x]
      const left = x >= channels ? row[x - channels] : 0
      const above = previous[x] ?? 0
      const upperLeft = x >= channels ? previous[x - channels] ?? 0 : 0

      if (filter === 0) {
        row[x] = raw
      } else if (filter === 1) {
        row[x] = (raw + left) & 0xff
      } else if (filter === 2) {
        row[x] = (raw + above) & 0xff
      } else if (filter === 3) {
        row[x] = (raw + Math.floor((left + above) / 2)) & 0xff
      } else if (filter === 4) {
        row[x] = (raw + paethPredictor(left, above, upperLeft)) & 0xff
      } else {
        throw new Error(`Unsupported PNG filter: ${filter}`)
      }
    }

    rawOffset += stride
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = x * channels
      rgba[rgbaOffset] = row[sourceOffset]
      rgba[rgbaOffset + 1] = row[sourceOffset + 1]
      rgba[rgbaOffset + 2] = row[sourceOffset + 2]
      rgba[rgbaOffset + 3] = channels === 4 ? row[sourceOffset + 3] : 255
      rgbaOffset += 4
    }
    previous = row
  }

  return { width, height, data: rgba }
}

async function decodePng(path: string): Promise<DecodedPng> {
  return decodePngBytes(await readFile(path))
}

function rgbAt(image: DecodedPng, x: number, y: number): Rgb {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) {
    throw new Error(`Pixel ${x},${y} is outside ${image.width}x${image.height}.`)
  }
  const offset = (y * image.width + x) * 4
  return {
    r: image.data[offset],
    g: image.data[offset + 1],
    b: image.data[offset + 2],
  }
}

function expectRgbClose(actual: Rgb, expected: Rgb, tolerance = 4): void {
  expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(tolerance)
}

function expectedBackgroundColor(timeSeconds: number): Rgb {
  const clamped = Math.max(0, Math.min(1, timeSeconds))
  return {
    r: Math.round(24 + 80 * clamped),
    g: Math.round(42 + 60 * clamped),
    b: Math.round(92 + 30 * clamped),
  }
}

function comparePngPixels(a: DecodedPng, b: DecodedPng): {
  changedPixelRatio: number
  maxChannelDelta: number
  meanChannelDelta: number
} {
  expect(a.width).toBe(b.width)
  expect(a.height).toBe(b.height)

  const pixels = a.width * a.height
  let changedPixels = 0
  let totalDelta = 0
  let maxChannelDelta = 0

  for (let offset = 0; offset < a.data.length; offset += 4) {
    const redDelta = Math.abs(a.data[offset] - b.data[offset])
    const greenDelta = Math.abs(a.data[offset + 1] - b.data[offset + 1])
    const blueDelta = Math.abs(a.data[offset + 2] - b.data[offset + 2])
    const pixelMax = Math.max(redDelta, greenDelta, blueDelta)
    totalDelta += redDelta + greenDelta + blueDelta
    maxChannelDelta = Math.max(maxChannelDelta, pixelMax)
    if (pixelMax > 2) changedPixels += 1
  }

  return {
    changedPixelRatio: changedPixels / pixels,
    maxChannelDelta,
    meanChannelDelta: totalDelta / (pixels * 3),
  }
}

async function newestSnapshotPath(projectDir: string): Promise<string> {
  const snapshotDir = join(projectDir, "snapshots")
  const entries = await readdir(snapshotDir)
  const files = await Promise.all(entries
    .filter((entry) => entry.endsWith(".png"))
    .map(async (entry) => {
      const path = join(snapshotDir, entry)
      const info = await stat(path)
      return { path, mtimeMs: info.mtimeMs }
    }))
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  if (!files[0]) throw new Error("HyperFrames snapshot did not write a PNG.")
  return files[0].path
}

async function captureFrameWithHyperframesProducer(input: {
  projectDir: string
  timeSeconds: number
}): Promise<{ path: string; elapsedMs: number }> {
  if (!appManagedBrowserPath) {
    throw new Error("Ripple visual capture QA requires an app-managed browser.")
  }

  const served = await serveStaticProject(input.projectDir)
  const outputDir = join(input.projectDir, ".ripple", "producer-capture")
  await mkdir(outputDir, { recursive: true })
  const startedAt = performance.now()

  try {
    const importer = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<any>
    const producer = await importer("@hyperframes/producer")
    const session = await producer.createCaptureSession(
      served.url,
      outputDir,
      {
        width: 1920,
        height: 1080,
        fps: 30,
        format: "png",
      },
      null,
      {
        chromePath: appManagedBrowserPath,
        forceScreenshot: true,
      } as any,
    )

    try {
      await producer.initializeSession(session)
      const frame = await producer.captureFrame(session, 0, input.timeSeconds)
      return {
        path: frame.path,
        elapsedMs: performance.now() - startedAt,
      }
    } finally {
      await producer.closeCaptureSession(session)
    }
  } finally {
    await closeServer(served.server)
  }
}

describe("Ripple visual capture QA", () => {
  timedTest("matches HyperFrames producer pixels while keeping CLI snapshot healthy", async () => {
    if (shouldSkipBrowserQa()) return

    const projectDir = await makeQaProject()
    let cleanupPaths: string[] = []

    try {
      const fastStartedAt = performance.now()
      const fastCapture = await captureFramesWithFastBrowser({
        projectDir,
        timestampsMs: [500],
        timeoutMs: 5000,
        columns: 1,
        maxSheetWidth: 1920,
        settleMs: 0,
        env: buildHyperframesEnvironment(process.env, { repoRoot }),
        repoRoot,
      })
      cleanupPaths = fastCapture.cleanupPaths ?? []
      const fastElapsedMs = performance.now() - fastStartedAt

      expect(fastCapture.framePaths).toHaveLength(1)
      const fastImage = await decodePng(fastCapture.framePaths[0])
      expect(fastImage.width).toBe(1920)
      expect(fastImage.height).toBe(1080)
      expectRgbClose(rgbAt(fastImage, 24, 24), expectedBackgroundColor(0.5))

      const producerCapture = await captureFrameWithHyperframesProducer({
        projectDir,
        timeSeconds: 0.5,
      })
      const producerImage = await decodePng(producerCapture.path)
      expect(producerImage.width).toBe(1920)
      expect(producerImage.height).toBe(1080)
      expectRgbClose(rgbAt(producerImage, 24, 24), expectedBackgroundColor(0.5))

      const diff = comparePngPixels(fastImage, producerImage)
      expect(diff.meanChannelDelta).toBeLessThanOrEqual(0.05)
      expect(diff.changedPixelRatio).toBeLessThanOrEqual(0.0001)
      expect(diff.maxChannelDelta).toBeLessThanOrEqual(3)
      expect(fastElapsedMs).toBeLessThan(7000)
      expect(producerCapture.elapsedMs).toBeLessThan(7000)

      const cliStartedAt = performance.now()
      const cliResult = await runHyperframesCommand([
        "snapshot",
        "--at",
        "0.5",
        "--timeout",
        "5000",
        projectDir,
      ], {
        cwd: projectDir,
        repoRoot,
        timeout: 30000,
      })
      const cliElapsedMs = performance.now() - cliStartedAt

      expect(cliResult.ok).toBe(true)
      const cliImage = await decodePng(await newestSnapshotPath(projectDir))
      expect(cliImage.width).toBe(1920)
      expect(cliImage.height).toBe(1080)
      expect(cliElapsedMs).toBeLessThan(30000)
      expect(fastElapsedMs).toBeLessThan(cliElapsedMs)
    } finally {
      await Promise.all(cleanupPaths.map((path) =>
        rm(path, { recursive: true, force: true }).catch(() => undefined)
      ))
      await rm(projectDir, { recursive: true, force: true })
    }
  }, 60000)

  timedTest("keeps frame sheets compact, timed, and pixel-readable for agent intake", async () => {
    if (shouldSkipBrowserQa()) return

    const projectDir = await makeQaProject()

    try {
      const startedAt = performance.now()
      const result = await runFrameSheetCommand([
        "--dir",
        projectDir,
        "--at",
        "0s,0.5s,1s",
        "--columns",
        "3",
        "--max-sheet-width",
        "1440",
        "--json",
      ], {
        cwd: projectDir,
        repoRoot,
      })
      const elapsedMs = performance.now() - startedAt

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout) as {
        ok?: boolean
        sheet?: { path?: string; manifestPath?: string }
      }
      expect(payload.ok).toBe(true)
      expect(payload.sheet?.path).toBeTruthy()
      expect(payload.sheet?.manifestPath).toBeTruthy()

      const sheetPath = join(projectDir, payload.sheet?.path ?? "")
      const manifest = JSON.parse(
        await readFile(join(projectDir, payload.sheet?.manifestPath ?? ""), "utf8"),
      ) as {
        columns: number
        rows: number
        samples: Array<{ timeMs: number; frame: number }>
      }
      const sheet = await decodePng(sheetPath)
      const sheetInfo = await stat(sheetPath)

      expect(manifest.columns).toBe(3)
      expect(manifest.rows).toBe(1)
      expect(manifest.samples.map((sample) => sample.timeMs)).toEqual([0, 500, 1000])
      expect(manifest.samples.map((sample) => sample.frame)).toEqual([0, 15, 30])
      expect(sheet.width).toBe(1440)
      expect(sheet.height).toBe(270)
      expect(sheet.width / manifest.columns).toBeGreaterThanOrEqual(360)
      expect(sheetInfo.size).toBeGreaterThan(1000)
      expect(sheetInfo.size).toBeLessThan(2_500_000)
      expect(elapsedMs).toBeLessThan(10000)

      const cellWidth = sheet.width / manifest.columns
      for (const [index, sample] of manifest.samples.entries()) {
        const x = Math.floor(index * cellWidth + 24)
        expectRgbClose(
          rgbAt(sheet, x, 24),
          expectedBackgroundColor(sample.timeMs / 1000),
        )
      }
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  }, 60000)
})
