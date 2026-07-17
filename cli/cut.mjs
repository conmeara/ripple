import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadBeatGrid, ON_BEAT_TOLERANCE } from "./beats.mjs";
import { meanAbsDiff, parsePgm } from "./frame-sheet.mjs";
import {
  detectHdr, ensureDir, fail, ffprobeJson, findTool, output, parseArgs, requireTool, round3, run,
} from "./util.mjs";

// ---------- pure helpers (unit-tested) ----------

export function validateManifest(manifest, baseDir = ".") {
  const errors = [];
  if (manifest.version !== 1) errors.push("manifest version must be 1");
  const scenes = manifest.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) {
    errors.push("manifest needs a non-empty scenes array");
    return errors;
  }
  const slugs = new Set();
  for (const s of scenes) {
    const where = `scene ${s.slug ?? s.id ?? "?"}`;
    if (!s.slug) errors.push(`${where}: missing slug`);
    if (s.slug && slugs.has(s.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(s.slug);
    if (!s.source) errors.push(`${where}: missing source`);
    else if (!existsSync(resolve(baseDir, s.source))) errors.push(`${where}: source not found: ${s.source}`);
    if (typeof s.start !== "number" || typeof s.end !== "number" || s.end <= s.start) {
      errors.push(`${where}: start/end invalid (start=${s.start}, end=${s.end})`);
    }
    if (s.gainDb !== undefined && typeof s.gainDb !== "number") errors.push(`${where}: gainDb must be a number`);
    if (s.cardDuration !== undefined && !(typeof s.cardDuration === "number" && s.cardDuration > 0)) {
      errors.push(`${where}: cardDuration must be a positive number`);
    }
    if (s.jcut !== undefined) {
      if (!s.card) errors.push(`${where}: jcut requires a card`);
      if (typeof s.jcut !== "number" || s.jcut < 0) {
        errors.push(`${where}: jcut must be a non-negative number`);
      } else {
        if (s.jcut >= s.end - s.start) errors.push(`${where}: jcut longer than the scene`);
        const cardDur = typeof s.cardDuration === "number" ? s.cardDuration : 2.5;
        if (s.card && s.jcut > cardDur) errors.push(`${where}: jcut (${s.jcut}s) exceeds the card duration (${cardDur}s)`);
      }
    }
    const i = scenes.indexOf(s);
    if (s.lcut !== undefined) {
      const next = scenes[i + 1];
      if (typeof s.lcut !== "number" || s.lcut <= 0) errors.push(`${where}: lcut must be a positive number`);
      else {
        if (!next || !(next.card || next.cardFile)) errors.push(`${where}: lcut needs a following scene with a card (the tail plays under it)`);
        const ownJcut = s.card ? s.jcut ?? 0 : 0;
        if (s.lcut >= s.end - s.start - ownJcut) errors.push(`${where}: lcut longer than the scene body`);
        if (next && (next.card || next.cardFile)) {
          const nextCardDur = next.cardDuration ?? 2.5;
          const nextJcut = next.card ? next.jcut ?? 0 : 0;
          if (s.lcut + nextJcut > nextCardDur) errors.push(`${where}: lcut + next scene's jcut exceed the next card's duration`);
        }
      }
    }
    if (s.transition !== undefined) {
      const tr = s.transition;
      if (i === 0) errors.push(`${where}: transition needs a preceding scene`);
      if (!tr || typeof tr !== "object" || !["dissolve", "fadeblack"].includes(tr.type)) {
        errors.push(`${where}: transition.type must be "dissolve" or "fadeblack"`);
      } else if (!(tr.duration > 0)) {
        errors.push(`${where}: transition.duration must be > 0`);
      } else if (i > 0) {
        // xfade overlaps steal time from BOTH sides; audio acrossfade on a
        // too-short segment silently desyncs A/V — hard error, not warning.
        const prev = scenes[i - 1];
        const prevLastDur = prev.end - prev.start - (prev.card ? prev.jcut ?? 0 : 0) - (prev.lcut ?? 0);
        const hasCard = Boolean(s.card || s.cardFile);
        const firstDur = hasCard
          ? s.cardDuration ?? 2.5
          : s.end - s.start - (s.card ? s.jcut ?? 0 : 0) - (s.lcut ?? 0);
        if (tr.duration >= Math.min(prevLastDur, firstDur)) {
          errors.push(`${where}: transition.duration (${tr.duration}s) must be shorter than both adjacent segments (${round3(prevLastDur)}s / ${round3(firstDur)}s)`);
        }
        // Back-to-back transitions squeeze the segment between them: its
        // in-overlap plus the NEXT join's overlap must fit inside it.
        const next = scenes[i + 1];
        if (!hasCard && next?.transition?.duration > 0 && tr.duration + next.transition.duration >= firstDur) {
          errors.push(`${where}: transition in (${tr.duration}s) + next transition out (${next.transition.duration}s) consume the whole segment (${round3(firstDur)}s) — the scene never reaches full opacity`);
        }
        // An lcut tail entering this join would play its dialogue INSIDE the
        // acrossfade against the previous scene's own tail — two copies of
        // the same speech at once. Incoherent; reject.
        if (prev.lcut > 0) {
          errors.push(`${where}: transition cannot combine with the previous scene's lcut — the L-cut tail would play against itself inside the acrossfade. Drop one.`);
        }
      }
    }
  }
  const out = manifest.output;
  if (out) {
    if (out.fit !== undefined && !["pad", "crop"].includes(out.fit)) errors.push('output.fit must be "pad" or "crop"');
    if (out.crop !== undefined) {
      const c = out.crop;
      const okRect = c && typeof c === "object" &&
        ["x", "y", "w", "h"].every((k) => Number.isInteger(c[k]) && c[k] >= 0) && c.w > 0 && c.h > 0;
      if (!okRect) errors.push("output.crop must be {x, y, w, h} in non-negative integer source pixels (w/h > 0)");
    }
  }
  const music = manifest.music;
  if (music !== undefined) {
    if (!music || typeof music !== "object" || Array.isArray(music)) {
      errors.push("music must be an object");
    } else {
      if (!music.source) errors.push("music: missing source");
      else if (!existsSync(resolve(baseDir, music.source))) errors.push(`music: source not found: ${music.source}`);
      for (const key of ["gainDb", "fadeIn", "fadeOut", "loudnessTarget"]) {
        if (music[key] !== undefined && typeof music[key] !== "number") errors.push(`music: ${key} must be a number`);
      }
      if (music.fadeIn < 0 || music.fadeOut < 0) errors.push("music: fades must be >= 0");
    }
  }
  return errors;
}

// Assembly duration implied by the manifest: the last segment's end.
export function assemblyDuration(scenes) {
  const timeline = assemblyTimeline(scenes);
  return timeline.length ? timeline[timeline.length - 1].outEnd : 0;
}

// Silence the assembly legitimately opens with: scene 1's card plays silent
// audio for its duration minus any J-cut head. QA's leading-silence gate
// must not count intentional card quiet as a defect.
export function expectedLeadingSilence(scenes) {
  const first = scenes?.[0];
  if (!first || !(first.card || first.cardFile)) return 0;
  const cardDuration = first.cardDuration ?? 2.5;
  const jcut = first.card ? first.jcut ?? 0 : 0;
  return round3(Math.max(cardDuration - jcut, 0));
}

// THE timeline model: the ordered assembly segments with output times and
// (for bodies) the source mapping. timeline-sheet --at, captions, segmentBoundaries,
// assemblyDuration, and beatCheck all derive from this one function — output
// time must never be computed twice in two places.
//
// scene.lcut: this scene's picture leaves `lcut` seconds early while its
// audio trails under the FOLLOWING scene's card (mirror of jcut).
// scene.transition ({type, duration}): a dissolve entering this scene —
// xfade overlap, so the whole assembly shortens by `duration` at that join.
// Cards carry an ordered `audio` parts array (lcut tail / silence / jcut
// head) so captions and timeline-sheet --at can map card audio to its source.
export function assemblyTimeline(scenes) {
  const segments = [];
  let t = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const hasCard = Boolean(s.card || s.cardFile);
    const cardDuration = hasCard ? s.cardDuration ?? 2.5 : 0;
    const jcut = s.card ? s.jcut ?? 0 : 0;
    const lcut = s.lcut ?? 0;
    const prev = scenes[i - 1];
    const lcutIn = hasCard ? prev?.lcut ?? 0 : 0;
    const d = i > 0 && s.transition?.duration > 0 ? s.transition.duration : 0;
    if (d) t = round3(t - d); // the incoming segment starts under the previous one
    const transitionIn = d ? { type: s.transition.type, duration: d } : undefined;

    if (hasCard) {
      const audio = [];
      if (lcutIn > 0) {
        audio.push({
          kind: "lcut", source: prev.source,
          sourceStart: round3(prev.end - lcutIn), sourceEnd: prev.end,
          outStart: round3(t), outEnd: round3(t + lcutIn),
        });
      }
      const silDur = cardDuration - lcutIn - jcut;
      if (silDur > 0.001) {
        audio.push({ kind: "silence", outStart: round3(t + lcutIn), outEnd: round3(t + lcutIn + silDur) });
      }
      if (jcut > 0) {
        audio.push({
          kind: "jcut", source: s.source,
          sourceStart: s.start, sourceEnd: round3(s.start + jcut),
          outStart: round3(t + cardDuration - jcut), outEnd: round3(t + cardDuration),
        });
      }
      segments.push({
        kind: "card", slug: s.slug,
        outStart: round3(t), outEnd: round3(t + cardDuration),
        audio,
        ...(transitionIn ? { transitionIn } : {}),
      });
      t = round3(t + cardDuration);
    }

    const bodyDur = s.end - s.start - jcut - lcut;
    segments.push({
      kind: "body",
      slug: s.slug,
      source: s.source,
      outStart: round3(t),
      outEnd: round3(t + bodyDur),
      sourceStart: round3(s.start + jcut),
      sourceEnd: round3(s.end - lcut),
      ...(!hasCard && transitionIn ? { transitionIn } : {}),
    });
    t = round3(t + bodyDur);
  }
  return segments;
}

