import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";
import {
  ensureDir, fail, ffprobeJson, output, parseArgs, requireTool, round3, run,
} from "./util.mjs";

const MAX_FRAMES = 120;

// ---------- pure helpers (unit-tested) ----------

// Parse showinfo stderr into frame timestamps.
export function parseShowinfoTimes(stderr) {
  const times = [];
  for (const m of stderr.matchAll(/pts_time:([\d.]+)/g)) times.push(round3(Number(m[1])));
  return times;
}

// Guarantee coverage: the start is always shown, and at most `gap` seconds
// pass between frames.
export function densityFloor(sceneTimes, duration, gap) {
  gap = Math.max(Number(gap) || 10, 0.5); // a non-positive gap must never loop forever
  const all = [...sceneTimes].sort((a, b) => a - b);
  const filled = [];
  let prev = 0;
  const withEnd = [...all, duration];
  if (!all.length || all[0] > 0.5) filled.push({ t: 0, source: "floor" });
  for (const t of withEnd) {
    let cursor = Math.max(prev, filled.length ? filled[filled.length - 1].t : 0);
    while (t - cursor > gap) {
      cursor = round3(cursor + gap);
      if (cursor < t) filled.push({ t: cursor, source: "floor" });
    }
    if (t < duration) filled.push({ t, source: "scene" });
    prev = t;
  }
  const seen = new Set();
  return filled
    .filter((f) => {
      const key = f.t.toFixed(2);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.t - b.t);
}

// Cap frame count: floor frames drop first, then scene frames thin evenly.
// The earliest frame always survives — the start of the video must stay visible.
export function thinToMax(frames, max) {
  if (frames.length <= max) return frames;
  const first = frames.reduce((a, b) => (b.t < a.t ? b : a));
  const scenes = frames.filter((f) => f.source === "scene" && f !== first);
  const floors = frames.filter((f) => f.source === "floor" && f !== first);
  const room = max - 1;
  let kept;
  if (scenes.length >= room) {
    const step = scenes.length / room;
    kept = [];
    for (let i = 0; i < room; i++) kept.push(scenes[Math.floor(i * step)]);
  } else {
    const floorRoom = room - scenes.length;
    const step = floors.length / floorRoom;
    const keptFloors = [];
    for (let i = 0; i < floorRoom; i++) keptFloors.push(floors[Math.floor(i * step)]);
    kept = [...scenes, ...keptFloors];
  }
  return [first, ...kept].sort((a, b) => a.t - b.t);
}

// "x,y,w,h" (source pixels) → an ffmpeg crop filter prefix, or "" when
// unset. The model states the crop once per locked-off source (e.g. the
// eye region) and every strip/sheet zooms there — reading eyes from 120px
// tiles is how look-downs get missed.
export function cropFilter(spec) {
  if (!spec) return "";
  const parts = spec.split(",").map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0) || !parts[2] || !parts[3]) {
    throw new Error(`--crop expects "x,y,w,h" in source pixels, got: ${spec}`);
  }
  const [x, y, w, h] = parts;
  return `crop=${w}:${h}:${x}:${y},`;
}

// Minimal P5 (binary) PGM parser → { width, height, pixels: Uint8Array }.
export function parsePgm(buffer) {
  const text = buffer.subarray(0, 64).toString("latin1");
  const m = text.match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  if (!m) throw new Error("not a P5 PGM");
  const [header, w, h] = [m[0], Number(m[1]), Number(m[2])];
  return { width: w, height: h, pixels: new Uint8Array(buffer.subarray(header.length, header.length + w * h)) };
}

export function meanAbsDiff(a, b) {
  const len = Math.min(a.length, b.length);
  if (!len) return 255;
  let sum = 0;
  for (let i = 0; i < len; i++) sum += Math.abs(a[i] - b[i]);
  return sum / len;
}

// Sliding-window dedup: drop a frame when it barely differs from a recent kept one.
export function dedupFrames(frames, { threshold = 5, window = 4 } = {}) {
  const kept = [];
  const dropped = [];
  for (const frame of frames) {
    const recent = kept.slice(-window);
    const dup = recent.some((k) => meanAbsDiff(k.pixels, frame.pixels) < threshold);
    if (dup) dropped.push(frame);
    else kept.push(frame);
  }
  return { kept, dropped };
}

// ---------- impl ----------

function extractFrame(ffmpeg, file, t, vf, out) {
  const res = run(ffmpeg, [
    "-hide_banner", "-v", "error", "-y",
    "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", vf, out,
  ]);
  return res.status === 0;
}

