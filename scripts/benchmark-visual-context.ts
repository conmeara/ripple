import { cp, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  captureFramesWithFastBrowser,
} from "../src/cli/frame-sheet"
import {
  buildHyperframesEnvironment,
  resolveProducerBrowserPath,
  runHyperframesCommand,
} from "../src/main/lib/hyperframes/runtime"
import { getVisualCaptureBackend } from "../src/main/lib/visual-context"

const repoRoot = process.cwd()
const fixtureRoot = resolve(repoRoot, "test", "fixtures", "hyperframes", "visual-capture-qa")

async function makeProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "ripple-visual-benchmark-"))
  await cp(fixtureRoot, projectDir, { recursive: true })
  return projectDir
}

async function newestSnapshot(projectDir: string): Promise<string | null> {
  const snapshotDir = join(projectDir, "snapshots")
  const entries = await readdir(snapshotDir).catch(() => [])
  let newest: { path: string; mtimeMs: number } | null = null
  for (const entry of entries.filter((item) => item.endsWith(".png"))) {
    const path = join(snapshotDir, entry)
    const info = await stat(path)
    if (!newest || info.mtimeMs > newest.mtimeMs) {
      newest = { path, mtimeMs: info.mtimeMs }
    }
  }
  return newest?.path ?? null
}

async function time<T>(fn: () => Promise<T>): Promise<{ elapsedMs: number; value: T }> {
  const startedAt = performance.now()
  const value = await fn()
  return {
    elapsedMs: Math.round(performance.now() - startedAt),
    value,
  }
}

async function benchmarkRuntimeBackend(input: {
  backendId: "engine" | "producer-capture"
  timestampsMs: number[]
}): Promise<{
  coldMs: number
  warmMs: number
  warmSessionReused: number
}> {
  const projectDir = await makeProject()
  const backend = getVisualCaptureBackend(input.backendId)
  if (!backend) throw new Error(`Missing backend: ${input.backendId}`)
  try {
    const request = {
      projectPath: projectDir,
      timestampsMs: input.timestampsMs,
      fps: 30,
      width: 1920,
      height: 1080,
      format: "png",
      timeoutMs: 5000,
      reason: "qa",
      repoRoot,
    } as const
    const cold = await time(() => backend.captureFrames(request))
    await Promise.all(cold.value.cleanupPaths.map((path) =>
      rm(path, { recursive: true, force: true }).catch(() => undefined)
    ))
    const warm = await time(() => backend.captureFrames(request))
    await Promise.all(warm.value.cleanupPaths.map((path) =>
      rm(path, { recursive: true, force: true }).catch(() => undefined)
    ))
    return {
      coldMs: cold.elapsedMs,
      warmMs: warm.elapsedMs,
      warmSessionReused: warm.value.timings.sessionReused ?? 0,
    }
  } finally {
    await backend.dispose?.().catch(() => undefined)
    await rm(projectDir, { recursive: true, force: true })
  }
}

async function benchmarkFastBrowser(timestampsMs: number[]): Promise<number> {
  const projectDir = await makeProject()
  try {
    const result = await time(() => captureFramesWithFastBrowser({
      projectDir,
      timestampsMs,
      timeoutMs: 5000,
      columns: Math.min(4, timestampsMs.length),
      maxSheetWidth: 1440,
      settleMs: 0,
      env: buildHyperframesEnvironment(process.env, { repoRoot }),
      repoRoot,
    }))
    await Promise.all((result.value.cleanupPaths ?? []).map((path) =>
      rm(path, { recursive: true, force: true }).catch(() => undefined)
    ))
    return result.elapsedMs
  } finally {
    await rm(projectDir, { recursive: true, force: true })
  }
}

async function benchmarkCliSnapshot(): Promise<number> {
  const projectDir = await makeProject()
  try {
    const result = await time(async () => {
      const command = await runHyperframesCommand([
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
      if (!command.ok) throw new Error("HyperFrames CLI snapshot failed.")
      const snapshot = await newestSnapshot(projectDir)
      if (!snapshot) throw new Error("HyperFrames CLI snapshot did not write a PNG.")
      return snapshot
    })
    return result.elapsedMs
  } finally {
    await rm(projectDir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  if (!resolveProducerBrowserPath(repoRoot)) {
    throw new Error("Visual context benchmark requires an app-managed browser.")
  }

  const threeSamples = [0, 500, 1000]
  const eightSamples = [0, 143, 286, 429, 571, 714, 857, 1000]
  const engine3 = await benchmarkRuntimeBackend({
    backendId: "engine",
    timestampsMs: threeSamples,
  })
  const engine8 = await benchmarkRuntimeBackend({
    backendId: "engine",
    timestampsMs: eightSamples,
  })
  const producer3 = await benchmarkRuntimeBackend({
    backendId: "producer-capture",
    timestampsMs: threeSamples,
  })
  const results = {
    generatedAt: new Date().toISOString(),
    fixture: "test/fixtures/hyperframes/visual-capture-qa",
    fastBrowser3SampleMs: await benchmarkFastBrowser(threeSamples),
    fastBrowser8SampleMs: await benchmarkFastBrowser(eightSamples),
    engine3SampleMs: engine3.coldMs,
    engine3SampleWarmMs: engine3.warmMs,
    engine3SampleWarmSessionReused: engine3.warmSessionReused,
    engine8SampleMs: engine8.coldMs,
    engine8SampleWarmMs: engine8.warmMs,
    engine8SampleWarmSessionReused: engine8.warmSessionReused,
    producerCapture3SampleMs: producer3.coldMs,
    producerCapture3SampleWarmMs: producer3.warmMs,
    producerCapture3SampleWarmSessionReused: producer3.warmSessionReused,
    cliSnapshotMs: await benchmarkCliSnapshot(),
  }

  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