// Assembly-time visual boundaries (where the picture changes): every
// segment start except t=0. The lattice montage cuts snap to when a music
// bed sets the rhythm. A dissolved join's perceptual cut moment is the
// transition midpoint, not the overlap start.
export function segmentBoundaries(scenes) {
  return assemblyTimeline(scenes)
    .filter((seg) => seg.outStart > 0)
    .map((seg) =>
      seg.transitionIn
        ? {
            t: round3(seg.outStart + seg.transitionIn.duration / 2),
            label: `${seg.slug} ${seg.kind}`,
            transition: seg.transitionIn.type,
          }
        : { t: seg.outStart, label: `${seg.slug} ${seg.kind}` }
    );
}

// Per-scene dialogue gain (the fader): applied to the scene's audio in
// clips, segments, and the J-cut head alike, so qa's dialogue-loudness
// spread is fixable from the manifest.
export function sceneGain(scene) {
  return typeof scene.gainDb === "number" && scene.gainDb !== 0 ? `,volume=${scene.gainDb}dB` : "";
}

// A 30ms audio fade at each footage cut boundary — always-on (video-use's
// default) so a segment join can never pop. Baked into every clip/body
// segment file, so the pop is impossible by construction regardless of how the
// assembly later concats or acrossfades the segment (30ms inside a 0.5s
// acrossfade is inaudible — no need to make the per-segment render
// transition-aware). J-cut/L-cut joins are the exception: there the body audio
// is CONTINUOUS with its card's bridging audio (same take, contiguous source),
// so the touching side skips its fade to avoid dipping mid-phrase — the caller
// passes in:false / out:false there. anullsrc cards carry no footage, so they
// never call this. Clips shorter than 4×30ms clamp the fade to duration/4.
export const MICRO_FADE = 0.03;
export function microFadeChain(duration, { in: fadeIn = true, out: fadeOut = true, enabled = true } = {}) {
  if (!enabled) return "";
  const d = round3(Math.min(MICRO_FADE, duration / 4));
  if (!(d > 0)) return "";
  return (fadeIn ? `,afade=t=in:d=${d}` : "") +
    (fadeOut ? `,afade=t=out:st=${round3(duration - d)}:d=${d}` : "");
}

