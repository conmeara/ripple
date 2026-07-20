import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import {
  detectHdr, fail, ffprobeJson, fileStamp, findTool, output, parseArgs, readJsonOrNull, round3, run,
} from "./util.mjs";

// One "what media do I have" command. With a file: streams, duration, HDR,
// ffmpeg capabilities. Without: the bins panel — every media file with
// duration/codec/HDR and whether the perception index has seen it. Humans
// get media bins and thumbnails; agents get ls — this closes that gap.

// Optional ffmpeg filters worth knowing about before choosing a pipeline.
// drawtext is famously absent from many builds (title cards); the rest
// gate specific techniques.
const INTERESTING_FILTERS = [
  "zscale", "drawtext", "subtitles", "ass", "tile", "zoompan", "loudnorm", "libplacebo",
];

const MEDIA_RE = /\.(mov|mp4|mkv|webm|m4v|avi|mts|m2ts|mxf|mp3|wav|m4a|aac|flac|aiff|ogg)$/i;
// Derived/managed dirs an editor's bin never shows.
const SKIP_DIRS = new Set(["work", "outputs", "qa", "handoff", "node_modules", ".git", ".ripple"]);
// cut.mjs derives per-preset clip dirs as "clips" + `_${preset}` (clips/,
// clips_vertical/, clips_square/, any future preset) — cut.mjs dirSuffix is
// the source of truth. Counting ripple's own derived clips as project
// sources made the bin report phantom unindexed footage after a preset cut.
const CLIPS_DIR_RE = /^clips(_.+)?$/;

function skipDir(name) {
  return SKIP_DIRS.has(name) || CLIPS_DIR_RE.test(name);
}

export function filterCapabilitiesFromText(text) {
  const available = {};
  for (const filter of INTERESTING_FILTERS) {
    available[filter] = new RegExp(`\\s${filter}\\s`).test(text);
  }
  // Both filters are provided by ffmpeg's libass integration. Expose the
  // library-level capability the skill talks about as well as the raw names.
  available.libass = available.subtitles && available.ass;
  if (!available.drawtext) {
    available.note =
      "drawtext unavailable — render title cards via HyperFrames/Remotion or ImageMagick PNG + loop, not drawtext.";
  }
  return available;
}

export function probeFilters({ findToolFn = findTool, runFn = run } = {}) {
  const ffmpeg = findToolFn(["ffmpeg"]);
  if (!ffmpeg) return { error: "ffmpeg not found on PATH" };
  const res = runFn(ffmpeg, ["-hide_banner", "-filters"]);
  if (res.status !== 0) return { error: res.stderr.trim() || "ffmpeg -filters failed" };
  return filterCapabilitiesFromText(res.stdout);
}

export function attachFilterCapabilities(result, ffmpegFilters) {
  result.ffmpegFilters = ffmpegFilters;
  if (ffmpegFilters.error) {
    result.ok = false;
    result.error = `ffmpeg capability probe failed: ${ffmpegFilters.error}`;
  }
  return result;
}

export function findMedia(root, { maxDepth = 3 } = {}) {
  const found = [];
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!skipDir(e.name) && depth < maxDepth) walk(full, depth + 1);
      } else if (MEDIA_RE.test(e.name)) {
        found.push(full);
      }
    }
  };
  walk(root, 0);
  return found.sort();
}

// The bin listing (probe with no file, or probe <dir>).
function probeBin(root, { analysisDir }) {
  const files = findMedia(root);
  const sources = files.map((file) => {
    let probe;
    try {
      probe = ffprobeJson(file);
    } catch {
      return { file, error: "unreadable (ffprobe failed)" };
    }
    const video = (probe.streams ?? []).find((s) => s.codec_type === "video");
    const audio = (probe.streams ?? []).find((s) => s.codec_type === "audio");
    const duration = round3(Number(probe.format?.duration ?? 0));
    const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
    // The index may live in this project's work/analysis or the scanned
    // root's own — check both before calling footage unindexed.
    const index =
      readJsonOrNull(join(analysisDir, `${stem}.analysis.json`)) ??
      readJsonOrNull(join(root, "work", "analysis", `${stem}.analysis.json`));
    return {
      file,
      duration,
      sizeMb: round3(statSync(file).size / 1048576),
      video: video ? { codec: video.codec_name, resolution: `${video.width}x${video.height}`, hdr: detectHdr(video).kind } : null,
      audio: Boolean(audio),
      indexed: Boolean(index),
      ...(index
        ? {
            words: index.words?.length ?? 0,
            sentences: index.sentences?.length ?? 0,
            nonSpeech: index.nonSpeech?.length ?? 0,
          }
        : {}),
    };
  });

  const unindexed = sources.filter((s) => !s.error && !s.indexed && s.audio);
  output({
    ok: true,
    root,
    count: sources.length,
    totalDuration: round3(sources.reduce((a, s) => a + (s.duration ?? 0), 0)),
    sources,
    ...(unindexed.length
      ? { hint: `${unindexed.length} source(s) not yet indexed — run ripple analyze on each before planning (search/candidates need the index).` }
      : {}),
  });
}

export async function main(argv) {
  const args = parseArgs(argv, { filters: "boolean", "analysis-dir": "string" });
  const target = args._[0];

  // Capability discovery is useful before a source exists. With no target,
  // --filters answers only that question instead of silently returning a bin.
  if (args.filters && !target) {
    const ffmpegFilters = probeFilters();
    output({ ok: !ffmpegFilters.error, ffmpegFilters });
    if (ffmpegFilters.error) process.exit(1);
    return;
  }

  // No file (or a directory) = the bin listing.
  const isDir = target && existsSync(target) && statSync(target).isDirectory();
  if (!target || isDir) {
    const root = target ?? process.cwd();
    if (!existsSync(root)) fail(`Directory not found: ${root}`, 2);
    probeBin(root, { analysisDir: args["analysis-dir"] ?? join(process.cwd(), "work", "analysis") });
    return;
  }

  const file = target;
  const probe = ffprobeJson(file);
  const video = (probe.streams ?? []).find((s) => s.codec_type === "video");
  const audio = (probe.streams ?? []).filter((s) => s.codec_type === "audio");
  const hdr = detectHdr(video);

  const result = {
    ok: true,
    file,
    container: probe.format?.format_name ?? null,
    duration: probe.format?.duration ? Number(probe.format.duration) : null,
    sizeBytes: probe.format?.size ? Number(probe.format.size) : null,
    video: video
      ? {
          codec: video.codec_name,
          profile: video.profile ?? null,
          width: video.width,
          height: video.height,
          fps: video.avg_frame_rate ?? null,
          pix_fmt: video.pix_fmt ?? null,
        }
      : null,
    audio: audio.map((a) => ({
      index: a.index,
      codec: a.codec_name,
      channels: a.channels,
      sample_rate: a.sample_rate,
    })),
    color: hdr,
    colorPolicySuggestion: hdr.hdr
      ? "preserve — source is HDR; converting to SDR silently will look washed out. Ask the user or check VIDEO.md."
      : "sdr source — standard BT.709 pipeline is fine.",
  };

  if (args.filters) {
    attachFilterCapabilities(result, probeFilters());
  }

  output(result);
  if (!result.ok) process.exit(1);
}
