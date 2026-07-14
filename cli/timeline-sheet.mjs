import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { loadAnalysis, referenceSilences } from "./analyze.mjs";
import { resolveCardFont } from "./cut.mjs";
import { cutTiming } from "./timing.mjs";
import {
  ensureDir, fail, ffprobeJson, findTool, output, parseArgs, requireTool, round3, run,
} from "./util.mjs";

// The editor's timeline view, as one image: a shared time axis carrying
// ruler / thumbnails / motion strip / waveform with silence shading / the
// word-aligned transcript, plus cut-line markers. This is the tool that
// distinguishes "pausing while looking down" from "quietly reading the next
// question" — frames alone cannot, and neither can untimed text.
//
// Numbers-in-JSON discipline: everything drawn on the sheet is also in the
// envelope. The image is for seeing the situation; decisions ride on the
// numbers (models misread pixel text, and words after a long pause carry
// fuzzy timestamps).

// ---------- pure helpers (unit-tested) ----------

// "209:IN,233.3:OUT howmet" → [{t, label}]
export function parseMarkers(spec) {
  if (!spec) return [];
  return spec
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => {
      const idx = m.indexOf(":");
      const t = Number(idx === -1 ? m : m.slice(0, idx));
      if (Number.isNaN(t)) return null;
      return { t, label: idx === -1 ? "" : m.slice(idx + 1).trim() };
    })
    .filter(Boolean);
}

// Scene IN/OUT markers from a manifest that fall inside the window.
export function manifestMarkers(manifest, { start, end }) {
  const markers = [];
  for (const s of manifest?.scenes ?? []) {
    if (s.start >= start && s.start <= end) markers.push({ t: s.start, label: `${s.slug} IN`, kind: "in", slug: s.slug });
    if (s.end >= start && s.end <= end) markers.push({ t: s.end, label: `${s.slug} OUT`, kind: "out", slug: s.slug });
  }
  return markers;
}

// Adaptive ruler: pick the finest (minor, major) tick pair whose minor
// spacing stays ≥ minPx apart on screen.
export function rulerSteps(windowSec, width, minPx = 12) {
  const pairs = [[1, 5], [2, 10], [5, 30], [10, 60], [30, 300], [60, 600]];
  for (const [minor, major] of pairs) {
    if ((minor / windowSec) * width >= minPx) return { minor, major };
  }
  return { minor: 300, major: 1800 };
}

// Greedy lane layout for word labels: first lane whose previous label has
// cleared this word's x. Words that fit nowhere become bare ticks (crowded).
export function layoutLanes(words, { start, end, width, lanes = 3, fontPx = 16 }) {
  const px = (t) => ((t - start) / (end - start)) * width;
  const laneEnds = Array(lanes).fill(-Infinity);
  const placed = [];
  let crowded = 0;
  for (const w of words) {
    const x = px(w.start);
    const textW = Math.max(w.text.length, 2) * fontPx * 0.55;
    const lane = laneEnds.findIndex((e) => e <= x - 4);
    if (lane === -1) {
      crowded++;
      placed.push({ ...w, x: Math.round(x), lane: null });
      continue;
    }
    laneEnds[lane] = x + textW;
    placed.push({ ...w, x: Math.round(x), lane });
  }
  return { placed, crowded };
}

// Downsample a track to at most `max` points (peak-preserving: keep the max
// of each bucket so short motion/energy spikes survive).
export function downsampleTrack(values, max) {
  if (values.length <= max) return values;
  const bucket = values.length / max;
  const out = [];
  for (let i = 0; i < max; i++) {
    const slice = values.slice(Math.floor(i * bucket), Math.max(Math.floor((i + 1) * bucket), Math.floor(i * bucket) + 1));
    out.push(slice.reduce((a, b) => (b.value > a.value ? b : a)));
  }
  return out;
}

// ---------- rendering ----------

// "#RRGGBB" is valid color syntax for both ffmpeg and ImageMagick.
const COLORS = {
  bg: "#141414",
  wave: "#53a6ff",
  silence: "rgba(255,80,80,0.20)",
  nonSpeech: "rgba(255,214,80,0.25)",
  marker: "#ff9f2e",
  word: "#f0f0f0",
  tick: "#8a8a8a",
  majorTick: "#e8e8e8",
  grid: "rgba(255,255,255,0.10)",
  sentence: "#8fd47a",
};

