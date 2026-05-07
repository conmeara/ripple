import { describe, expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { resolveProducerBrowserPath } from "../../hyperframes/runtime"
import { getVisualCaptureBackend } from "../backend-registry"
import type { VisualContextBackendId } from "../types"

const repoRoot = process.cwd()
const mediaVideoFixture = resolve(
  repoRoot,
  "resources",
  "hyperframes-templates",
  "previews",
  "videos",
  "glitch.mp4",
)
const mediaAudioFixture = resolve(repoRoot, "src", "renderer", "public", "sound.mp3")
const timedTest = test as unknown as (
  name: string,
  fn: () => unknown | Promise<unknown>,
  timeout: number,
) => void

function shouldSkipBrowserQa(): boolean {
  return !resolveProducerBrowserPath(repoRoot)
}

async function makeMediaProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-visual-media-"))
  await mkdir(join(projectDir, "assets"), { recursive: true })
  await copyFile(mediaVideoFixture, join(projectDir, "assets", "clip.mp4"))
  await copyFile(mediaAudioFixture, join(projectDir, "assets", "tone.mp3"))
  await writeFile(join(projectDir, "hyperframes.json"), JSON.stringify({
    entry: "index.html",
    width: 320,
    height: 180,
    fps: 30,
  }))
  await writeFile(join(projectDir, "index.html"), `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #0b0f19; overflow: hidden; }
      main { position: relative; width: 320px; height: 180px; background: #111827; }
      video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .marker { position: absolute; left: 12px; bottom: 12px; width: 58px; height: 18px; background: rgba(255,255,255,0.88); }
    </style>
  </head>
  <body>
    <main data-composition-id="media" data-width="320" data-height="180" data-duration="2" data-fps="30">
      <video id="clip" src="assets/clip.mp4" muted playsinline preload="auto"></video>
      <audio id="tone" src="assets/tone.mp3" preload="auto"></audio>
      <div class="marker"></div>
    </main>
    <script>
      const clip = document.getElementById("clip");
      const tone = document.getElementById("tone");
      window.__hf = {
        duration: 2,
        seek: function (time) {
          if (Number.isFinite(clip.duration) && clip.duration > 0) {
            clip.currentTime = Math.min(time, clip.duration - 0.05);
          }
          if (Number.isFinite(tone.duration) && tone.duration > 0) {
            tone.currentTime = Math.min(time, tone.duration - 0.01);
          }
        }
      };
    </script>
  </body>
</html>`)
  return projectDir
}

async function expectMediaCapture(
  backendId: Exclude<VisualContextBackendId, "preview" | "fast-browser" | "hyperframes-cli">,
): Promise<void> {
  const backend = getVisualCaptureBackend(backendId)
  expect(backend).toBeTruthy()

  const projectDir = await makeMediaProject()
  let cleanupPaths: string[] = []
  try {
    const result = await backend!.captureFrames({
      projectPath: projectDir,
      timestampsMs: [0, 500, 1000],
      fps: 30,
      width: 320,
      height: 180,
      format: "png",
      timeoutMs: 5000,
      reason: "qa",
      repoRoot,
    })
    cleanupPaths = result.cleanupPaths

    expect(result.backend).toBe(backendId)
    expect(result.frames).toHaveLength(3)
    expect(result.frames.map((frame) => frame.frame)).toEqual([0, 15, 30])
    for (const frame of result.frames) {
      expect(frame.width).toBe(320)
      expect(frame.height).toBe(180)
      expect((await stat(frame.path)).size).toBeGreaterThan(1000)
    }
  } finally {
    await backend?.dispose?.()
    await Promise.all(cleanupPaths.map((path) =>
      rm(path, { recursive: true, force: true }).catch(() => undefined)
    ))
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

describe("Visual context media spike", () => {
  timedTest("captures a video/audio composition through Engine capture", async () => {
    if (shouldSkipBrowserQa()) return
    await expectMediaCapture("engine")
  }, 60000)

  timedTest("captures a video/audio composition through Producer capture", async () => {
    if (shouldSkipBrowserQa()) return
    await expectMediaCapture("producer-capture")
  }, 60000)
})