// A direct join (no card between scenes) from the same locked-off setup
// produces a JUMP CUT when the frames mostly match but visibly mismatch —
// the uncanny band between "continuous" (invisible splice) and "clean
// change" (reads as a deliberate cut). Score = mean abs luma diff of the
// join's two frames at thumbnail scale.
export function jumpCutReading(score, { min = 3, max = 18 } = {}) {
  if (score < min) return "continuous";
  if (score <= max) return "jump-cut risk";
  return "clean change";
}

// Registry-tagged advisory finding (rules.mjs: "jump-cut") for a scored
// direct join; null when the score reads continuous or as a clean change.
// Warn severity — cut never blocks a render ffmpeg completed; lint and qa
// hold the block-level gates.
export function jumpCutFinding(a, b, score) {
  if (jumpCutReading(score) !== "jump-cut risk") return null;
  return {
    rule: "jump-cut",
    join: `${a.slug}→${b.slug}`,
    score,
    detail: `possible jump cut at ${a.slug}→${b.slug} (frame diff ${score}: same setup, visible mismatch) — a card, cutaway, or bigger reframe hides it`,
  };
}

// Registry-tagged advisory finding (rules.mjs: "off-beat") when a beat check
// found boundaries off the music grid; null when on-grid or unchecked.
export function offBeatFinding(beatCheck) {
  if (!beatCheck?.offGrid) return null;
  return {
    rule: "off-beat",
    offGrid: beatCheck.offGrid,
    detail: `${beatCheck.offGrid} visual boundar${beatCheck.offGrid === 1 ? "y lands" : "ies land"} off the music grid (±${ON_BEAT_TOLERANCE}s) — see music.beatCheck.boundaries; on-beat is a style choice, knowing you're off is perception`,
  };
}

// Direct joins to score: adjacent scene pairs where the incoming scene has
// no card and no transition — a card between scenes hides any mismatch, and
// a dissolve/fadeblack bridge means the two frames never sit adjacent.
export function directJoins(scenes) {
  const joins = [];
  for (let i = 0; i + 1 < scenes.length; i++) {
    const next = scenes[i + 1];
    if (!(next.card || next.cardFile) && !next.transition) joins.push([scenes[i], next]);
  }
  return joins;
}

// Music-bed filtergraph, appended after buildConcatFilter's `[v][a]`.
// Bed: format → gain → fades; dialogue splits to feed the sidechain; the bed
// ducks under speech; the mix (optionally loudness-normalized) lands on [amix].
export function buildMusicFilter(music, { inputIndex, total }) {
  const gain = music.gainDb ?? -18;
  const duck = music.duck ?? {};
  const threshold = duck.threshold ?? 0.03;
  const ratio = duck.ratio ?? 8;
  const fadeIn = music.fadeIn ?? 1.0;
  const fadeOut = music.fadeOut ?? 2.0;
  const fades =
    (fadeIn > 0 ? `,afade=t=in:d=${round3(fadeIn)}` : "") +
    (fadeOut > 0 && total > fadeOut ? `,afade=t=out:st=${round3(total - fadeOut)}:d=${round3(fadeOut)}` : "");
  const loudnorm = music.loudnessTarget !== undefined ? `,loudnorm=I=${music.loudnessTarget}:TP=-1.5:LRA=11` : "";
  return (
    `[${inputIndex}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${gain}dB${fades}[bed];` +
    `[a]asplit=2[dlg][sc];` +
    `[bed][sc]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=20:release=400[ducked];` +
    `[dlg][ducked]amix=inputs=2:duration=first:normalize=0${loudnorm}[amix]`
  );
}

