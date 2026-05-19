import { describe, expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { inflateSync } from "node:zlib"
import {
  createVisualContextEndpoint,
  createVisualContextFileBridge,
  createVisualContextService,
  type VisualCaptureBackend,
  type VisualCaptureFramesRequest,
  type VisualCaptureFramesResult,
} from "../../src/main/lib/visual-context"
import { buildRippleAgentToolEnvironment } from "../../src/main/lib/agent-runtime/cli-tools-env"
import { prepareAgentVisualContextHandoff } from "../../src/main/lib/agent-runtime/visual-context-handoff"
import { captureCommentVisualForAnchor } from "../../src/main/lib/revisions/comment-visuals"
import { runRippleCli } from "../../src/cli/ripple"

const repoRoot = process.cwd()
const fixtureRoot = resolve(repoRoot, "test", "fixtures", "hyperframes", "visual-capture-qa")
const CLI_CAPTURE_MAX_MS = process.env.CI ? 30000 : 15000
const timedTest = test as unknown as (
  name: string,
  fn: () => unknown | Promise<unknown>,
  timeout: number,
) => void

function execRipple(
  args: string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
  },
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile("ripple", args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      timeout: CLI_CAPTURE_MAX_MS,
    }, (error, stdout, stderr) => {
      if (error) {
        if (stderr) error.message = `${error.message}\n${stderr}`
        reject(error)
        return
      }
      resolvePromise(stdout)
    })
  })
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

async function makeProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-visual-matrix-"))
  await cp(fixtureRoot, projectDir, { recursive: true })
  await rm(join(projectDir, ".ripple"), { recursive: true, force: true })
  return projectDir
}

async function addExternalComposition(projectDir: string): Promise<string> {
  const compositionPath = "compositions/app-showcase.html"
  await mkdir(join(projectDir, "compositions"), { recursive: true })
  await writeFile(join(projectDir, compositionPath), `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #111827;
      }

      [data-composition-id="app-showcase"] {
        position: relative;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
      }

      .background {
        position: absolute;
        inset: 0;
        background: rgb(139, 92, 246);
      }
    </style>
  </head>
  <body>
    <main
      data-composition-id="app-showcase"
      data-width="1920"
      data-height="1080"
      data-duration="1"
      data-fps="30"
    >
      <div class="background"></div>
    </main>
    <script data-hyperframes-preview-runtime="1" src="../runtime-stub.js"></script>
    <script>
      (function () {
        function render() {}
        var timeline = {
          pause: function () {},
          seek: render,
          totalTime: render,
          duration: function () {
            return 1;
          }
        };

        function installCaptureHooks() {
          window.__timelines = window.__timelines || {};
          window.__timelines["app-showcase"] = timeline;
          window.__player = {
            duration: 1,
            seek: render,
            renderSeek: render
          };
          window.__hf = {
            duration: 1,
            seek: render
          };
          window.__playerReady = true;
        }

        installCaptureHooks();
        window.setTimeout(installCaptureHooks, 0);
      })();
    </script>
  </body>
</html>`)
  return compositionPath
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
  const offset = (y * image.width + x) * 4
  return {
    r: image.data[offset],
    g: image.data[offset + 1],
    b: image.data[offset + 2],
  }
}

function expectedBackgroundColor(timeSeconds: number): Rgb {
  const clamped = Math.max(0, Math.min(1, timeSeconds))
  return {
    r: Math.round(24 + 80 * clamped),
    g: Math.round(42 + 60 * clamped),
    b: Math.round(92 + 30 * clamped),
  }
}

function expectRgbClose(actual: Rgb, expected: Rgb, tolerance = 4): void {
  expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(tolerance)
}

async function expectPngQuality(input: {
  path: string
  width: number
  height: number
  expectedTimeSeconds: number
}): Promise<void> {
  const image = await decodePng(input.path)
  const info = await stat(input.path)
  expect(image.width).toBe(input.width)
  expect(image.height).toBe(input.height)
  expect(info.size).toBeGreaterThan(1000)
  expectRgbClose(rgbAt(image, 24, 24), expectedBackgroundColor(input.expectedTimeSeconds))
}

