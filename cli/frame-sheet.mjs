import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import {
  ensureDir, fail, ffprobeJson, output, parseArgs, requireTool, round3, run,
} from "./util.mjs";

const MAX_FRAMES = 120;

export async function main(argv) {
  const args = parseArgs(argv, {
    fps: "number", cols: "number", scale: "number",
    start: "number", end: "number", tail: "number", out: "string",
  });
  const file = args._[0];
  if (!file) fail("Usage: ripple frame-sheet <file> [--fps 1] [--cols 6] [--scale 480] [--start S] [--end E] [--tail N] [--out path]", 2);
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const cols = args.cols ?? 6;
  const scale = args.scale ?? 480;

  const totalDuration = Number(ffprobeJson(file).format?.duration ?? 0);
  let rangeArgs = [];
  let duration;
  if (args.tail !== undefined) {
    duration = Math.min(args.tail, totalDuration);
    rangeArgs = ["-sseof", String(-duration)];
  } else {
    const start = args.start ?? 0;
    const end = args.end ?? totalDuration;
    if (end <= start) fail("--end must be greater than --start", 2);
    duration = end - start;
    rangeArgs = ["-ss", String(start), "-t", String(duration)];
  }

  // Auto-reduce fps so huge files still produce a readable single sheet.
  let fps = args.fps ?? (args.tail !== undefined ? 4 : 1);
  let frames = Math.ceil(duration * fps);
  let fpsAdjusted = false;
  if (frames > MAX_FRAMES) {
    fps = round3(MAX_FRAMES / duration);
    frames = Math.ceil(duration * fps);
    fpsAdjusted = true;
  }
  const rows = Math.max(1, Math.ceil(frames / cols));

  const outPath =
    args.out ??
    join(
      ensureDir(join(process.cwd(), "qa", "frame-sheets")),
      `${basename(file, extname(file))}${args.tail !== undefined ? "_tail" : ""}.jpg`
    );

  const res = run(ffmpeg, [
    "-hide_banner", "-v", "error", "-y",
    ...rangeArgs, "-i", file,
    "-vf", `fps=${fps},scale=${scale}:-1,tile=${cols}x${rows}:padding=8:margin=8:color=0x1a1a1a`,
    "-frames:v", "1", outPath,
  ]);
  if (res.status !== 0) fail(`frame sheet failed: ${res.stderr.trim()}`, 1);

  output({
    ok: true,
    file,
    sheet: outPath,
    frames,
    fps,
    grid: `${cols}x${rows}`,
    coveredSeconds: round3(duration),
    ...(fpsAdjusted ? { note: `fps reduced to ${fps} to keep the sheet readable (${MAX_FRAMES} frame cap)` } : {}),
    reminder: "Read this image before declaring the edit good.",
  });
}