export function buildEncodeArgs({ profile, color, encoders }) {
  const audio = ["-c:a", "aac", "-b:a", profile === "draft" ? "128k" : "160k", "-ar", "48000", "-ac", "2"];
  if (color.mode === "hdr" && encoders.hevc_videotoolbox) {
    return {
      video: [
        "-c:v", "hevc_videotoolbox", "-profile:v", "main10", "-pix_fmt", "p010le", "-tag:v", "hvc1",
        "-color_primaries", "bt2020", "-color_trc", color.transfer, "-colorspace", "bt2020nc",
        "-b:v", profile === "draft" ? "6000k" : "18000k",
      ],
      audio,
      pixFmt: "p010le",
      warning: null,
    };
  }
  if (color.mode === "hdr" && encoders.libx265) {
    return {
      video: [
        "-c:v", "libx265", "-profile:v", "main10", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1",
        "-color_primaries", "bt2020", "-color_trc", color.transfer, "-colorspace", "bt2020nc",
        "-crf", profile === "draft" ? "30" : "20", "-preset", profile === "draft" ? "ultrafast" : "medium",
      ],
      audio,
      pixFmt: "yuv420p10le",
      warning: "hevc_videotoolbox unavailable — using libx265 (slow)",
    };
  }
  const args = {
    video: [
      "-c:v", "libx264", "-crf", profile === "draft" ? "28" : "18",
      "-preset", profile === "draft" ? "veryfast" : "medium", "-pix_fmt", "yuv420p",
    ],
    audio,
    pixFmt: "yuv420p",
    warning: color.mode === "hdr" ? "no 10-bit HEVC encoder found — output is an SDR-tagged approximation; do NOT ship this as final" : null,
  };
  return args;
}

export function setparamsFilter(color) {
  if (color.mode !== "hdr") return "";
  return `,setparams=range=tv:color_primaries=bt2020:color_trc=${color.transfer}:colorspace=bt2020nc`;
}

