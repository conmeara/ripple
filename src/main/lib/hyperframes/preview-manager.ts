import { createServer } from "node:net"
import { spawnHyperframesCommand } from "./runtime"
import type {
  HyperframesChildProcess,
  HyperframesPreviewState,
  HyperframesProjectContext,
  HyperframesSpawnResult,
} from "./types"
import { HyperframesError } from "./types"

type SpawnPreview = (
  args: string[],
  options: { repoRoot?: string; cwd?: string },
) => Promise<HyperframesSpawnResult>

function trimTail(value: string, maxLength = 4000): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength)
}

export function allocateLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => {
        if (port > 0) resolve(port)
        else reject(new Error("Could not allocate a local preview port."))
      })
    })
  })
}

export class PreviewManager {
  private readonly previews = new Map<string, {
    state: HyperframesPreviewState
    child: HyperframesChildProcess | null
  }>()

  constructor(
    private readonly options: {
      repoRoot?: string
      spawnPreview?: SpawnPreview
      allocatePort?: () => Promise<number>
      now?: () => Date
    } = {},
  ) {}

  getStatus(key: string): HyperframesPreviewState | null {
    return this.previews.get(key)?.state ?? null
  }

  async start(input: {
    context: HyperframesProjectContext
    forceRestart?: boolean
    repoRoot?: string
  }): Promise<HyperframesPreviewState> {
    const existing = this.previews.get(input.context.key)
    if (
      existing &&
      !input.forceRestart &&
      (existing.state.status === "starting" || existing.state.status === "running")
    ) {
      return existing.state
    }

    if (existing && input.forceRestart) {
      await this.stop(input.context.key)
    }

    const port = await (this.options.allocatePort ?? allocateLocalPort)()
    const url = `http://localhost:${port}`
    const startedAt = (this.options.now ?? (() => new Date()))()
    const state: HyperframesPreviewState = {
      key: input.context.key,
      projectId: input.context.projectId,
      projectPath: input.context.projectPath,
      status: "starting",
      port,
      url,
      pid: null,
      startedAt,
      stoppedAt: null,
      stdoutTail: "",
      stderrTail: "",
      error: null,
    }

    this.previews.set(input.context.key, { state, child: null })

    try {
      const spawnPreview = this.options.spawnPreview ?? spawnHyperframesCommand
      const spawned = await spawnPreview(
        [
          "preview",
          "--port",
          String(port),
          "--force-new",
          input.context.projectPath,
        ],
        { repoRoot: input.repoRoot ?? this.options.repoRoot, cwd: input.context.projectPath },
      )
      this.attachProcess(input.context.key, spawned.child)
      return state
    } catch (error) {
      state.status = "error"
      state.error = error instanceof Error ? error.message : String(error)
      throw new HyperframesError(
        "Ripple could not start the preview.",
        "PREVIEW_START_FAILED",
        state,
      )
    }
  }

  async stop(key: string): Promise<HyperframesPreviewState | null> {
    const record = this.previews.get(key)
    if (!record) return null

    if (record.child && !record.child.killed) {
      record.child.kill("SIGTERM")
    }

    record.state.status = "stopped"
    record.state.stoppedAt = (this.options.now ?? (() => new Date()))()
    record.state.pid = record.child?.pid ?? record.state.pid
    record.child = null
    return record.state
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.previews.keys()).map((key) => this.stop(key)))
  }

  private attachProcess(
    key: string,
    child: HyperframesChildProcess,
  ): void {
    const record = this.previews.get(key)
    if (!record) return

    record.child = child
    record.state.pid = child.pid ?? null

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      record.state.stdoutTail = trimTail(record.state.stdoutTail + text)
      this.updateRunningStateFromOutput(record.state, text)
    })

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      record.state.stderrTail = trimTail(record.state.stderrTail + text)
      this.updateRunningStateFromOutput(record.state, text)
    })

    child.on("error", (error) => {
      record.state.status = "error"
      record.state.error = error.message
      record.state.stoppedAt = (this.options.now ?? (() => new Date()))()
    })

    child.on("close", (code, signal) => {
      if (record.state.status === "stopped") return

      record.state.stoppedAt = (this.options.now ?? (() => new Date()))()
      record.child = null

      if (code === 0 || signal === "SIGTERM") {
        record.state.status = "stopped"
        return
      }

      record.state.status = "error"
      record.state.error =
        `Preview stopped unexpectedly${code !== null ? ` with code ${code}` : ""}.`
    })
  }

  private updateRunningStateFromOutput(
    state: HyperframesPreviewState,
    text: string,
  ): void {
    const urlMatch = text.match(/http:\/\/localhost:(\d+)/)
    if (urlMatch) {
      const port = Number(urlMatch[1])
      if (Number.isFinite(port) && port > 0) {
        state.port = port
        state.url = `http://localhost:${port}`
      }
    }

    if (/Studio running|Already running/i.test(text)) {
      state.status = "running"
    }
  }
}

export const previewManager = new PreviewManager()
