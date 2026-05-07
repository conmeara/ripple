import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { resolveProducerBrowserPath } from "../../hyperframes/runtime"
import { getVisualCaptureBackend } from "../backend-registry"
import type { VisualContextBackendId } from "../types"

const repoRoot = process.cwd()
const timedTest = test as unknown as (
  name: string,
  fn: () => unknown | Promise<unknown>,
  timeout: number,
) => void

interface DecodedPng {
  width: number
  height: number
  data: Uint8Array
}

function shouldSkipBrowserQa(): boolean {
  return !resolveProducerBrowserPath(repoRoot)
}

async function makeTransparencyProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-visual-transparency-"))
  await mkdir(projectDir, { recursive: true })
  await writeFile(join(projectDir, "hyperframes.json"), JSON.stringify({
    entry: "index.html",
    width: 64,
    height: 64,
    fps: 30,
  }))
  await writeFile(join(projectDir, "index.html"), `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: transparent; }
      main { position: relative; width: 64px; height: 64px; overflow: hidden; }
      .box { position: absolute; left: 16px; top: 16px; width: 32px; height: 32px; background: rgba(255, 0, 0, 0.5); }
    </style>
  </head>
  <body>
    <main data-composition-id="transparent" data-width="64" data-height="64" data-duration="1" data-fps="30">
      <div class="box"></div>
    </main>
    <script>
      window.__hf = { duration: 1, seek: function () {} };
    </script>
  </body>
</html>`)
  return projectDir
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
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Expected RGBA PNG output, got bitDepth=${bitDepth} colorType=${colorType}`)
  }

  const channels = 4
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
      if (filter === 0) row[x] = raw
      else if (filter === 1) row[x] = (raw + left) & 0xff
      else if (filter === 2) row[x] = (raw + above) & 0xff
      else if (filter === 3) row[x] = (raw + Math.floor((left + above) / 2)) & 0xff
      else if (filter === 4) row[x] = (raw + paethPredictor(left, above, upperLeft)) & 0xff
      else throw new Error(`Unsupported PNG filter: ${filter}`)
    }
    rawOffset += stride
    rgba.set(row, rgbaOffset)
    rgbaOffset += stride
    previous = row
  }

  return { width, height, data: rgba }
}

function alphaAt(image: DecodedPng, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3]
}

async function expectTransparentCapture(backendId: Exclude<VisualContextBackendId, "preview" | "fast-browser" | "hyperframes-cli">): Promise<void> {
  const backend = getVisualCaptureBackend(backendId)
  expect(backend).toBeTruthy()
  const projectDir = await makeTransparencyProject()
  let cleanupPaths: string[] = []
  try {
    const result = await backend!.captureFrames({
      projectPath: projectDir,
      timestampsMs: [0],
      fps: 30,
      width: 64,
      height: 64,
      format: "png",
      timeoutMs: 5000,
      reason: "qa",
      repoRoot,
    })
    cleanupPaths = result.cleanupPaths
    const image = decodePngBytes(await readFile(result.frames[0].path))
    expect(image.width).toBe(64)
    expect(image.height).toBe(64)
    expect(alphaAt(image, 2, 2)).toBe(0)
    expect(alphaAt(image, 32, 32)).toBeGreaterThan(110)
    expect(alphaAt(image, 32, 32)).toBeLessThan(150)
  } finally {
    await backend?.dispose?.()
    await Promise.all(cleanupPaths.map((path) =>
      rm(path, { recursive: true, force: true }).catch(() => undefined)
    ))
    await rm(projectDir, { recursive: true, force: true })
  }
}

describe("Visual context transparency spike", () => {
  timedTest("preserves transparent PNG alpha through Engine capture", async () => {
    if (shouldSkipBrowserQa()) return
    await expectTransparentCapture("engine")
  }, 60000)

  timedTest("preserves transparent PNG alpha through Producer capture", async () => {
    if (shouldSkipBrowserQa()) return
    await expectTransparentCapture("producer-capture")
  }, 60000)
})