// Geometry chain: pad (letterbox, the default) or crop (reframe — scale to
// cover, then center-crop), with an optional source-pixel crop rect applied
// FIRST (the model states the reframe once; verified crop-before-scale).
export function geometryChain({ width, height, fit = "pad", cropRect = null }) {
  if (!width || !height) return "";
  const pre = cropRect ? `crop=${cropRect.w}:${cropRect.h}:${cropRect.x}:${cropRect.y},` : "";
  if (fit === "crop") {
    return `,${pre}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  }
  return `,${pre}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
}

export function buildSceneVf({ color, gradeFilter, width, height, fps, pixFmt, fit, cropRect }) {
  const grade = gradeFilter ? `,${gradeFilter}` : "";
  const size = geometryChain({ width, height, fit, cropRect });
  return `setpts=PTS-STARTPTS${size},fps=${fps}${grade},format=${pixFmt}${setparamsFilter(color)}`;
}

export function buildConcatFilter(n, { width, height, fps, pixFmt, color, fit, cropRect }) {
  const parts = [];
  const size = geometryChain({ width, height, fit, cropRect }); // leading comma or ""
  for (let i = 0; i < n; i++) {
    parts.push(
      `[${i}:v]setpts=PTS-STARTPTS,fps=${fps}${size},format=${pixFmt}${setparamsFilter(color)}[v${i}]`,
      `[${i}:a]asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${i}]`
    );
  }
  const pads = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${pads}concat=n=${n}:v=1:a=1[v][a]`);
  return parts.join(";");
}

const XFADE_TYPE = { dissolve: "fade", fadeblack: "fadeblack" };

// Assembly filter when any join carries a transition: pairwise fold —
// hard joins concat (re-stamped with fps: concat's output timebase mis-stamps
// the final frame's duration otherwise, verified), transitioned joins
// xfade + acrossfade. ffmpeg 8's xfade silently upconverts to yuv444p, so
// the chain runs planar and the terminal format=pixFmt restores the
// delivery format (otherwise players reject a High 4:4:4 encode).
// segMeta: [{duration, transitionIn?}] aligned with the -i input order.
export function buildAssemblyFilter(segMeta, { width, height, fps, pixFmt, color, fit, cropRect }) {
  if (!segMeta.some((m) => m.transitionIn)) {
    return buildConcatFilter(segMeta.length, { width, height, fps, pixFmt, color, fit, cropRect });
  }
  const planar = pixFmt === "p010le" ? "yuv420p10le" : pixFmt;
  const size = geometryChain({ width, height, fit, cropRect });
  const parts = [];
  for (let i = 0; i < segMeta.length; i++) {
    parts.push(
      `[${i}:v]setpts=PTS-STARTPTS,fps=${fps}${size},format=${planar}[v${i}]`,
      `[${i}:a]asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${i}]`
    );
  }
  let vAcc = "v0";
  let aAcc = "a0";
  let cum = segMeta[0].duration;
  for (let i = 1; i < segMeta.length; i++) {
    const m = segMeta[i];
    if (m.transitionIn) {
      const d = m.transitionIn.duration;
      const type = XFADE_TYPE[m.transitionIn.type] ?? "fade";
      parts.push(
        `[${vAcc}][v${i}]xfade=transition=${type}:duration=${round3(d)}:offset=${round3(cum - d)}[vx${i}]`,
        `[${aAcc}][a${i}]acrossfade=d=${round3(d)}[ax${i}]`
      );
      vAcc = `vx${i}`;
      aAcc = `ax${i}`;
      cum = round3(cum + m.duration - d);
    } else {
      parts.push(
        `[${vAcc}][${aAcc}][v${i}][a${i}]concat=n=2:v=1:a=1[vc${i}][ac${i}]`,
        `[vc${i}]fps=${fps}[vcf${i}]`
      );
      vAcc = `vcf${i}`;
      aAcc = `ac${i}`;
      cum = round3(cum + m.duration);
    }
  }
  parts.push(`[${vAcc}]format=${pixFmt}${setparamsFilter(color)}[v]`, `[${aAcc}]anull[a]`);
  return parts.join(";");
}

export function clipName(scene) {
  return `${String(scene.id ?? 0).padStart(2, "0")}_${scene.slug}.mp4`;
}

// ---------- impl ----------

let encoderCache = null;
function detectEncoders(ffmpeg) {
  if (encoderCache) return encoderCache;
  const res = run(ffmpeg, ["-hide_banner", "-encoders"]);
  encoderCache = {
    hevc_videotoolbox: /hevc_videotoolbox/.test(res.stdout),
    libx265: /libx265/.test(res.stdout),
    libx264: /libx264/.test(res.stdout),
  };
  return encoderCache;
}

function ffmpegOrFail(args, what) {
  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const res = run(ffmpeg, ["-hide_banner", "-v", "error", "-y", ...args]);
  if (res.status !== 0) fail(`${what} failed: ${res.stderr.trim().slice(0, 1200)}`, 1);
}

// ImageMagick caption rendering fails without an explicit font on many
// systems (the groom-session trap, again). Resolve a real font file first.
const FONT_CANDIDATES = [
  "/System/Library/Fonts/Helvetica.ttc",
  "/System/Library/Fonts/HelveticaNeue.ttc",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

export function resolveCardFont(candidates = FONT_CANDIDATES) {
  return candidates.find((f) => existsSync(f)) ?? null;
}

function renderCardPng(text, { width, height, out }) {
  const magick = findTool(["magick", "convert"]);
  if (!magick) {
    fail(
      "Title cards need ImageMagick (brew install imagemagick) since this ffmpeg lacks drawtext. " +
        "Alternatively render cards via HyperFrames/Remotion and set scene.cardFile.",
      2
    );
  }
  const font = resolveCardFont();
  if (!font) {
    fail(
      "No usable font found for title cards. Set scene.cardFile to a pre-rendered image, or install " +
        "a standard font (e.g. DejaVu Sans).",
      2
    );
  }
  const pointsize = Math.round(height / 12);
  const res = run(magick, [
    "-size", `${width}x${height}`, "-background", "#111418", "-fill", "#e8e6e0",
    "-font", font, "-gravity", "center", "-pointsize", String(pointsize),
    `caption:${text}`, out,
  ]);
  if (res.status !== 0) fail(`card PNG failed: ${res.stderr.trim()}`, 1);
}

const OUTPUT_PRESETS = {
  vertical: { width: 1080, height: 1920, fit: "crop" },
  square: { width: 1080, height: 1080, fit: "crop" },
};

export async function main(argv) {
  const args = parseArgs(argv, {
    profile: "string", scene: "string", out: "string", preset: "string",
    "clips-dir": "string", "no-clips": "boolean", "no-full": "boolean",
  });
  if (args.preset && !OUTPUT_PRESETS[args.preset]) {
    fail(`--preset must be one of: ${Object.keys(OUTPUT_PRESETS).join(", ")}`, 2);
  }
  const manifestPath = args._[0] ?? "edit.json";
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}. Run /ripple plan first.`, 2);
  const baseDir = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const errors = validateManifest(manifest, baseDir);
  if (errors.length) fail(`Manifest invalid:\n- ${errors.join("\n- ")}`, 2);

  // Autosave: every render's manifest is recoverable (deduped by hash) —
  // experimentation must be free.
  let snapshotPath = null;
  try {
    const { saveSnapshot } = await import("./history.mjs");
    snapshotPath = saveSnapshot(manifest, {
      label: "auto-cut",
      dir: join(baseDir, ".ripple", "history"),
    }).path;
  } catch { /* history is a convenience, never a render blocker */ }

  const profile = args.profile ?? "draft";
  if (!["draft", "final"].includes(profile)) fail("--profile must be draft or final", 2);

  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const encoders = detectEncoders(ffmpeg);

  // Color pipeline from manifest.color.source or a probe of the first source.
  const firstSource = resolve(baseDir, manifest.scenes[0].source);
  const probed = detectHdr((ffprobeJson(firstSource).streams ?? []).find((s) => s.codec_type === "video"));
  const sourceColor = manifest.color?.source ?? probed;
  const policy = manifest.color?.policy ?? (probed.hdr ? "preserve" : "sdr");
  const isHdr = policy === "preserve" && (sourceColor.color_primaries === "bt2020" || probed.hdr);
  const color = { mode: isHdr ? "hdr" : "sdr", transfer: sourceColor.color_transfer ?? "arib-std-b67" };

  // Output geometry. --preset overrides the manifest (a vertical delivery
  // of the same cut); fit "crop" reframes instead of letterboxing, with an
  // optional source-pixel crop rect the model states once.
  const srcVideo = (ffprobeJson(firstSource).streams ?? []).find((s) => s.codec_type === "video");
  const preset = args.preset ? OUTPUT_PRESETS[args.preset] : null;
  let width = preset?.width ?? manifest.output?.width ?? Math.min(srcVideo?.width ?? 1920, 1920);
  let height = preset?.height ?? manifest.output?.height ?? Math.round((width * (srcVideo?.height ?? 1080)) / (srcVideo?.width ?? 1920));
  const fit = preset?.fit ?? manifest.output?.fit ?? "pad";
  const cropRect = manifest.output?.crop ?? null;
  const fps = manifest.output?.fps ?? srcVideo?.avg_frame_rate ?? "30";
  if (profile === "draft") {
    width = Math.round(width / 4) * 2;
    height = Math.round(height / 4) * 2;
  }

  const enc = buildEncodeArgs({ profile, color, encoders });
  const gradeFilter = color.mode === "sdr" ? manifest.grade?.filter ?? null : null;
  const gradeSkipped = color.mode === "hdr" && manifest.grade?.filter
    ? "grade filter skipped: SDR grade presets on HDR footage would break color — grade HDR explicitly or deliver SDR"
    : null;

  // 30ms audio fades at every footage cut boundary, on by default; the manifest
  // opts out globally with audioMicroFades: false (rare — you'd need pops).
  const microFades = manifest.audioMicroFades !== false;

  const sceneFilter = args.scene ? new Set(args.scene.split(",").map((s) => s.trim())) : null;
  const scenes = manifest.scenes.filter((s) => !sceneFilter || sceneFilter.has(s.slug));
  if (!scenes.length) fail(`--scene matched nothing (${args.scene})`, 2);

  // A preset delivery gets its own intermediate dirs — reframed clips and
  // cards must never overwrite the primary render's.
  const dirSuffix = args.preset ? `_${args.preset}` : "";
  const clipsDir = ensureDir(resolve(baseDir, (args["clips-dir"] ?? "clips") + dirSuffix));
  const segmentsDir = ensureDir(join(baseDir, "work", `segments${dirSuffix}`));
  const cardsDir = ensureDir(join(baseDir, "work", `cards${dirSuffix}`));
  const outputsDir = ensureDir(join(baseDir, "outputs"));

  const rendered = { clips: [], segments: [], warnings: [enc.warning, gradeSkipped].filter(Boolean), findings: [] };
  // Aligned with rendered.segments: what buildAssemblyFilter needs to fold
  // transitioned joins (exact -t durations + the incoming transition).
  const segMeta = [];

  const geo = { color, gradeFilter, width, height, fps, pixFmt: enc.pixFmt, fit, cropRect };

  for (const scene of scenes) {
    const src = resolve(baseDir, scene.source);
    const duration = round3(scene.end - scene.start);
    const lcut = scene.lcut ?? 0;
    const mi = manifest.scenes.indexOf(scene);
    const prevScene = manifest.scenes[mi - 1];
    const lcutIn = scene.card || scene.cardFile ? prevScene?.lcut ?? 0 : 0;
    const transitionIn = mi > 0 && scene.transition ? scene.transition : null;

    // 1. Clean per-scene clip (user-facing, full bounds, no card).
    if (!args["no-clips"]) {
      const clipPath = join(clipsDir, clipName(scene));
      ffmpegOrFail(
        [
          "-ss", String(scene.start), "-t", String(duration), "-i", src,
          "-map", "0:v:0", "-map", "0:a:0",
          "-vf", buildSceneVf(geo),
          "-af", `asetpts=PTS-STARTPTS,aresample=48000${sceneGain(scene)}${microFadeChain(duration, { enabled: microFades })}`,
          ...enc.video, ...enc.audio, "-movflags", "+faststart", clipPath,
        ],
        `clip ${scene.slug}`
      );
      rendered.clips.push(clipPath);
    }

    // 2. Assembly segments: optional card (with J-cut audio) + body.
    const jcut = scene.card ? scene.jcut ?? 0 : 0;
    if (scene.card || scene.cardFile) {
      const cardDuration = scene.cardDuration ?? 2.5;
      if (jcut > cardDuration) fail(`scene ${scene.slug}: jcut (${jcut}s) exceeds card duration (${cardDuration}s)`, 2);
      const png = scene.cardFile
        ? resolve(baseDir, scene.cardFile)
        : join(cardsDir, `${scene.slug}.png`);
      if (!scene.cardFile) renderCardPng(scene.card, { width, height, out: png });

      const cardPath = join(segmentsDir, `${clipName(scene).replace(".mp4", "")}_card.mp4`);
      const fadeD = Math.min(0.4, cardDuration / 4);
      // Cards go through the same fit chain as footage — a pre-rendered
      // 16:9 cardFile must letterbox/reframe under --preset, never stretch.
      const cardSize = geometryChain({ width, height, fit }).slice(1);
      const cardVf = `fps=${fps},${cardSize},fade=t=in:d=${fadeD},fade=t=out:st=${round3(cardDuration - fadeD)}:d=${fadeD},format=${enc.pixFmt}${setparamsFilter(color)}`;
      // -framerate before -loop is mandatory: the PNG loop defaults to 25fps
      // and fps=${fps} then stretches the video ~33ms past the audio per card
      // (verified) — transitions' offset math needs exact durations.
      const AFMT = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
      if (lcutIn > 0 || jcut > 0) {
        // Card audio = [previous scene's trailing lcut] + silence + [this
        // scene's jcut head] — each part gain-attributed to its own scene.
        const inputs = ["-framerate", String(fps), "-loop", "1", "-t", String(cardDuration), "-i", png];
        const branches = [];
        const labels = [];
        let inIdx = 1;
        if (lcutIn > 0) {
          inputs.push("-ss", String(round3(prevScene.end - lcutIn)), "-t", String(lcutIn), "-i", resolve(baseDir, prevScene.source));
          branches.push(`[${inIdx}:a]asetpts=PTS-STARTPTS,aresample=48000${sceneGain(prevScene)},${AFMT}[la]`);
          labels.push("[la]");
          inIdx++;
        }
        const silDur = round3(cardDuration - lcutIn - jcut);
        if (silDur > 0.001) {
          branches.push(`aevalsrc=0:d=${silDur}:s=48000,${AFMT}[sil]`);
          labels.push("[sil]");
        }
        if (jcut > 0) {
          inputs.push("-ss", String(scene.start), "-t", String(jcut), "-i", src);
          branches.push(`[${inIdx}:a]asetpts=PTS-STARTPTS,aresample=48000${sceneGain(scene)},${AFMT}[ja]`);
          labels.push("[ja]");
        }
        ffmpegOrFail(
          [
            ...inputs,
            "-filter_complex",
            `[0:v]${cardVf}[v];` +
              branches.join(";") + ";" +
              `${labels.join("")}concat=n=${labels.length}:v=0:a=1,${AFMT}[a]`,
            "-map", "[v]", "-map", "[a]",
            ...enc.video, ...enc.audio, "-movflags", "+faststart", cardPath,
          ],
          `card ${scene.slug}`
        );
      } else {
        ffmpegOrFail(
          [
            "-framerate", String(fps), "-loop", "1", "-t", String(cardDuration), "-i", png,
            "-f", "lavfi", "-t", String(cardDuration), "-i", "anullsrc=r=48000:cl=stereo",
            "-vf", cardVf, "-map", "0:v", "-map", "1:a",
            ...enc.video, ...enc.audio, "-movflags", "+faststart", cardPath,
          ],
          `card ${scene.slug}`
        );
      }
      rendered.segments.push(cardPath);
      segMeta.push({ duration: cardDuration, ...(transitionIn ? { transitionIn } : {}) });
      if (transitionIn) {
        rendered.warnings.push(
          `transition into card "${scene.slug}" overlaps its built-in fade-in — expect a doubled fade; ` +
            (cardDuration - transitionIn.duration < 0.5 ? "the card is fully visible under 0.5s" : "acceptable if intentional")
        );
      }
    }

    // Body segment: trimmed by the J-cut head (already under this card) and
    // the L-cut tail (audio continues under the NEXT card, picture leaves
    // early). The clean per-scene clip keeps FULL bounds — only segments
    // trim, so the bed/L-cut can change without touching a single clip.
    const bodyDur = round3(duration - jcut - lcut);
    const bodyTransition = !(scene.card || scene.cardFile) && transitionIn ? { transitionIn } : {};
    if (jcut > 0 || lcut > 0 || args["no-clips"]) {
      const bodyPath = join(
        segmentsDir,
        jcut > 0 || lcut > 0 ? `${clipName(scene).replace(".mp4", "")}_body.mp4` : clipName(scene)
      );
      ffmpegOrFail(
        [
          "-ss", String(round3(scene.start + jcut)), "-t", String(bodyDur), "-i", src,
          "-map", "0:v:0", "-map", "0:a:0",
          "-vf", buildSceneVf(geo),
          // jcut>0: head continues the card's J-cut audio (same take) — no fade
          // in. lcut>0: tail continues under the NEXT card's L-cut audio — no
          // fade out. Fading either would dip mid-phrase.
          "-af", `asetpts=PTS-STARTPTS,aresample=48000${sceneGain(scene)}${microFadeChain(bodyDur, { in: jcut === 0, out: lcut === 0, enabled: microFades })}`,
          ...enc.video, ...enc.audio, "-movflags", "+faststart", bodyPath,
        ],
        `body ${scene.slug}`
      );
      rendered.segments.push(bodyPath);
    } else {
      rendered.segments.push(join(clipsDir, clipName(scene)));
    }
    segMeta.push({ duration: bodyDur, ...bodyTransition });
  }

  // Jump-cut advisory on direct joins (no card between): compare the two
  // frames that will sit next to each other in the assembly.
  if (!sceneFilter) {
    const tmpJoin = join(segmentsDir, `.join-${process.pid}`);
    ensureDir(tmpJoin);
    try {
      for (const [a, b] of directJoins(manifest.scenes)) {
        const frames = [];
        const specs = [
          [resolve(baseDir, a.source), Math.max(a.end - 0.05, a.start), "a.pgm"],
          [resolve(baseDir, b.source), b.start + 0.05, "b.pgm"],
        ];
        for (const [srcFile, t, name] of specs) {
          const p = join(tmpJoin, name);
          rmSync(p, { force: true }); // a stale frame from the previous join must never score this one
          const res = run(ffmpeg, [
            "-hide_banner", "-v", "error", "-y", "-ss", String(round3(t)), "-i", srcFile,
            "-frames:v", "1", "-vf", "scale=32:18,format=gray", p,
          ]);
          if (res.status === 0 && existsSync(p)) frames.push(parsePgm(readFileSync(p)).pixels);
        }
        if (frames.length === 2) {
          const finding = jumpCutFinding(a, b, round3(meanAbsDiff(frames[0], frames[1])));
          if (finding) {
            rendered.warnings.push(finding.detail);
            rendered.findings.push(finding);
          }
        }
      }
    } finally {
      rmSync(tmpJoin, { recursive: true, force: true });
    }
  }

  // 3. Full assembly: decode every segment, concat once, single clean encode.
  // The music bed (manifest.music) exists only here — clips and segments stay
  // clean so the bed can change without touching a single cut.
  const music = manifest.music ?? null;
  let finalPath = null;
  if (!args["no-full"] && !sceneFilter) {
    const slug = (manifest.title ?? "final").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    // A preset delivery never clobbers the primary render.
    const presetSuffix = args.preset ? `_${args.preset}` : "";
    finalPath = args.out ?? join(outputsDir, `${slug}${presetSuffix}_${profile}.mp4`);
    const inputs = rendered.segments.flatMap((s) => ["-i", s]);
    let filter = buildAssemblyFilter(segMeta, { width, height, fps, pixFmt: enc.pixFmt, color, fit, cropRect });
    let audioLabel = "[a]";
    if (music) {
      const musicPath = resolve(baseDir, music.source);
      const total = assemblyDuration(manifest.scenes);
      const bedDuration = Number(ffprobeJson(musicPath).format?.duration ?? 0);
      if (bedDuration && bedDuration + 0.05 < total) {
        rendered.warnings.push(
          `music bed is ${round3(bedDuration)}s but the assembly is ~${total}s — the bed ends early; regenerate at length`
        );
      }
      inputs.push("-i", musicPath);
      filter += ";" + buildMusicFilter(music, { inputIndex: rendered.segments.length, total });
      audioLabel = "[amix]";
    }
    ffmpegOrFail(
      [
        ...inputs,
        "-filter_complex", filter,
        "-map", "[v]", "-map", audioLabel,
        ...enc.video, ...enc.audio, "-movflags", "+faststart", finalPath,
      ],
      "assembly"
    );
  } else if (music) {
    rendered.warnings.push("music bed applies to the full assembly only — this scene-subset render has no bed");
  }

  // On-beat report: when a bed sets the rhythm, say where each visual
  // boundary lands relative to its grid. Advisory — cutting on the beat is
  // a style choice; knowing you're 140ms off is perception.
  let beatCheck;
  if (music && finalPath) {
    // Advisory only — a beat-analysis hiccup must never fail a cut whose
    // render already succeeded.
    try {
      const { record } = loadBeatGrid(resolve(baseDir, music.source), {
        outDir: join(baseDir, "work", "analysis"),
      });
      if (record.bpm !== null && record.beats.length) {
        const boundaries = segmentBoundaries(manifest.scenes).map((b) => {
          const nearest = record.beats.reduce(
            (best, bt) => (Math.abs(bt - b.t) < Math.abs(best - b.t) ? bt : best),
            record.beats[0]
          );
          return { ...b, beatOffset: round3(b.t - nearest) };
        });
        beatCheck = {
          rule: "off-beat",
          bpm: record.bpm,
          confidence: record.confidence,
          offGrid: boundaries.filter((b) => Math.abs(b.beatOffset) > ON_BEAT_TOLERANCE).length,
          boundaries,
        };
        const offBeat = offBeatFinding(beatCheck);
        if (offBeat) rendered.findings.push(offBeat);
      }
    } catch (e) {
      rendered.warnings.push(`beat check skipped: ${e.message}`);
    }
  }

  output({
    ok: true,
    profile,
    color: { policy, mode: color.mode, transfer: color.mode === "hdr" ? color.transfer : null },
    geometry: { width, height, fps },
    audioMicroFades: microFades ? MICRO_FADE : false,
    scenes: scenes.map((s) => s.slug),
    clips: rendered.clips,
    segments: args["no-full"] || sceneFilter ? rendered.segments : undefined,
    final: finalPath,
    music: music ? { source: music.source, applied: Boolean(finalPath), ...(beatCheck ? { beatCheck } : {}) } : undefined,
    ...(snapshotPath ? { snapshot: snapshotPath } : {}),
    ...(rendered.findings.length ? { findings: rendered.findings } : {}),
    warnings: rendered.warnings,
    hint: "next: ripple qa <output>",
    next: finalPath
      ? `Run: ripple qa ${finalPath} --manifest ${manifestPath}  — then READ a frame sheet of it.`
      : "Scene subset rendered. Re-run without --scene/--no-full to assemble, then qa the result.",
  });
}
