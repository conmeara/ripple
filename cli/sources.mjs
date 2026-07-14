import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { detectHdr, fail, ffprobeJson, fileStamp, output, parseArgs, readJsonOrNull, round3 } from "./util.mjs";

// The bins panel: what footage exists, what it is, and whether the
// perception index has seen it. Humans get media bins and thumbnails;
// agents get ls — this closes that gap.

const MEDIA_RE = /\.(mov|mp4|mkv|webm|m4v|avi|mts|m2ts|mxf|mp3|wav|m4a|aac|flac|aiff|ogg)$/i;
// Derived/managed dirs an editor's bin never shows.
const SKIP_DIRS = new Set(["work", "outputs", "qa", "handoff", "node_modules", ".git", ".ripple"]);
// cut.mjs derives per-preset clip dirs as "clips" + `_${preset}` (clips/,
// clips_vertical/, clips_square/, any future preset) — cut.mjs dirSuffix is
// the source of truth. Counting ripple's own derived clips as project
// sources made status report phantom unindexed footage after a preset cut.
const CLIPS_DIR_RE = /^clips(_.+)?$/;

function skipDir(name) {
  return SKIP_DIRS.has(name) || CLIPS_DIR_RE.test(name);
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

export async function main(argv) {
  const args = parseArgs(argv, { "analysis-dir": "string" });
  const root = args._[0] ?? process.cwd();
  if (!existsSync(root)) fail(`Directory not found: ${root}`, 2);
  const analysisDir = args["analysis-dir"] ?? join(process.cwd(), "work", "analysis");

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
