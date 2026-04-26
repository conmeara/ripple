import { stat } from "node:fs/promises"
import { createId } from "../db/utils"
import { createRenderOutputPath } from "./project-context"
import { spawnHyperframesCommand } from "./runtime"
import type {
  HyperframesChildProcess,
  HyperframesProjectContext,
  HyperframesRenderFormat,
  HyperframesRenderFps,
  HyperframesRenderQuality,
  HyperframesRenderState,
  HyperframesSpawnResult,
} from "./types"
import { HyperframesError } from "./types"

type SpawnRender = (
  args: string[],
  options: { repoRoot?: string; cwd?: string },
) => Promise<HyperframesSpawnResult>

function trimTail(value: string, maxLength = 8000): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength)
}

export class RenderManager {
  private readonly renders = new Map<string, {
    state: HyperframesRenderState
    child: HyperframesChildProcess | null
  }>()

  constructor(
    private readonly options: {
      repoRoot?: string
      spawnRender?: SpawnRender
      now?: () => Date
    } = {},
  ) {}

  getStatus(jobId: string): HyperframesRenderState | null {
    return this.renders.get(jobId)?.state ?? null
  }

  async start(input: {
    context: HyperframesProjectContext
    format: HyperframesRenderFormat
    fps: HyperframesRenderFps
    quality: HyperframesRenderQuality
    repoRoot?: string
  }): Promise<HyperframesRenderState> {
    const jobId = createId()
    const outputPath = await createRenderOutputPath({
      context: input.context,
      jobId,
      format: input.format,
    })
    const state: HyperframesRenderState = {
      jobId,
      projectId: input.context.projectId,
      projectPath: input.context.projectPath,
      outputPath,
      format: input.format,
      fps: input.fps,
      quality: input.quality,
      status: "running",
      pid: null,
      startedAt: (this.options.now ?? (() => new Date()))(),
      completedAt: null,
      stdoutTail: "",
      stderrTail: "",
      error: null,
      outputSizeBytes: null,
    }

    this.renders.set(jobId, { state, child: null })

    try {
      const spawnRender = this.options.spawnRender ?? spawnHyperframesCommand
      const spawned = await spawnRender(
        [
          "render",
          "--format",
          input.format,
          "--fps",
          String(input.fps),
          "--quality",
          input.quality,
          "--output",
          outputPath,
          input.context.projectPath,
        ],
        { repoRoot: input.repoRoot ?? this.options.repoRoot, cwd: input.context.projectPath },
      )
      this.attachProcess(jobId, spawned.child)
      return state
    } catch (error) {
      state.status = "error"
      state.completedAt = (this.options.now ?? (() => new Date()))()
      state.error = error instanceof Error ? error.message : String(error)
      throw new HyperframesError(
        "Ripple could not start the render.",
        "RENDER_START_FAILED",
        state,
      )
    }
  }

  cancel(jobId: string): HyperframesRenderState | null {
    const record = this.renders.get(jobId)
    if (!record) return null

    if (
      record.state.status === "completed" ||
      record.state.status === "cancelled" ||
      record.state.status === "error"
    ) {
      return record.state
    }

    record.state.status = "cancelled"
    record.state.completedAt = (this.options.now ?? (() => new Date()))()
    record.state.error = null

    if (record.child && !record.child.killed) {
      record.child.kill("SIGTERM")
    }

    record.child = null
    return record.state
  }

  cancelAll(): HyperframesRenderState[] {
    return Array.from(this.renders.keys())
      .map((jobId) => this.cancel(jobId))
      .filter((state): state is HyperframesRenderState => Boolean(state))
  }

  private attachProcess(
    jobId: string,
    child: HyperframesChildProcess,
  ): void {
    const record = this.renders.get(jobId)
    if (!record) return

    record.child = child
    record.state.pid = child.pid ?? null

    child.stdout.on("data", (chunk: Buffer) => {
      record.state.stdoutTail = trimTail(record.state.stdoutTail + chunk.toString())
    })

    child.stderr.on("data", (chunk: Buffer) => {
      record.state.stderrTail = trimTail(record.state.stderrTail + chunk.toString())
    })

    child.on("error", (error) => {
      record.state.status = "error"
      record.state.error = error.message
      record.state.completedAt = (this.options.now ?? (() => new Date()))()
    })

    child.on("close", (code, signal) => {
      void this.completeRender(jobId, code, signal)
    })
  }

  private async completeRender(
    jobId: string,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    const record = this.renders.get(jobId)
    if (!record) return
    if (record.state.status === "cancelled") return

    record.child = null
    record.state.completedAt = (this.options.now ?? (() => new Date()))()

    if (code !== 0) {
      record.state.status = "error"
      record.state.error =
        `Render stopped${code !== null ? ` with code ${code}` : ""}${signal ? ` (${signal})` : ""}.`
      return
    }

    try {
      const fileStat = await stat(record.state.outputPath)
      if (fileStat.size <= 0) {
        record.state.status = "error"
        record.state.error = "Render output was empty."
        record.state.outputSizeBytes = fileStat.size
        return
      }

      record.state.status = "completed"
      record.state.outputSizeBytes = fileStat.size
    } catch (error) {
      record.state.status = "error"
      record.state.error =
        error instanceof Error ? error.message : "Render output was not created."
    }
  }
}

export const renderManager = new RenderManager()