async function expectPngStaticColor(input: {
  path: string
  width: number
  height: number
  expected: Rgb
}): Promise<void> {
  const image = await decodePng(input.path)
  const info = await stat(input.path)
  expect(image.width).toBe(input.width)
  expect(image.height).toBe(input.height)
  expect(info.size).toBeGreaterThan(1000)
  expectRgbClose(rgbAt(image, 24, 24), input.expected)
}

function fakeDbReturning(thread: unknown) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => thread,
        }),
      }),
    }),
  } as any
}

async function capturePreviewFixture(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult> {
  const renderService = createVisualContextService({ backendOrder: ["engine"] })
  try {
    const result = await renderService.captureFrames({
      ...input,
      intent: "specific-frame",
      preferredBackend: "engine",
      previewSurfaceKey: null,
    })
    return {
      ...result,
      backend: "preview",
    }
  } finally {
    await renderService.shutdown()
  }
}

function createVisualContextServiceWithPreviewHarness() {
  const previewBackend: VisualCaptureBackend = {
    id: "preview",
    supportsWarmSession: true,
    captureFrames: capturePreviewFixture,
  }
  return createVisualContextService({
    backends: {
      preview: previewBackend,
    },
  })
}

function currentFrameSnapshot(projectDir: string) {
  return {
    projectPath: projectDir,
    sourcePath: projectDir,
    projectId: "project-1",
    compositionId: "main",
    compositionPath: "index.html",
    previewSurfaceKey: "project-1:main:main",
    timeMs: 500,
    fps: 30,
    width: 1920,
    height: 1080,
  }
}

describe("Visual Context quality and speed matrix", () => {
  timedTest("covers explicit snapshot, quality, and timing", async () => {
    const projectDir = await makeProject()
    try {
      const startedAt = performance.now()
      const result = await runRippleCli([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "0.5s",
        "--backend",
        "engine",
        "--json",
      ], {
        cwd: projectDir,
        repoRoot,
      })
      const elapsedMs = performance.now() - startedAt

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(true)
      expect(payload.backend).toBe("engine")
      expect(payload.snapshot.sample).toEqual({ timeMs: 500, frame: 15 })
      expect(elapsedMs).toBeLessThan(7000)
      await expectPngQuality({
        path: join(projectDir, payload.snapshot.path),
        width: 1920,
        height: 1080,
        expectedTimeSeconds: 0.5,
      })
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  }, 60000)

  timedTest("covers current-frame snapshot, quality, and timing", async () => {
    const projectDir = await makeProject()
    const service = createVisualContextServiceWithPreviewHarness()
    const endpoint = await createVisualContextEndpoint({
      service,
      workspaceRoot: projectDir,
      resolveCurrentFrameSnapshot: async () => currentFrameSnapshot(projectDir),
    })

    try {
      const startedAt = performance.now()
      const result = await runRippleCli([
        "snapshot",
        "--dir",
        projectDir,
        "--at",
        "current",
        "--json",
      ], {
        cwd: projectDir,
        repoRoot,
        env: {
          RIPPLE_AGENT_VISUAL_CONTEXT_MODE: "clean",
          RIPPLE_VISUAL_CONTEXT_ENDPOINT: endpoint.endpoint,
          RIPPLE_VISUAL_CONTEXT_TOKEN: endpoint.token,
        },
      })
      const elapsedMs = performance.now() - startedAt

      expect(result.exitCode).toBe(0)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(true)
      expect(payload.type).toBe("snapshot")
      expect(payload.snapshot.sample).toEqual({ timeMs: 500, frame: 15 })
      expect(result.stdout).not.toContain("backend")
      expect(result.stdout).not.toContain("endpoint")
      expect(result.stdout).not.toContain("handoff")
      expect(result.stdout).not.toContain("fallback")
      expect(elapsedMs).toBeLessThan(7000)
      await expectPngQuality({
        path: join(projectDir, payload.snapshot.path),
        width: 1920,
        height: 1080,
        expectedTimeSeconds: 0.5,
      })
    } finally {
      await endpoint.close()
      await service.shutdown()
      await rm(projectDir, { recursive: true, force: true })
    }
  }, 60000)

  timedTest("covers sheet and frame-sheet artifacts, quality, and timing", async () => {
    const projectDir = await makeProject()
    try {
      const sheetStartedAt = performance.now()
      const sheetResult = await runRippleCli([
        "sheet",
        "--dir",
        projectDir,
        "--at",
        "0s,0.5s,1s",
        "--columns",
        "3",
        "--json",
      ], {
        cwd: projectDir,
        repoRoot,
      })
      const sheetElapsedMs = performance.now() - sheetStartedAt

      expect(sheetResult.exitCode).toBe(0)
      const sheetPayload = JSON.parse(sheetResult.stdout)
      expect(sheetPayload.ok).toBe(true)
      expect(sheetPayload.backend).toBe("engine")
      expect(sheetElapsedMs).toBeLessThan(10000)

      const sheetPath = join(projectDir, sheetPayload.sheet.path)
      const sheet = await decodePng(sheetPath)
      const sheetInfo = await stat(sheetPath)
      const manifest = JSON.parse(
        await readFile(join(projectDir, sheetPayload.sheet.manifestPath), "utf8"),
      )
      expect(manifest.samples.map((sample: { timeMs: number }) => sample.timeMs)).toEqual([0, 500, 1000])
      expect(sheet.width).toBe(1440)
      expect(sheet.height).toBe(270)
      expect(sheetInfo.size).toBeGreaterThan(1000)
      expect(sheetInfo.size).toBeLessThan(2_500_000)
      const cellWidth = sheet.width / 3
      for (const [index, sample] of manifest.samples.entries()) {
        expectRgbClose(
          rgbAt(sheet, Math.floor(index * cellWidth + 24), 24),
          expectedBackgroundColor(sample.timeMs / 1000),
        )
      }

      const contextStartedAt = performance.now()
      const contextResult = await runRippleCli([
        "frame-sheet",
        "--dir",
        projectDir,
        "--range",
        "0s..1s",
        "--samples",
        "3",
        "--columns",
        "3",
        "--json",
      ], {
        cwd: projectDir,
        repoRoot,
        env: {
          RIPPLE_AGENT_VISUAL_CONTEXT_MODE: "clean",
        },
      })
      const contextElapsedMs = performance.now() - contextStartedAt
      expect(contextResult.exitCode).toBe(0)
      const contextPayload = JSON.parse(contextResult.stdout)
      expect(contextPayload.ok).toBe(true)
      expect(contextPayload.type).toBe("sheet")
      expect(contextPayload.context.samples.map((sample: { timeMs: number }) => sample.timeMs)).toEqual([0, 500, 1000])
      expect(contextResult.stdout).not.toContain("backend")
      expect(contextResult.stdout).not.toContain("endpoint")
      expect(contextResult.stdout).not.toContain("handoff")
      expect(contextResult.stdout).not.toContain("fallback")
      expect(contextElapsedMs).toBeLessThan(10000)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  }, 60000)

  timedTest("covers comment frame and range visuals, quality, and timing", async () => {
    const projectDir = await makeProject()
    try {
      const externalCompositionPath = await addExternalComposition(projectDir)
      const frameStartedAt = performance.now()
      const frameResult = await captureCommentVisualForAnchor({
        db: fakeDbReturning(null),
        project: {
          id: "project-1",
          path: projectDir,
          localPath: projectDir,
        } as any,
        composition: { filePath: "index.html" } as any,
        anchor: {
          anchorType: "frame",
          startTime: 0.5,
          startFrame: 15,
        },
        threadId: "matrix-frame",
        repoRoot,
      })
      const frameElapsedMs = performance.now() - frameStartedAt

      expect(frameResult).toEqual({
        kind: "frame",
        relativePath: ".ripple/comment-visuals/matrix-frame/frame.png",
      })
      expect(frameElapsedMs).toBeLessThan(10000)
      if (!frameResult) throw new Error("Expected frame comment visual.")
      await expectPngQuality({
        path: join(projectDir, frameResult.relativePath),
        width: 1920,
        height: 1080,
        expectedTimeSeconds: 0.5,
      })

      const externalStartedAt = performance.now()
      const externalResult = await captureCommentVisualForAnchor({
        db: fakeDbReturning(null),
        project: {
          id: "project-1",
          path: projectDir,
          localPath: projectDir,
        } as any,
        composition: { filePath: externalCompositionPath } as any,
        anchor: {
          anchorType: "frame",
          startTime: 0.5,
          startFrame: 15,
        },
        threadId: "matrix-external-frame",
        repoRoot,
      })
      const externalElapsedMs = performance.now() - externalStartedAt

      expect(externalResult).toEqual({
        kind: "frame",
        relativePath: ".ripple/comment-visuals/matrix-external-frame/frame.png",
      })
      expect(externalElapsedMs).toBeLessThan(10000)
      if (!externalResult) throw new Error("Expected external composition comment visual.")
      await expectPngStaticColor({
        path: join(projectDir, externalResult.relativePath),
        width: 1920,
        height: 1080,
        expected: { r: 139, g: 92, b: 246 },
      })

      const rangeStartedAt = performance.now()
      const rangeResult = await captureCommentVisualForAnchor({
        db: fakeDbReturning(null),
        project: {
          id: "project-1",
          path: projectDir,
          localPath: projectDir,
        } as any,
        composition: { filePath: "index.html" } as any,
        anchor: {
          anchorType: "range",
          startTime: 0,
          endTime: 1,
          startFrame: 0,
          endFrame: 30,
        },
        threadId: "matrix-range",
        repoRoot,
      })
      const rangeElapsedMs = performance.now() - rangeStartedAt

      expect(rangeResult).toEqual({
        kind: "range_sheet",
        relativePath: ".ripple/comment-visuals/matrix-range/sheet.png",
      })
      expect(rangeElapsedMs).toBeLessThan(10000)
      if (!rangeResult) throw new Error("Expected range comment visual.")
      const rangeSheet = await stat(join(projectDir, rangeResult.relativePath))
      const rangeManifest = await stat(join(projectDir, ".ripple/comment-visuals/matrix-range/manifest.json"))
      expect(rangeSheet.size).toBeGreaterThan(1000)
      expect(rangeManifest.size).toBeGreaterThan(0)
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  }, 60000)

  timedTest("covers the agent chat CLI snapshot and frame-sheet paths, artifact quality, and timing", async () => {
    const projectDir = await makeProject()
    const service = createVisualContextServiceWithPreviewHarness()
    const endpoint = await createVisualContextEndpoint({
      service,
      workspaceRoot: projectDir,
      resolveCurrentFrameSnapshot: async () => currentFrameSnapshot(projectDir),
    })

    try {
      const env = buildRippleAgentToolEnvironment({
        baseEnv: process.env,
        repoRoot,
        workspaceRoot: projectDir,
        visualContextEndpoint: endpoint.endpoint,
        visualContextToken: endpoint.token,
      })
      const snapshotStartedAt = performance.now()
      const snapshotStdout = await execRipple([
        "snapshot",
        "--at",
        "current",
        "--json",
      ], {
        cwd: projectDir,
        env,
      })
      const snapshotElapsedMs = performance.now() - snapshotStartedAt
      const snapshotPayload = JSON.parse(snapshotStdout)

      expect(snapshotPayload.ok).toBe(true)
      expect(snapshotPayload.type).toBe("snapshot")
      expect(snapshotPayload.snapshot.sample).toEqual({ timeMs: 500, frame: 15 })
      expect(snapshotStdout).not.toContain("backend")
      expect(snapshotStdout).not.toContain("endpoint")
      expect(snapshotStdout).not.toContain("handoff")
      expect(snapshotStdout).not.toContain("fallback")
      expect(snapshotElapsedMs).toBeLessThan(CLI_CAPTURE_MAX_MS)
      await expectPngQuality({
        path: join(projectDir, snapshotPayload.snapshot.path),
        width: 1920,
        height: 1080,
        expectedTimeSeconds: 0.5,
      })

      const startedAt = performance.now()
      const stdout = await execRipple([
        "frame-sheet",
        "--range",
        "0s..1s",
        "--samples",
        "3",
        "--columns",
        "3",
        "--json",
      ], {
        cwd: projectDir,
        env,
      })
      const elapsedMs = performance.now() - startedAt
      const payload = JSON.parse(stdout)

      expect(payload.ok).toBe(true)
      expect(payload.type).toBe("sheet")
      expect(stdout).not.toContain("backend")
      expect(stdout).not.toContain("endpoint")
      expect(stdout).not.toContain("handoff")
      expect(stdout).not.toContain("fallback")
      expect(elapsedMs).toBeLessThan(CLI_CAPTURE_MAX_MS)
      expect(existsSync(join(projectDir, payload.sheet.path))).toBe(true)
      expect(existsSync(join(projectDir, payload.sheet.manifestPath))).toBe(true)
      const sheet = await stat(join(projectDir, payload.sheet.path))
      expect(sheet.size).toBeGreaterThan(1000)
    } finally {
      await endpoint.close()
      await service.shutdown()
      await rm(projectDir, { recursive: true, force: true })
    }
  }, 120000)

  timedTest("covers app-owned bridge visual checks without stale handoff fallback", async () => {
    const projectDir = await makeProject()
    const service = createVisualContextServiceWithPreviewHarness()
    const bridge = await createVisualContextFileBridge({
      service,
      workspaceRoot: projectDir,
      requestDir: join(projectDir, ".ripple", "agent-visual-context", "matrix-bridge", "requests"),
      resolveCurrentFrameSnapshot: async () => currentFrameSnapshot(projectDir),
    })
    try {
      const handoff = await prepareAgentVisualContextHandoff({
        runId: "matrix-handoff",
        repoRoot,
        currentFrameSnapshot: {
          projectPath: projectDir,
          sourcePath: projectDir,
          compositionPath: "index.html",
          timeMs: 0,
          fps: 30,
          width: 1920,
          height: 1080,
        },
      })
      expect(handoff?.manifestPath).toBeTruthy()
      if (!handoff) throw new Error("Expected visual context handoff.")

      const env = buildRippleAgentToolEnvironment({
        baseEnv: process.env,
        repoRoot,
        workspaceRoot: projectDir,
        visualContextEndpoint: "http://127.0.0.1:9",
        visualContextToken: "dead-endpoint",
        visualContextBridgeDir: bridge.requestDir,
        visualContextBridgeToken: bridge.token,
      })
      env.RIPPLE_VISUAL_CONTEXT_MANIFEST = handoff.manifestPath

      const snapshotStartedAt = performance.now()
      const snapshotStdout = await execRipple([
        "snapshot",
        "--at",
        "current",
        "--composition",
        "index.html",
        "--json",
      ], {
        cwd: projectDir,
        env,
      })
      const snapshotElapsedMs = performance.now() - snapshotStartedAt
      const snapshotPayload = JSON.parse(snapshotStdout)

      expect(snapshotPayload.ok).toBe(true)
      expect(snapshotPayload.type).toBe("snapshot")
      expect(snapshotPayload.snapshot.sample).toEqual({ timeMs: 500, frame: 15 })
      expect(snapshotStdout).not.toContain("backend")
      expect(snapshotStdout).not.toContain("endpoint")
      expect(snapshotStdout).not.toContain("handoff")
      expect(snapshotStdout).not.toContain("fallback")
      expect(snapshotElapsedMs).toBeLessThan(CLI_CAPTURE_MAX_MS)
      await expectPngQuality({
        path: join(projectDir, snapshotPayload.snapshot.path),
        width: 1920,
        height: 1080,
        expectedTimeSeconds: 0.5,
      })

      const sheetStartedAt = performance.now()
      const sheetStdout = await execRipple([
        "frame-sheet",
        "--range",
        "0s..8s",
        "--samples",
        "8",
        "--columns",
        "4",
        "--json",
      ], {
        cwd: projectDir,
        env,
      })
      const sheetElapsedMs = performance.now() - sheetStartedAt
      const sheetPayload = JSON.parse(sheetStdout)

      expect(sheetPayload.ok).toBe(true)
      expect(sheetPayload.type).toBe("sheet")
      expect(sheetStdout).not.toContain("backend")
      expect(sheetStdout).not.toContain("endpoint")
      expect(sheetStdout).not.toContain("handoff")
      expect(sheetStdout).not.toContain("fallback")
      expect(sheetElapsedMs).toBeLessThan(CLI_CAPTURE_MAX_MS)
      expect(existsSync(join(projectDir, sheetPayload.sheet.path))).toBe(true)
      expect(existsSync(join(projectDir, sheetPayload.sheet.manifestPath))).toBe(true)
    } finally {
      await bridge.close()
      await service.shutdown()
      await rm(projectDir, { recursive: true, force: true })
    }
  }, 120000)
})
