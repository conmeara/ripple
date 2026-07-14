import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

const toolCache = new Map();
export function findTool(names) {
  const key = names.join(",");
  if (toolCache.has(key)) return toolCache.get(key);
  for (const name of names) {
    const which = run("which", [name]);
    if (which.status === 0 && which.stdout.trim()) {
      toolCache.set(key, name);
      return name;
    }
  }
  toolCache.set(key, null);
  return null;
}

export function requireTool(names, hint) {
  const tool = findTool(names);
  if (!tool) {
    fail(`Required tool not found: ${names.join(" or ")}. ${hint ?? ""}`.trim(), 2);
  }
  return tool;
}

export function ffprobeJson(file) {
  const ffprobe = requireTool(["ffprobe"], "Install ffmpeg (brew install ffmpeg).");
  const res = run(ffprobe, [
    "-hide_banner", "-v", "error",
    "-show_format", "-show_streams",
    "-print_format", "json",
    file,
  ]);
  if (res.status !== 0) fail(`ffprobe failed for ${file}: ${res.stderr.trim()}`, 1);
  return JSON.parse(res.stdout);
}

// Parse `key value` style flags: parseArgs(argv, { start: "number", label: "string", json: "boolean" })
export function parseArgs(argv, spec) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const kind = spec[name];
    if (!kind) fail(`Unknown option --${name}`, 2);
    if (kind === "boolean") {
      out[name] = true;
    } else {
      const value = argv[++i];
      if (value === undefined) fail(`--${name} requires a value`, 2);
      out[name] = kind === "number" ? Number(value) : value;
      if (kind === "number" && Number.isNaN(out[name])) fail(`--${name} must be a number`, 2);
    }
  }
  return out;
}

export function output(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

export function fail(message, code = 1, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ok: false, error: { message, ...extra } }, null, 2) + "\n"
  );
  process.exit(code);
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function rippleHome() {
  return ensureDir(join(homedir(), ".ripple"));
}

export function fileStamp(file) {
  const st = statSync(file);
  return createHash("sha1")
    .update(`${file}:${st.size}:${st.mtimeMs}`)
    .digest("hex")
    .slice(0, 12);
}

export function fileExists(p) {
  return existsSync(p);
}

// Cache reads must never crash a command: a corrupt or half-written cache
// file is a cache miss, not an error.
export function readJsonOrNull(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// Atomic cache write: never leave a truncated JSON file for the next
// process to trip over.
export function writeJsonAtomic(path, obj, space = 1) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, space));
  renameSync(tmp, path);
}

// The shared per-source 16kHz mono wav, extracted atomically (tmp+rename):
// a concurrent run or an interrupted extraction must never leave a
// half-written wav that a bare existsSync would then trust — every timing
// number downstream would silently come from truncated audio.
export function extractWav16k(file, wav, { force = false } = {}) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  if (force) rmSync(wav, { force: true });
  if (existsSync(wav)) return wav;
  const tmp = `${wav}.tmp-${process.pid}.wav`;
  const res = run(ffmpeg, [
    "-hide_banner", "-y", "-v", "error",
    "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-vn", tmp,
  ]);
  if (res.status !== 0) {
    rmSync(tmp, { force: true });
    fail(`Audio extraction failed: ${res.stderr.trim()}`, 1);
  }
  renameSync(tmp, wav);
  return wav;
}

// Parse ffmpeg silencedetect stderr into [{start, end, duration}] (end/duration
// may be missing for silence running to EOF).
export function parseSilence(stderr) {
  const spans = [];
  let current = null;
  for (const line of stderr.split("\n")) {
    const startMatch = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (startMatch) {
      current = { start: Number(startMatch[1]), end: null, duration: null };
      spans.push(current);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (endMatch && current) {
      current.end = Number(endMatch[1]);
      current.duration = Number(endMatch[2]);
      current = null;
    }
  }
  return spans;
}

// Leading/tail silence of a clip of length `duration` given parsed spans.
export function silenceEdges(spans, duration) {
  let leading = 0;
  let tail = 0;
  for (const s of spans) {
    if (s.start <= 0.05) leading = (s.end ?? duration) - Math.max(s.start, 0);
    const end = s.end ?? duration;
    if (end >= duration - 0.05) tail = end - s.start;
  }
  return { leading: round3(leading), tail: round3(tail) };
}

export function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// Parse the JSON stats block loudnorm prints to stderr (print_format=json)
// into numbers ({input_i, input_tp, ...}); null if absent or unparseable.
export function parseLoudnorm(stderr) {
  const match = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]);
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      const n = Number(value);
      out[key] = Number.isNaN(n) ? value : n;
    }
    return out;
  } catch {
    return null;
  }
}

export function detectHdr(videoStream) {
  if (!videoStream) return { hdr: false };
  const primaries = videoStream.color_primaries ?? "";
  const transfer = videoStream.color_transfer ?? "";
  const space = videoStream.color_space ?? "";
  const hdr =
    primaries === "bt2020" ||
    transfer === "arib-std-b67" ||
    transfer === "smpte2084" ||
    space.startsWith("bt2020");
  return {
    hdr,
    kind: transfer === "smpte2084" ? "PQ" : transfer === "arib-std-b67" ? "HLG" : hdr ? "BT.2020" : "SDR",
    color_primaries: primaries || null,
    color_transfer: transfer || null,
    color_space: space || null,
    pix_fmt: videoStream.pix_fmt ?? null,
  };
}