// Render the sheet PNG. Exported for candidates (cut cards share this path).
// Returns { sheet, geometry, crowded, degraded }. Library function: failures
// THROW (callers degrade gracefully); only main() converts to fail().
export function renderSheet({
  file, start, end, out, width = 1920, index, markers = [], mode = "detail",
}) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const magick = findTool(["magick", "convert"]);
  const windowSec = end - start;
  if (!(windowSec > 0)) throw new Error(`invalid sheet window: ${start}–${end}`);

  const RULER_H = 34;
  const thumbCount = 16;
  // The thumbnail strip is thumbCount tiles wide; every row must agree on
  // width exactly (vstack in the degraded path rejects mismatches).
  const thumbW = Math.max(Math.floor(width / thumbCount), 20);
  width = thumbW * thumbCount;
  const x = (t) => Math.round(((t - start) / windowSec) * width);
  const video = (ffprobeJson(file).streams ?? []).find((s) => s.codec_type === "video");
  const hasAudio = index?.hasAudio !== false;
  const aspect = video && video.width ? video.height / video.width : 9 / 16;
  const THUMB_H = video ? Math.min(Math.round(thumbW * aspect), 160) : 0;
  // The motion strip only renders on the ImageMagick path — geometry must
  // not reserve space for it otherwise.
  const MOTION_H = index?.motion && magick ? 10 : 0;
  const WAVE_H = 200;
  const wordsInWindow = (index?.words ?? []).filter((w) => w.end > start && w.start < end);
  const wordMode = mode === "detail" && wordsInWindow.length > 0;
  const LANES = 3;
  const LANE_H = 30;
  const TEXT_H = wordMode ? LANES * LANE_H + 14 : 24;
  const H = RULER_H + THUMB_H + MOTION_H + WAVE_H + TEXT_H;
  const waveY = RULER_H + THUMB_H + MOTION_H;

  const tmp = join(ensureDir(join(process.cwd(), "qa", "frame-sheets")), `.tsheet-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  try {
    // Thumbnails: one frame per column, centered in its slice.
    if (THUMB_H > 0) {
      for (let i = 0; i < thumbCount; i++) {
        const t = start + (i + 0.5) * (windowSec / thumbCount);
        const res = run(ffmpeg, [
          "-hide_banner", "-v", "error", "-y", "-ss", String(Math.max(t, 0)), "-i", file,
          "-frames:v", "1", "-vf", `scale=${thumbW}:${THUMB_H}`,
          join(tmp, `th_${String(i).padStart(2, "0")}.jpg`),
        ]);
        if (res.status !== 0) run(ffmpeg, ["-hide_banner", "-v", "error", "-y",
          "-f", "lavfi", "-i", `color=c=black:s=${thumbW}x${THUMB_H}`, "-frames:v", "1",
          join(tmp, `th_${String(i).padStart(2, "0")}.jpg`)]);
      }
      const tile = run(ffmpeg, [
        "-hide_banner", "-v", "error", "-y", "-framerate", "1",
        "-pattern_type", "glob", "-i", join(tmp, "th_*.jpg"),
        "-vf", `tile=${thumbCount}x1`, "-frames:v", "1", join(tmp, "thumbs.png"),
      ]);
      if (tile.status !== 0) throw new Error(`thumbnail strip failed: ${tile.stderr.trim()}`);
    }

    // Waveform (explicit first audio stream; dual-track sources must show
    // the same mic the transcript heard). Audio-less sources get a flat
    // background strip so the geometry — and the reader's habits — hold.
    const wave = hasAudio
      ? run(ffmpeg, [
          "-hide_banner", "-v", "error", "-y",
          "-ss", String(Math.max(start, 0)), "-t", String(windowSec), "-i", file,
          "-filter_complex",
          `[0:a:0]aformat=channel_layouts=mono,showwavespic=s=${width}x${WAVE_H}:colors=${COLORS.wave}:filter=peak`,
          "-frames:v", "1", join(tmp, "wave.png"),
        ])
      : run(ffmpeg, [
          "-hide_banner", "-v", "error", "-y",
          "-f", "lavfi", "-i", `color=c=${COLORS.bg.replace("#", "0x")}:s=${width}x${WAVE_H}`,
          "-frames:v", "1", join(tmp, "wave.png"),
        ]);
    if (wave.status !== 0) throw new Error(`waveform failed: ${wave.stderr.trim()}`);

    const silences = referenceSilences(index)
      .map((s) => ({ start: s.start, end: s.end ?? end }))
      .filter((s) => s.end > start && s.start < end);
    const nonSpeech = (index?.nonSpeech ?? []).filter((s) => s.end > start && s.start < end);

    if (!magick) {
      // Degraded ffmpeg-only sheet: rows + silence boxes + marker lines,
      // no text. The envelope carries every number the labels would have.
      const boxes = [];
      for (const s of silences) {
        boxes.push(`drawbox=x=${x(s.start)}:y=${waveY}:w=${Math.max(x(s.end) - x(s.start), 1)}:h=${WAVE_H}:color=red@0.2:t=fill`);
      }
      for (const m of markers) {
        if (m.t < start || m.t > end) continue;
        boxes.push(`drawbox=x=${x(m.t)}:y=0:w=2:h=${H}:color=orange@0.9:t=fill`);
      }
      const inputs = THUMB_H > 0
        ? ["-i", join(tmp, "thumbs.png"), "-i", join(tmp, "wave.png")]
        : ["-i", join(tmp, "wave.png")];
      const stack = THUMB_H > 0
        ? `[0][1]vstack=inputs=2,pad=${width}:${H}:0:${RULER_H}:color=${COLORS.bg.replace("#", "0x")}`
        : `pad=${width}:${H}:0:${RULER_H}:color=${COLORS.bg.replace("#", "0x")}`;
      const res = run(ffmpeg, [
        "-hide_banner", "-v", "error", "-y", ...inputs,
        "-filter_complex", `${stack}${boxes.length ? "," + boxes.join(",") : ""}`,
        "-frames:v", "1", out,
      ]);
      if (res.status !== 0) throw new Error(`sheet compose failed: ${res.stderr.trim()}`);
      return { sheet: out, geometry: { width, height: H }, crowded: 0, degraded: "no ImageMagick — sheet has no text labels; use the JSON numbers (brew install imagemagick for full sheets)" };
    }

    const font = resolveCardFont();
    const draw = [];

    // Silence shading (red) and audible-but-wordless shading (amber) over
    // the waveform.
    for (const s of silences) {
      draw.push("-fill", COLORS.silence, "-stroke", "none",
        "-draw", `rectangle ${x(Math.max(s.start, start))},${waveY} ${x(Math.min(s.end, end))},${waveY + WAVE_H}`);
    }
    for (const s of nonSpeech) {
      draw.push("-fill", COLORS.nonSpeech, "-stroke", "none",
        "-draw", `rectangle ${x(Math.max(s.start, start))},${waveY} ${x(Math.min(s.end, end))},${waveY + Math.round(WAVE_H / 4)}`);
    }

    // Motion heat strip under the thumbnails.
    if (MOTION_H > 0) {
      const inWindow = index.motion.values.filter((v) => v.t >= start && v.t <= end)
        .map((v) => ({ t: v.t, value: v.ydif }));
      const samples = downsampleTrack(inWindow, Math.floor(width / 2));
      const stripY = RULER_H + THUMB_H;
      for (const s of samples) {
        const heat = Math.min(Math.round((s.value / 20) * 255), 255);
        const hex = heat.toString(16).padStart(2, "0");
        draw.push("-fill", `#${hex}${hex}${hex}`, "-stroke", "none",
          "-draw", `rectangle ${x(s.t)},${stripY} ${x(s.t) + 2},${stripY + MOTION_H}`);
      }
    }

    // Ruler.
    const { minor, major } = rulerSteps(windowSec, width);
    for (let t = Math.ceil(start / minor) * minor; t <= end; t += minor) {
      const isMajor = t % major === 0;
      draw.push("-fill", "none", "-stroke", isMajor ? COLORS.majorTick : COLORS.tick, "-strokewidth", "1",
        "-draw", `line ${x(t)},${isMajor ? 4 : 18} ${x(t)},${RULER_H - 4}`);
      if (isMajor) {
        const mm = String(Math.floor(t / 60)).padStart(2, "0");
        const ss = String(Math.round(t % 60)).padStart(2, "0");
        draw.push("-stroke", "none", "-fill", COLORS.majorTick, "-pointsize", "15",
          "-draw", `text ${Math.min(x(t) + 4, width - 52)},16 '${mm}:${ss}'`);
        draw.push("-fill", "none", "-stroke", COLORS.grid,
          "-draw", `line ${x(t)},${RULER_H} ${x(t)},${H}`);
      }
    }

    // Words (detail) or sentence-end ticks (overview).
    let crowded = 0;
    const textY = waveY + WAVE_H;
    if (wordMode) {
      const layout = layoutLanes(wordsInWindow, { start, end, width, lanes: LANES });
      crowded = layout.crowded;
      for (const w of layout.placed) {
        draw.push("-fill", "none", "-stroke", COLORS.wave, "-strokewidth", "1",
          "-draw", `line ${x(w.start)},${textY} ${x(w.start)},${w.lane === null ? textY + 8 : textY + 10 + w.lane * LANE_H}`);
        if (w.lane === null) continue;
        const safe = w.text.replace(/['"\\]/g, "");
        if (safe) draw.push("-stroke", "none", "-fill", COLORS.word, "-pointsize", "16",
          "-draw", `text ${x(w.start)},${textY + 24 + w.lane * LANE_H} '${safe}'`);
      }
    } else {
      for (const t of index?.sentenceEnds ?? []) {
        if (t < start || t > end) continue;
        draw.push("-fill", "none", "-stroke", COLORS.sentence, "-strokewidth", "1",
          "-draw", `line ${x(t)},${textY + 2} ${x(t)},${textY + 18}`);
      }
    }

    // Markers last: full-height orange cut lines.
    for (const m of markers) {
      if (m.t < start || m.t > end) continue;
      draw.push("-fill", "none", "-stroke", COLORS.marker, "-strokewidth", "2",
        "-draw", `line ${x(m.t)},0 ${x(m.t)},${H}`);
      const label = (m.label ?? "").replace(/['"\\]/g, "");
      if (label) draw.push("-stroke", "none", "-fill", COLORS.marker, "-pointsize", "16",
        "-draw", `text ${Math.min(x(m.t) + 5, width - 90)},${RULER_H + 16} '${label}'`);
    }

    const composeArgs = [
      "-size", `${width}x${H}`, `xc:${COLORS.bg}`,
      ...(THUMB_H > 0 ? [join(tmp, "thumbs.png"), "-geometry", `+0+${RULER_H}`, "-composite"] : []),
      join(tmp, "wave.png"), "-geometry", `+0+${waveY}`, "-composite",
      ...(font ? ["-font", font] : []),
      ...draw,
      out,
    ];
    const res = run(magick, composeArgs);
    if (res.status !== 0) throw new Error(`sheet compose failed: ${res.stderr.trim().slice(0, 800)}`);
    return { sheet: out, geometry: { width, height: H }, crowded, degraded: null };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- impl ----------

export async function main(argv) {
  const args = parseArgs(argv, {
    start: "number", end: "number", around: "number", span: "number",
    manifest: "string", scene: "string", markers: "string",
    out: "string", width: "number", force: "boolean",
  });
  const file = args._[0];
  if (!file) {
    fail("Usage: ripple timeline-sheet <file> [--start S --end E | --around T --span 12]\n" +
      "       [--manifest edit.json [--scene slug]] [--markers \"209:IN,233.3:OUT\"]\n" +
      "       [--out path] [--width 1920]", 2);
  }
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const duration = round3(Number(ffprobeJson(file).format?.duration ?? 0));
  if (!duration) fail(`Could not read duration of ${file}`, 1);

  let manifest = null;
  if (args.manifest) {
    if (!existsSync(args.manifest)) fail(`Manifest not found: ${args.manifest}`, 2);
    manifest = JSON.parse(readFileSync(args.manifest, "utf8"));
  }

  // Window: explicit range, zoom around a point, a manifest scene ±4s, or
  // the whole file (overview).
  let start;
  let end;
  if (args.around !== undefined) {
    const span = args.span ?? 12;
    start = Math.max(0, args.around - span / 2);
    end = Math.min(duration, args.around + span / 2);
  } else if (args.scene) {
    if (!manifest) fail("--scene needs --manifest", 2);
    const scene = (manifest.scenes ?? []).find((s) => s.slug === args.scene);
    if (!scene) fail(`Scene not found in manifest: ${args.scene}`, 2);
    start = Math.max(0, scene.start - 4);
    end = Math.min(duration, scene.end + 4);
  } else {
    start = args.start ?? 0;
    end = args.end ?? duration;
  }
  if (end <= start) fail("--end must be greater than --start", 2);

  const { index } = loadAnalysis(file, { force: args.force ?? false });

  const markers = [
    ...parseMarkers(args.markers),
    ...(manifest ? manifestMarkers(manifest, { start, end }) : []),
  ].sort((a, b) => a.t - b.t);

  const windowSec = end - start;
  const mode = windowSec <= 90 ? "detail" : "overview";
  const outPath = args.out ?? join(
    ensureDir(join(process.cwd(), "qa", "frame-sheets")),
    `${basename(file, extname(file))}_timeline_${Math.round(start)}_${Math.round(end)}.png`
  );

  let result;
  try {
    result = renderSheet({
      file, start, end, out: outPath,
      width: args.width ?? 1920, index, markers, mode,
    });
  } catch (e) {
    fail(`timeline sheet failed: ${e.message}`, 1);
  }

  // Everything drawn is also here as numbers — decide on these, not pixels.
  const wordsIn = (index.words ?? []).filter((w) => w.end > start && w.start < end);
  const silenceRef = referenceSilences(index).map((s) => ({ ...s, end: s.end ?? duration }));
  // Timing is only meaningful for an unambiguous cut range: an explicit
  // --scene, or exactly one IN/OUT pair from the same scene (or unscoped
  // user markers). A window with five scenes' bounds gets no timing block.
  let cutRange = null;
  if (args.scene) {
    const scene = manifest.scenes.find((s) => s.slug === args.scene);
    cutRange = { start: scene.start, end: scene.end };
  } else {
    const ins = markers.filter((m) => m.kind === "in" || (!m.kind && /\bIN\b/i.test(m.label ?? "")));
    const outs = markers.filter((m) => m.kind === "out" || (!m.kind && /\bOUT\b/i.test(m.label ?? "")));
    if (ins.length <= 1 && outs.length <= 1 && (ins.length || outs.length) &&
        (ins[0]?.slug ?? outs[0]?.slug) === (outs[0]?.slug ?? ins[0]?.slug)) {
      cutRange = { start: ins[0]?.t ?? start, end: outs[0]?.t ?? end };
    }
  }
  const timing = index.words && cutRange ? cutTiming(index.words, silenceRef, cutRange) : null;

  output({
    ok: true,
    file,
    mode,
    window: { start: round3(start), end: round3(end) },
    sheet: result.sheet,
    ...(result.degraded ? { degraded: result.degraded } : {}),
    markers,
    ...(timing ? { timing } : {}),
    words: wordsIn.length,
    ...(result.crowded ? { crowdedWords: result.crowded } : {}),
    silences: silenceRef.filter((s) => s.end > start && s.start < end)
      .map((s) => ({ start: Math.max(round3(s.start), round3(start)), end: Math.min(round3(s.end), round3(end)) })),
    nonSpeech: (index.nonSpeech ?? []).filter((s) => s.end > start && s.start < end),
    sentencesIn: (index.sentences ?? []).filter((s) => s.end > start && s.start < end).length,
    hints: [
      "READ the sheet: red = silence, amber = audible-but-wordless (laugh/clap/music), orange lines = cut markers.",
      "Cut placement rides on `timing` numbers (lastWordEnd + tail), not on reading tick pixels.",
      "Word ticks right after a long pause are unreliable (whisper clumps them) — trust silence edges there.",
      mode === "overview"
        ? "Overview mode: green ticks are sentence ends. Zoom with --around <t> --span 12 before locking any cut."
        : "Detail mode: every word tick is drawn; crowded labels degrade to bare ticks.",
    ],
  });
}
