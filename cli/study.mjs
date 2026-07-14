import { createHash } from "node:crypto";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { loadAnalysis, referenceSilences } from "./analyze.mjs";
import {
  ensureDir, fail, findTool, output, parseArgs, requireTool, rippleHome, round3, run,
} from "./util.mjs";

// Taste extraction from a reference edit: measure a video the user admires
// and propose VIDEO.md values with the measurement each one came from. A
// proposed number without its receipt is indistinguishable from a default —
// the user can't tell which values the reference actually earned. The
// command NEVER writes VIDEO.md itself; the skill layer merges the proposal
// with the user.

// Scheme detection, not a site list: yt-dlp speaks hundreds of extractors,
// and a hardcoded youtube.com check would silently treat a vimeo link as a
// filename ("File not found: https://vimeo.com/...").
export function isUrl(input) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
}

// Linear-interpolated quantile. Callers pass raw arrays; sorting is local so
// a profile function can't accidentally reorder index data it was handed.
export function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return round3(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

// Shot-length statistics from the index's hard-cut list. The curve is
// cuts/min per quarter of the runtime — "does it accelerate?" is a shape
// question, and one overall average hides a cold open that doubles its
// cutting rate by the end.
export function cuttingRhythm(sceneChanges, duration) {
  if (!sceneChanges?.length || !duration) return null;
  const bounds = [0, ...sceneChanges, duration];
  const shots = [];
  for (let i = 1; i < bounds.length; i++) {
    const len = bounds[i] - bounds[i - 1];
    if (len > 0.05) shots.push(round3(len));
  }
  if (!shots.length) return null;
  const mean = shots.reduce((a, b) => a + b, 0) / shots.length;
  const variance = round3(shots.reduce((a, b) => a + (b - mean) ** 2, 0) / shots.length);
  const quarter = duration / 4;
  const buckets = [0, 0, 0, 0];
  for (const t of sceneChanges) buckets[Math.min(3, Math.floor(t / quarter))]++;
  const curve = buckets.map((c) => round3(c / (quarter / 60)));
  return {
    cuts: sceneChanges.length,
    shotCount: shots.length,
    medianShot: quantile(shots, 0.5),
    p25Shot: quantile(shots, 0.25),
    p75Shot: quantile(shots, 0.75),
    variance,
    cutsPerMin: round3(sceneChanges.length / (duration / 60)),
    curve,
    // Under ~8 cuts the quarter curve is noise, not intent. The last quarter
    // must genuinely out-cut the first: with a single-take cold open
    // (curve[0] = 0) the ratio test is trivially true even when the final
    // quarter also has zero cuts — an edit whose cutting rate falls to
    // nothing must never earn an "accelerates" receipt in VIDEO.md.
    accelerates: sceneChanges.length >= 8 && curve[3] > curve[0] && curve[3] >= curve[0] * 1.3,
  };
}

// Delivery pace across the reference's sentences (wps comes from the index).
export function pacingProfile(sentences) {
  const wps = (sentences ?? []).map((s) => s.wps).filter((v) => typeof v === "number" && v > 0);
  if (!wps.length) return null;
  return {
    sentences: wps.length,
    medianWps: quantile(wps, 0.5),
    p25Wps: quantile(wps, 0.25),
    p75Wps: quantile(wps, 0.75),
    minWps: quantile(wps, 0),
    maxWps: quantile(wps, 1),
  };
}

// The load-bearing measurement: how much tail the reference's editor leaves
// between a sentence's last word and the cut. Only sentence ends where the
// cut arrives BEFORE the next sentence count — a cut landing mid-paragraph
// is a B-roll change, and folding those in would drag the inferred tail
// toward numbers no editor chose. The 0.2s of pre-end slack absorbs
// whisper/scene-detect timing slop.
export function tailBehavior(sentences, sceneChanges, { window = 3 } = {}) {
  if (!sentences?.length || !sceneChanges?.length) return null;
  const gaps = [];
  for (let i = 0; i < sentences.length; i++) {
    const end = sentences[i].end;
    const nextStart = sentences[i + 1]?.start ?? Infinity;
    const cut = sceneChanges.find((t) => t >= end - 0.2 && t - end <= window);
    if (cut === undefined || cut > nextStart) continue;
    gaps.push(round3(Math.max(0, cut - end)));
  }
  if (!gaps.length) return null;
  const p50 = quantile(gaps, 0.5);
  return {
    samples: gaps.length,
    p25: quantile(gaps, 0.25),
    p50,
    p75: quantile(gaps, 0.75),
    // Rounded to 0.1s: VIDEO.md holds a preference, not a measurement.
    inferredTail: Math.round(p50 * 10) / 10,
  };
}

// How the reference uses air: speech coverage and intentional holds.
export function silenceUsage(index) {
  if (!index?.hasAudio || !index.duration) return null;
  const speechTotal = (index.speech ?? []).reduce((a, s) => a + (s.end - s.start), 0);
  const holds = referenceSilences(index)
    .map((s) => round3((s.end ?? index.duration) - s.start))
    .filter((d) => d >= 0.25);
  return {
    speechRatio: round3(speechTotal / index.duration),
    silenceRatio: round3(Math.max(0, 1 - speechTotal / index.duration)),
    longestHold: holds.length ? Math.max(...holds) : 0,
    holdsOver1s: holds.filter((d) => d >= 1).length,
  };
}

// Loudness envelope character from the index's RMS track. -120 windows are
// digital silence (silence usage's finding, not energy's) — left in they
// would call every edit with hard pauses "dynamic".
export function energyProfile(values) {
  const db = (values ?? []).map((v) => v.db).filter((d) => Number.isFinite(d) && d > -119);
  if (db.length < 4) return null;
  const p10 = quantile(db, 0.1);
  const p90 = quantile(db, 0.9);
  const spread = round3(p90 - p10);
  return {
    windows: db.length,
    medianDb: quantile(db, 0.5),
    p10Db: p10,
    p90Db: p90,
    spreadDb: spread,
    character: spread <= 6 ? "flat" : spread <= 12 ? "moderate" : "dynamic",
  };
}

// Parse one signalstats metadata frame ("lavfi.signalstats.YAVG=118.53").
export function parseSignalstats(stdout) {
  const out = {};
  for (const line of stdout.split("\n")) {
    const m = line.match(/lavfi\.signalstats\.([A-Z]+)=(-?[\d.]+)/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

// Grade fingerprint from ~12 evenly spaced frames: brightness (YAVG),
// saturation (SATAVG), warm/cool lean from the chroma means (V above neutral
// = red lean, U above = blue), contrast as the 10th→90th luma spread. Runs
// on the ORIGINAL source, never the proxy — the proxy is an 8-bit re-encode
// and its color numbers describe the transcode, not the grade.
export function gradeFingerprint(file, duration, { samples = 12 } = {}) {
  if (!duration) return null;
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const frames = [];
  for (let i = 0; i < samples; i++) {
    const t = round3((duration * (i + 0.5)) / samples);
    const res = run(ffmpeg, [
      "-hide_banner", "-nostats", "-ss", String(t), "-i", file,
      "-an", "-vf", "signalstats,metadata=print:file=-", "-frames:v", "1", "-f", "null", "-",
    ]);
    if (res.status !== 0 && !frames.length) return null; // no video stream
    const s = parseSignalstats(res.stdout);
    if (Number.isFinite(s.YAVG)) {
      frames.push({ t, yavg: s.YAVG, uavg: s.UAVG, vavg: s.VAVG, satavg: s.SATAVG, ylow: s.YLOW, yhigh: s.YHIGH });
    }
  }
  if (!frames.length) return null;
  const mean = (key) => round3(frames.reduce((a, f) => a + f[key], 0) / frames.length);
  const warmth = round3(mean("vavg") - mean("uavg"));
  return {
    frames: frames.length,
    sampledAt: frames.map((f) => f.t),
    brightness: mean("yavg"),
    saturation: mean("satavg"),
    uMean: mean("uavg"),
    vMean: mean("vavg"),
    warmth,
    // ±4 around neutral: below that the lean is encoder noise, not a grade.
    lean: warmth > 4 ? "warm" : warmth < -4 ? "cool" : "neutral",
    contrastSpread: round3(frames.reduce((a, f) => a + (f.yhigh - f.ylow), 0) / frames.length),
  };
}

// Everything measurable from the cached index alone. The grade fingerprint
// is appended by main — it needs the media file, not the index.
export function computeStyleProfile(index) {
  return {
    cuttingRhythm: cuttingRhythm(index.sceneChanges, index.duration),
    pacing: pacingProfile(index.sentences),
    tail: tailBehavior(index.sentences, index.sceneChanges),
    silence: silenceUsage(index),
    energy: energyProfile(index.rms?.values),
  };
}

// The paste-ready VIDEO.md snippet. Every proposed value carries its
// measurement inline; anything the reference couldn't answer says
// "unmeasured" instead of inventing a plausible default.
export function proposedVideoMd(profile, { sourceName = "reference" } = {}) {
  const lines = [`## Pacing (measured from ${sourceName})`, ""];
  const t = profile.tail;
  lines.push(t
    ? `- Tail after final words: ${t.inferredTail}s — measured p50 ${t.p50}s across ${t.samples} cut-adjacent sentence ends (p25 ${t.p25}s / p75 ${t.p75}s)`
    : "- Tail after final words: unmeasured — no sentence end lands within 3s of a cut in this reference; keep the project default");
  const p = profile.pacing;
  if (p) {
    lines.push(`- Delivery pace: median ${p.medianWps} wps across ${p.sentences} sentences (p25 ${p.p25Wps} / p75 ${p.p75Wps}) — favor takes near this pace`);
  }
  const c = profile.cuttingRhythm;
  lines.push(c
    ? `- Shot length: median ${c.medianShot}s (p25 ${c.p25Shot}s / p75 ${c.p75Shot}s, variance ${c.variance}) at ${c.cutsPerMin} cuts/min` +
      (c.accelerates ? ` — accelerates toward the end (per-quarter cuts/min ${c.curve.join(" → ")})` : "")
    : "- Shot length: no hard cuts detected — single-take or dissolve-led reference");
  const s = profile.silence;
  if (s) {
    lines.push(`- Holds: speech fills ${Math.round(s.speechRatio * 100)}% of runtime; longest intentional hold ${s.longestHold}s; ${s.holdsOver1s} hold(s) over 1s`);
  }
  const e = profile.energy;
  if (e) {
    lines.push(`- Energy: ${e.character} — RMS p10–p90 spread ${e.spreadDb} dB around a ${e.medianDb} dB median`);
  }
  const g = profile.grade;
  if (g) {
    lines.push(
      "",
      `## Grade notes (measured across ${g.frames} frames)`,
      "",
      `- Temperature: ${g.lean} (V−U ${g.warmth >= 0 ? "+" : ""}${g.warmth})`,
      `- Brightness YAVG ${g.brightness}; saturation SATAVG ${g.saturation}; contrast spread (YHIGH−YLOW) ${g.contrastSpread}`
    );
  }
  return lines.join("\n") + "\n";
}

const MEDIA_RE = /\.(mp4|mov|m4v|mkv|webm)$/i;

// Filesystem-safe cache key for a yt-dlp video id. Sanitization alone is
// lossy — ' ', ':' and '/' all collapse to '_', so "My Clip.mp4" and
// "My_Clip.mp4" (two different direct-link references) would share one
// cache dir, the second study silently measuring the first video and
// --force evicting its download. When sanitizing changes the id, a short
// hash of the raw id keeps the dirs distinct; clean ids (every YouTube id)
// keep their exact dir.
export function studyCacheKey(rawId) {
  const safe = rawId.replace(/[^A-Za-z0-9._-]/g, "_");
  if (safe === rawId) return rawId;
  return `${safe}-${createHash("sha1").update(rawId).digest("hex").slice(0, 8)}`;
}

// Download a URL reference once into ~/.ripple/study/<video-id>/. The video
// id IS the cache key, and only yt-dlp can derive it — so a cache hit still
// costs one metadata call, never a second download. ≤1080p mp4 preferred:
// study measures rhythm and color, not pixels, and a 4K remux buys nothing
// but download and decode time.
export function fetchReference(url, { force = false } = {}) {
  const ytdlp = findTool(["yt-dlp"]);
  if (!ytdlp) {
    fail("yt-dlp not found — `ripple study <url>` needs it to fetch the reference.", 2, {
      hint: "brew install yt-dlp (or: pipx install yt-dlp)",
    });
  }
  const probe = run(ytdlp, ["--no-playlist", "--skip-download", "--print", "id", url]);
  const rawId = probe.stdout.trim().split("\n")[0] ?? "";
  if (probe.status !== 0 || !rawId) {
    fail(`yt-dlp could not read metadata for ${url}: ${(probe.stderr || probe.stdout).trim().slice(-500)}`, 1);
  }
  const id = studyCacheKey(rawId);
  const dir = ensureDir(join(rippleHome(), "study", id));
  // .proxy.mp4 excluded: analysis artifacts share this dir, and a proxy must
  // never be mistaken for the downloaded source.
  const findMedia = () =>
    readdirSync(dir).find((f) => MEDIA_RE.test(f) && !/\.proxy\.mp4$/i.test(f) && !f.includes(".tmp"));
  if (force) {
    for (const f of readdirSync(dir)) if (MEDIA_RE.test(f)) rmSync(join(dir, f), { force: true });
  }
  let media = findMedia();
  if (media) return { file: join(dir, media), id, dir, cached: true };
  const dl = run(ytdlp, [
    "--no-playlist",
    "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b[height<=1080]/b",
    "--merge-output-format", "mp4",
    "-o", join(dir, "%(id)s.%(ext)s"),
    url,
  ]);
  if (dl.status !== 0) fail(`yt-dlp download failed: ${dl.stderr.trim().slice(-500)}`, 1);
  media = findMedia();
  if (!media) fail(`yt-dlp reported success but no media file landed in ${dir}`, 1);
  return { file: join(dir, media), id, dir, cached: false };
}

export async function main(argv) {
  const args = parseArgs(argv, { out: "string", force: "boolean" });
  const input = args._[0];
  if (!input) {
    fail("Usage: ripple study <file-or-url> [--out dir] [--force]\n" +
      "       Measure a reference edit and propose VIDEO.md values with receipts\n" +
      "       (URLs are fetched with yt-dlp and cached in ~/.ripple/study)", 2);
  }

  let file = input;
  let source = { input, kind: "file" };
  if (isUrl(input)) {
    const fetched = fetchReference(input, { force: args.force ?? false });
    file = fetched.file;
    source = { input, kind: "url", videoId: fetched.id, cacheDir: fetched.dir, downloadCached: fetched.cached };
  } else if (!existsSync(input)) {
    fail(`File not found: ${input}`, 2);
  }

  // URL references are not project sources: their index lives next to the
  // download in the study cache, not in this project's work/analysis.
  const outDir = args.out ?? (source.kind === "url" ? source.cacheDir : undefined);
  const { index, path: indexPath } = loadAnalysis(file, { outDir, force: args.force ?? false });

  const styleProfile = computeStyleProfile(index);
  styleProfile.grade = gradeFingerprint(file, index.duration);

  output({
    ok: true,
    source,
    file,
    index: indexPath,
    styleProfile,
    proposedVideoMd: proposedVideoMd(styleProfile, { sourceName: basename(file) }),
    hints: [
      "proposedVideoMd is a proposal with receipts, not a decision — merge it into VIDEO.md WITH the user; this command never writes VIDEO.md.",
      "tail.inferredTail maps straight onto 'Tail after final words' in VIDEO.md's Pacing block — the single most load-bearing taste number.",
      "Re-running is free: the download and the perception index are both cached (--force refetches and rebuilds).",
    ],
  });
}