async function scenesMode(args, file) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const duration = Number(ffprobeJson(file).format?.duration ?? 0);
  if (!duration) fail(`Could not read duration of ${file}`, 1);
  const threshold = args["scene-threshold"] ?? 0.3;
  if (threshold <= 0 || threshold >= 1) fail("--scene-threshold must be between 0 and 1 (exclusive)", 2);
  const gap = args.gap ?? 10;
  if (!(gap > 0)) fail("--gap must be a positive number of seconds", 2);
  const cols = args.cols ?? 6;
  const scale = args.scale ?? 480;

  // Pass 1: where does the picture actually change?
  const detect = run(ffmpeg, [
    "-hide_banner", "-nostats",
    "-i", file,
    "-vf", `select='gt(scene,${threshold})',showinfo`,
    "-f", "null", "-",
  ]);
  const sceneTimes = parseShowinfoTimes(detect.stderr);

  // Coverage floor + cap.
  let frames = thinToMax(densityFloor(sceneTimes, duration, gap), MAX_FRAMES);

  // Dedup via tiny grayscale thumbs (catches floor frames of static footage).
  const outDir = ensureDir(join(process.cwd(), "qa", "frame-sheets"));
  const tmpDir = join(outDir, `.scenes-tmp-${process.pid}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    const withThumbs = [];
    for (const frame of frames) {
      const thumb = join(tmpDir, `t_${frame.t.toFixed(3)}.pgm`);
      if (extractFrame(ffmpeg, file, frame.t, "scale=32:18,format=gray", thumb) && existsSync(thumb)) {
        withThumbs.push({ ...frame, pixels: parsePgm(readFileSync(thumb)).pixels });
      }
    }
    const { kept, dropped } = dedupFrames(withThumbs, { threshold: args["dedup-threshold"] ?? 5 });

    // Full-quality tiles for the kept frames only.
    for (let i = 0; i < kept.length; i++) {
      const jpg = join(tmpDir, `frame_${String(i).padStart(4, "0")}.jpg`);
      if (!extractFrame(ffmpeg, file, kept[i].t, `scale=${scale}:-1`, jpg)) {
        fail(`frame extraction failed at ${kept[i].t}s`, 1);
      }
    }
    const tileCols = Math.max(1, Math.min(cols, kept.length));
    const rows = Math.max(1, Math.ceil(kept.length / tileCols));
    const outPath = args.out ?? join(outDir, `${basename(file, extname(file))}_scenes.jpg`);
    const tile = run(ffmpeg, [
      "-hide_banner", "-v", "error", "-y",
      "-framerate", "1", "-pattern_type", "glob", "-i", join(tmpDir, "frame_*.jpg"),
      "-vf", `tile=${tileCols}x${rows}:padding=8:margin=8:color=0x1a1a1a`,
      "-frames:v", "1", outPath,
    ]);
    if (tile.status !== 0) fail(`scene sheet failed: ${tile.stderr.trim()}`, 1);

    output({
      ok: true,
      file,
      mode: "scenes",
      sheet: outPath,
      grid: `${tileCols}x${rows}`,
      frames: kept.map((f, i) => ({ tile: i, t: f.t, source: f.source })),
      sceneChanges: sceneTimes.length,
      deduped: dropped.length,
      params: { threshold, gap },
      hints: [
        "Tiles are row-major; `frames` maps each tile to its timestamp.",
        "In mostly-static footage (talking head), `source: scene` timestamps often mark resets, look-downs, or take boundaries — cross-reference with the transcript to find takes.",
        "Read the image before drawing conclusions.",
      ],
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function main(argv) {
  const args = parseArgs(argv, {
    fps: "number", cols: "number", scale: "number",
    start: "number", end: "number", tail: "number", out: "string", crop: "string",
    scenes: "boolean", "scene-threshold": "number", gap: "number", "dedup-threshold": "number",
  });
  const file = args._[0];
  if (!file) {
    fail(
      "Usage: ripple frame-sheet <file> [--fps 1] [--cols 6] [--scale 480] [--start S] [--end E] [--tail N] [--out path]\n" +
        "       [--crop x,y,w,h]   zoom every tile to a source region (eyes, hands) before scaling\n" +
        "       ripple frame-sheet <file> --scenes [--scene-threshold 0.3] [--gap 10]   (sample where the picture changes)",
      2
    );
  }
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);
  let crop = "";
  try {
    crop = cropFilter(args.crop);
  } catch (e) {
    fail(e.message, 2);
  }

  if (args.scenes) return scenesMode(args, file);

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
    "-vf", `fps=${fps},${crop}scale=${scale}:-1,tile=${cols}x${rows}:padding=8:margin=8:color=0x1a1a1a`,
    "-frames:v", "1", outPath,
  ]);
  if (res.status !== 0) fail(`frame sheet failed: ${res.stderr.trim()}`, 1);

  output({
    ok: true,
    file,
    mode: "fixed",
    ...(args.crop ? { crop: args.crop } : {}),
    sheet: outPath,
    frames,
    fps,
    grid: `${cols}x${rows}`,
    coveredSeconds: round3(duration),
    ...(fpsAdjusted ? { note: `fps reduced to ${fps} to keep the sheet readable (${MAX_FRAMES} frame cap); for long footage prefer --scenes` } : {}),
    reminder: "Read this image before declaring the edit good.",
  });
}
