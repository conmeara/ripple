import { copyFile, cp, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import {
  captureFramesWithFastBrowser,
} from "../src/cli/frame-sheet"
import {
  buildClaudeNativeVisualContextToolResult,
  buildCodexNativeVisualContextContentItems,
  loadNativeVisualContextArtifact,
} from "../src/main/lib/agent-runtime/visual-context-native-tool"
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
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
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

export function summarizeAgentVisualInjectionSavings(input: {
  nativeVisualReturnMs: number
  pathOnlyReturnMs: number
  followupImageLookupMs: number
}): {
  comparison: "on-demand-native-image-vs-path-only-followup"
  nativeVisualReturnMs: number
  pathOnlyReturnMs: number
  followupImageLookupMs: number
  pathOnlyTotalMs: number
  savedMs: number
  savedPercent: number
  nativeVisualLocalOverheadMs: number
  localTimingWinner: "native-image" | "path-only"
  measuredModelTurnLatencyMs: null
  agentTurnsSaved: number
} {
  const nativeVisualReturnMs = Math.max(0, Math.round(input.nativeVisualReturnMs * 100) / 100)
  const pathOnlyReturnMs = Math.max(0, Math.round(input.pathOnlyReturnMs * 100) / 100)
  const followupImageLookupMs = Math.max(0, Math.round(input.followupImageLookupMs * 100) / 100)
  const pathOnlyTotalMs = Math.round((pathOnlyReturnMs + followupImageLookupMs) * 100) / 100
  const savedMs = Math.round(Math.max(0, pathOnlyTotalMs - nativeVisualReturnMs) * 100) / 100
  const nativeVisualLocalOverheadMs = Math.round(Math.max(0, nativeVisualReturnMs - pathOnlyTotalMs) * 100) / 100
  const savedPercent = pathOnlyTotalMs > 0
    ? Math.round((savedMs / pathOnlyTotalMs) * 1000) / 10
    : 0
  return {
    comparison: "on-demand-native-image-vs-path-only-followup",
    nativeVisualReturnMs,
    pathOnlyReturnMs,
    followupImageLookupMs,
    pathOnlyTotalMs,
    savedMs,
    savedPercent,
    nativeVisualLocalOverheadMs,
    localTimingWinner: nativeVisualReturnMs <= pathOnlyTotalMs ? "native-image" : "path-only",
    measuredModelTurnLatencyMs: null,
    agentTurnsSaved: 1,
  }
}

export function summarizeVisualContextPipelineTimings(input: {
  warmEngineFramesMs: number
  warmEngineSheetMs: number
  coldCliSnapshotMs: number
  nativeVisualReturnMs: number
  pathOnlyReturnMs: number
  followupImageLookupMs: number
}): {
  captureStage: {
    warmEngineFramesMs: number
    warmEngineSheetMs: number
    coldCliSnapshotMs: number
  }
  runtimeHandoffStage: ReturnType<typeof summarizeAgentVisualInjectionSavings>
  localPipelineTotals: {
    warmFramesNativeImageMs: number
    warmSheetNativeImageMs: number
    coldCliPathOnlyLocalMs: number
  }
  caveat: string
} {
  const runtimeHandoffStage = summarizeAgentVisualInjectionSavings({
    nativeVisualReturnMs: input.nativeVisualReturnMs,
    pathOnlyReturnMs: input.pathOnlyReturnMs,
    followupImageLookupMs: input.followupImageLookupMs,
  })
  const round = (value: number) => Math.round(value * 100) / 100
  return {
    captureStage: {
      warmEngineFramesMs: round(input.warmEngineFramesMs),
      warmEngineSheetMs: round(input.warmEngineSheetMs),
      coldCliSnapshotMs: round(input.coldCliSnapshotMs),
    },
    runtimeHandoffStage,
    localPipelineTotals: {
      warmFramesNativeImageMs: round(input.warmEngineFramesMs + runtimeHandoffStage.nativeVisualReturnMs),
      warmSheetNativeImageMs: round(input.warmEngineSheetMs + runtimeHandoffStage.nativeVisualReturnMs),
      coldCliPathOnlyLocalMs: round(input.coldCliSnapshotMs + runtimeHandoffStage.pathOnlyTotalMs),
    },
    caveat: "Local file adaptation timings do not include the extra provider/model turn required when the agent receives only a path and must ask to inspect the image.",
  }
}

async function prepareBenchmarkVisualArtifact(): Promise<{
  projectDir: string
  payload: Record<string, unknown>
  cleanup(): Promise<void>
}> {
  const projectDir = await makeProject()
  try {
    const capture = await captureFramesWithFastBrowser({
      projectDir,
      timestampsMs: [500],
      timeoutMs: 5000,
      columns: 1,
      maxSheetWidth: 1440,
      settleMs: 0,
      env: buildHyperframesEnvironment(process.env, { repoRoot }),
      repoRoot,
    })
    const framePath = capture.framePaths[0]
    if (!framePath) throw new Error("Native visual benchmark did not capture a frame.")
    const benchmarkDir = join(projectDir, ".ripple", "benchmark", "native-visual")
    await mkdir(benchmarkDir, { recursive: true })
    const artifactPath = join(benchmarkDir, "current-frame.png")
    await copyFile(framePath, artifactPath)
    await Promise.all((capture.cleanupPaths ?? []).map((path) =>
      rm(path, { recursive: true, force: true }).catch(() => undefined)
    ))
    return {
      projectDir,
      payload: {
        ok: true,
        type: "snapshot",
        snapshot: {
          path: relative(projectDir, artifactPath).replace(/\\/g, "/"),
          sample: { timeMs: 500, frame: 15 },
          width: 1920,
          height: 1080,
        },
        context: {
          source: { kind: "app-render", preEdit: false },
          samples: [{ timeMs: 500, frame: 15 }],
        },
        elapsedMs: 0,
      },
      cleanup: () => rm(projectDir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(projectDir, { recursive: true, force: true })
    throw error
  }
}

async function benchmarkOnDemandNativeVisualReturnFromArtifact(): Promise<{
  nativeVisualReturnMs: number
  pathOnlyReturnMs: number
  followupImageLookupMs: number
}> {
  const artifact = await prepareBenchmarkVisualArtifact()
  try {
    const nativeResult = await time(async () => {
      const result = await loadNativeVisualContextArtifact({
        projectPath: artifact.projectDir,
        payload: artifact.payload,
      })
      const codexItems = buildCodexNativeVisualContextContentItems(result)
      const claudeResult = buildClaudeNativeVisualContextToolResult(result)
      if (!codexItems.some((item) => item.type === "inputImage")) {
        throw new Error("Codex native visual result did not include an image.")
      }
      if (!claudeResult.content.some((item) => item.type === "image")) {
        throw new Error("Claude native visual result did not include an image.")
      }
    })
    const pathOnly = await time(async () => {
      JSON.stringify(artifact.payload)
    })
    const followupLookup = await time(async () => {
      await loadNativeVisualContextArtifact({
        projectPath: artifact.projectDir,
        payload: artifact.payload,
      })
    })
    return {
      nativeVisualReturnMs: nativeResult.elapsedMs,
      pathOnlyReturnMs: pathOnly.elapsedMs,
      followupImageLookupMs: followupLookup.elapsedMs,
    }
  } finally {
    await artifact.cleanup()
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
  const cliSnapshotMs = await benchmarkCliSnapshot()
  const onDemandNative = await benchmarkOnDemandNativeVisualReturnFromArtifact()
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
    cliSnapshotMs,
    onDemandNativeVisualReturnFromArtifactMs: onDemandNative.nativeVisualReturnMs,
    pathOnlyVisualReturnFromArtifactMs: onDemandNative.pathOnlyReturnMs,
    followupImageLookupFromArtifactMs: onDemandNative.followupImageLookupMs,
    onDemandNativeVisualSavings: summarizeAgentVisualInjectionSavings(onDemandNative),
    visualContextPipeline: summarizeVisualContextPipelineTimings({
      warmEngineFramesMs: engine3.warmMs,
      warmEngineSheetMs: engine8.warmMs,
      coldCliSnapshotMs: cliSnapshotMs,
      nativeVisualReturnMs: onDemandNative.nativeVisualReturnMs,
      pathOnlyReturnMs: onDemandNative.pathOnlyReturnMs,
      followupImageLookupMs: onDemandNative.followupImageLookupMs,
    }),
  }

  console.log(JSON.stringify(results, null, 2))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
