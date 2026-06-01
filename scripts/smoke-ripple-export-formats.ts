#!/usr/bin/env bun
import { execFileSync } from "node:child_process"
import { cp, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  buildHyperframesEnvironment,
  getAppManagedCommandCandidates,
  getPackageBinScript,
} from "../src/main/lib/hyperframes/runtime"

const repoRoot = process.cwd()
const require = createRequire(import.meta.url)
const fixturePath = join(repoRoot, "test", "fixtures", "hyperframes", "basic-title-card")
const formats = ["mp4", "mov", "webm", "png-sequence"] as const

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    env: buildHyperframesEnvironment(process.env),
    encoding: "utf8",
    timeout: 120000,
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function resolveHyperframesCommand(): string {
  const packageBin = getPackageBinScript("hyperframes", "hyperframes")
  if (packageBin && existsSync(packageBin)) return packageBin
  const localBin = join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "hyperframes.cmd" : "hyperframes")
  if (existsSync(localBin)) return localBin
  throw new Error("Could not find the local HyperFrames CLI.")
}

function resolveFfprobeCommand(): string {
  const [managed] = getAppManagedCommandCandidates("ffprobe")
  if (managed && existsSync(managed)) return managed
  return "ffprobe"
}

async function assertNonzero(path: string): Promise<number> {
  const result = await stat(path)
  if (result.size <= 0) throw new Error(`${path} is empty`)
  return result.size
}

function assertProbe(format: string, outputPath: string): void {
  const ffprobe = resolveFfprobeCommand()
  const raw = run(ffprobe, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,codec_name:format=duration,format_name",
    "-of",
    "json",
    outputPath,
  ], repoRoot)
  const parsed = JSON.parse(raw) as {
    streams?: Array<{ width?: number; height?: number; codec_name?: string }>
    format?: { duration?: string; format_name?: string }
  }
  const stream = parsed.streams?.[0]
  const names = parsed.format?.format_name?.toLowerCase().split(",") ?? []
  if (stream?.width !== 640 || stream?.height !== 360) {
    throw new Error(`${format} probe reported ${stream?.width}x${stream?.height}, expected 640x360`)
  }
  if (format === "mp4" && !names.some((name) => name.includes("mp4") || name.includes("mov"))) {
    throw new Error(`mp4 probe format mismatch: ${parsed.format?.format_name}`)
  }
  if (format === "mov" && !names.some((name) => name.includes("mov") || name.includes("quicktime"))) {
    throw new Error(`mov probe format mismatch: ${parsed.format?.format_name}`)
  }
  if (format === "webm" && !names.some((name) => name.includes("webm") || name.includes("matroska"))) {
    throw new Error(`webm probe format mismatch: ${parsed.format?.format_name}`)
  }
}

async function assertPngSequence(outputPath: string): Promise<number> {
  const entries = (await readdir(outputPath)).sort()
  const frames = entries.filter((entry) => /^frame_\d{6}\.png$/i.test(entry))
  if (!frames.length) {
    throw new Error(`png-sequence produced no frame_XXXXXX.png files in ${outputPath}`)
  }
  const firstFrame = await readFile(join(outputPath, frames[0]))
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (
    firstFrame.length < 24 ||
    !signature.every((value, index) => firstFrame[index] === value)
  ) {
    throw new Error(`png-sequence first frame is not a PNG: ${frames[0]}`)
  }
  const width = firstFrame.readUInt32BE(16)
  const height = firstFrame.readUInt32BE(20)
  if (width !== 640 || height !== 360) {
    throw new Error(`png-sequence first frame reported ${width}x${height}, expected 640x360`)
  }

  let totalBytes = 0
  for (const entry of entries) {
    totalBytes += (await stat(join(outputPath, entry))).size
  }
  if (totalBytes <= 0) throw new Error(`${outputPath} is empty`)
  return totalBytes
}

async function main(): Promise<void> {
  const projectPath = await mkdtemp(join(tmpdir(), "ripple-export-smoke-"))
  try {
    await cp(fixturePath, projectPath, { recursive: true })
    await mkdir(join(projectPath, "assets", "vendor"), { recursive: true })
    await copyFile(
      require.resolve("gsap/dist/gsap.min.js"),
      join(projectPath, "assets", "vendor", "gsap.min.js"),
    )
    await mkdir(join(projectPath, "exports"), { recursive: true })
    const hyperframes = resolveHyperframesCommand()

    for (const format of formats) {
      const outputPath = format === "png-sequence"
        ? join(projectPath, "exports", "smoke-png-sequence")
        : join(projectPath, "exports", `smoke.${format}`)
      await mkdir(dirname(outputPath), { recursive: true })
      run(hyperframes, [
        "render",
        "--format",
        format,
        "--quality",
        "draft",
        "--output",
        outputPath,
        projectPath,
      ], projectPath)
      const size = format === "png-sequence"
        ? await assertPngSequence(outputPath)
        : await assertNonzero(outputPath)
      if (format !== "png-sequence") {
        assertProbe(format, outputPath)
      }
      console.log(`[export-smoke] ${format} OK (${size} bytes)`)
    }
  } finally {
    if (!process.env.RIPPLE_KEEP_EXPORT_SMOKE) {
      await rm(projectPath, { recursive: true, force: true })
    } else {
      console.log(`[export-smoke] kept ${projectPath}`)
    }
  }
}

main().catch((error) => {
  console.error(`[export-smoke] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
