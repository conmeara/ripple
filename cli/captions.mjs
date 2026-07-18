import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { loadAnalysis } from "./analyze.mjs";
import { assemblyTimeline } from "./cut.mjs";
import { realWords } from "./timing.mjs";
import { ensureDir, fail, ffprobeJson, findTool, output, parseArgs, round3, run, writeJsonAtomic } from "./util.mjs";
import { writeFileSync } from "node:fs";

// Captions from the perception index's word timings, mapped through the
// manifest to OUTPUT time. Two presets: "subtitle" (Netflix/BBC readability
// numbers) and "social" (few words at a time, karaoke word highlight).
// Sidecars (.srt + .ass) are always written; burn-in needs an ffmpeg built
// with libass (probed — homebrew's usually isn't; set RIPPLE_FFMPEG to a
// libass build to burn).

// ---------- pure helpers (unit-tested) ----------

// Map source-time words onto the output timeline: body segments plus the
// audible card audio parts (J-cut heads, L-cut tails). A word maps by its
// MIDPOINT — exactly one part claims it, so straddlers never double-caption.
// Words outside every audible span are dropped (and counted): a caption for
// a cut moment is worse than none. Suspect words (whisper fabrications over
// silence/music) are excluded up front — a word nobody spoke must never
// render as a caption — and counted separately so `dropped` keeps meaning
// "real words outside the cut".
export function mapWordsToOutput(timeline, allWordsBySource) {
  let suspects = 0;
  const wordsBySource = {};
  for (const [source, words] of Object.entries(allWordsBySource)) {
    wordsBySource[source] = realWords(words);
    suspects += words.length - wordsBySource[source].length;
  }
  const parts = [];
  for (const seg of timeline) {
    if (seg.kind === "body") {
      parts.push({ source: seg.source, sourceStart: seg.sourceStart, sourceEnd: seg.sourceEnd, outStart: seg.outStart });
    } else {
      for (const a of seg.audio ?? []) {
        if (a.kind === "jcut" || a.kind === "lcut") {
          parts.push({ source: a.source, sourceStart: a.sourceStart, sourceEnd: a.sourceEnd, outStart: a.outStart });
        }
      }
    }
  }
  const out = [];
  const usedPerSource = {};
  parts.forEach((p, pi) => {
    for (const word of wordsBySource[p.source] ?? []) {
      const mid = (word.start + word.end) / 2;
      if (mid < p.sourceStart || mid >= p.sourceEnd) continue;
      out.push({
        start: round3(p.outStart + (Math.max(word.start, p.sourceStart) - p.sourceStart)),
        end: round3(p.outStart + (Math.min(word.end, p.sourceEnd) - p.sourceStart)),
        text: word.text,
        segIndex: pi,
      });
      usedPerSource[p.source] = (usedPerSource[p.source] ?? 0) + 1;
    }
  });
  let dropped = 0;
  for (const [source, words] of Object.entries(wordsBySource)) {
    dropped += Math.max(words.length - (usedPerSource[source] ?? 0), 0);
  }
  return { words: out.sort((a, b) => a.start - b.start), dropped, suspects };
}

const SENTENCE_END = /[.?!…]["')\]]?$/;
const CLAUSE_END = /[,;:—–]["')\]]?$/;
const CONNECTIVE = /^(and|but|or|so|that|with|of|to|in|on|for|at|by|as|because|which|who|when|where)$/i;

export const PRESETS = {
  subtitle: {
    maxChunkChars: 84, maxLineChars: 42, maxCps: 17,
    minDur: 0.833, maxDur: 6.0, maxSilence: 1.0, tailPad: 0.3, minGap: 0.083,
    uppercase: false,
  },
  social: {
    wordsPerCaption: 3, maxChunkChars: 18, gapBreak: 0.6, maxSilence: 1.0,
    tailPad: 0.2, uppercase: true,
  },
};

const joinText = (words) => words.map((w) => w.text).join(" ");

// Break a subtitle-style word run at the highest-priority point: sentence
// end > clause punctuation > before a connective > last fit.
function bestBreak(words) {
  for (let i = words.length - 2; i >= 0; i--) if (SENTENCE_END.test(words[i].text)) return i + 1;
  for (let i = words.length - 2; i >= 0; i--) if (CLAUSE_END.test(words[i].text)) return i + 1;
  for (let i = words.length - 1; i > 0; i--) if (CONNECTIVE.test(words[i].text)) return i;
  return words.length - 1;
}

// Two lines wrapped at the best priority point near the midpoint —
// bottom-heavy preferred (a penalty, not a hard constraint: sometimes only a
// top-heavy split keeps both lines under the cap).
export function wrapLines(words, maxLineChars) {
  const text = joinText(words);
  if (text.length <= maxLineChars) return [text];
  let best = null;
  let chars = 0;
  for (let i = 0; i < words.length - 1; i++) {
    chars += words[i].text.length + (i ? 1 : 0);
    const l2 = text.length - chars - 1;
    if (chars > maxLineChars || l2 > maxLineChars) continue;
    const prio = SENTENCE_END.test(words[i].text) ? 3 : CLAUSE_END.test(words[i].text) ? 2 : CONNECTIVE.test(words[i + 1].text) ? 1 : 0;
    const score = prio * 1000 - Math.abs(chars - text.length / 2) - (chars > l2 ? 50 : 0);
    if (!best || score > best.score) best = { i, score };
  }
  const at = (best?.i ?? Math.floor(words.length / 2) - 1) + 1;
  return [joinText(words.slice(0, at)), joinText(words.slice(at))];
}

// Group output-time words into caption chunks per the preset.
export function chunkCaptions(words, style = "subtitle", overrides = {}) {
  const p = { ...PRESETS[style], ...overrides };
  if (!PRESETS[style]) throw new Error(`unknown caption style: ${style}`);
  const chunks = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    chunks.push({ words: current });
    current = [];
  };
  for (const w of words) {
    const prev = current[current.length - 1];
    if (prev) {
      const gap = w.start - prev.end;
      const styleBreak = style === "social"
        ? current.length >= p.wordsPerCaption || gap > p.gapBreak ||
          joinText([...current, w]).length > p.maxChunkChars || SENTENCE_END.test(prev.text)
        : gap > p.maxSilence || prev.segIndex !== w.segIndex ||
          SENTENCE_END.test(prev.text) ||
          w.end - current[0].start > p.maxDur;
      if (styleBreak || (style === "subtitle" && joinText([...current, w]).length > p.maxChunkChars)) {
        if (style === "subtitle" && joinText([...current, w]).length > p.maxChunkChars &&
            !SENTENCE_END.test(prev.text) && w.start - prev.end <= p.maxSilence && prev.segIndex === w.segIndex) {
          // Over the char cap mid-sentence: break at the best point instead
          // of the last word.
          const at = bestBreak(current);
          if (at > 0 && at < current.length) {
            chunks.push({ words: current.slice(0, at) });
            current = current.slice(at);
          } else flush();
        } else flush();
      }
    }
    current.push(w);
  }
  flush();

  // Timing + text pass.
  const built = chunks.map((c, i) => {
    const words2 = c.words;
    let start = words2[0].start;
    let end = words2[words2.length - 1].end + p.tailPad;
    const next = chunks[i + 1];
    if (next) end = Math.min(end, next.words[0].start - (p.minGap ?? 0.01));
    if (style === "subtitle" && end - start < p.minDur) {
      end = next ? Math.min(start + p.minDur, next.words[0].start - p.minGap) : start + p.minDur;
    }
    end = Math.max(end, start + 0.2);
    const text = p.uppercase ? joinText(words2).toUpperCase() : joinText(words2);
    const cps = text.replace(/\s/g, "").length / (end - start);
    return {
      start: round3(start),
      end: round3(end),
      words: p.uppercase ? words2.map((w) => ({ ...w, text: w.text.toUpperCase() })) : words2,
      lines: style === "subtitle" ? wrapLines(words2, p.maxLineChars) : [text],
      ...(style === "subtitle" && cps > p.maxCps ? { cpsViolation: round3(cps) } : {}),
    };
  });
  // Final monotonic pass: the 0.2s floor above can push an end past the
  // next cue's start — overlapping events render as stacked captions.
  for (let i = 0; i + 1 < built.length; i++) {
    if (built[i].end > built[i + 1].start) {
      built[i].end = round3(Math.max(built[i + 1].start - 0.01, built[i].start + 0.1));
    }
  }
  return built;
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
const srtTime = (t) => {
  const ms = Math.round(t * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};
const assTime = (t) => {
  const cs = Math.round(t * 100);
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
};

export function toSrt(chunks) {
  return chunks
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.lines.join("\n")}`)
    .join("\n\n") + "\n";
}

// ASS with verified macOS-safe styling. Colors are &HAABBGGRR; social's
// PrimaryColour is the karaoke highlight, SecondaryColour the pre-highlight.
export function toAss(chunks, { width = 1920, height = 1080, style = "subtitle", accent = "&H0000E6FF", font } = {}) {
  const vertical = height > width;
  const socialSize = Math.round(0.057 * width);
  const socialMarginV = Math.round((vertical ? 0.33 : 0.35) * height);
  const subSize = Math.round(0.054 * height);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: social,${font ?? "Arial Black"},${socialSize},${accent},&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,0,2,60,60,${socialMarginV},1
Style: subtitle,${font ?? "Helvetica"},${subSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,3,1,2,120,120,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = chunks.map((c) => {
    let text;
    if (style === "social") {
      // Per-word \k centiseconds: sweep to the next word's start; last word
      // sweeps its own duration.
      text = c.words
        .map((w, i) => {
          const until = i + 1 < c.words.length ? c.words[i + 1].start : w.end;
          return `{\\k${Math.max(Math.round((until - w.start) * 100), 1)}}${w.text}`;
        })
        .join(" ");
    } else {
      text = c.lines.join("\\N");
    }
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},${style},,0,0,0,,${text}`;
  });
  return header + events.join("\n") + "\n";
}

// subtitles= filter path escaping — two parser levels deep; naive quoting
// fails on apostrophes (verified).
export function escapeSubtitlesPath(p) {
  const lvl1 = "'" + p.replace(/'/g, "'\\''") + "'";
  return lvl1.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ---------- impl ----------

function ffmpegBin() {
  return process.env.RIPPLE_FFMPEG ?? findTool(["ffmpeg"]);
}

function hasSubtitlesFilter(bin) {
  const res = run(bin, ["-hide_banner", "-filters"]);
  return /^\s*\S*\s+subtitles\s+V->V/m.test(res.stdout);
}

export async function main(argv) {
  const args = parseArgs(argv, {
    style: "string", burn: "string", out: "string",
    font: "string", accent: "string", width: "number", height: "number",
  });
  const manifestPath = args._[0] ?? "edit.json";
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}. Captions map words through the manifest.`, 2);
  const style = args.style ?? "subtitle";
  if (!PRESETS[style]) fail(`--style must be one of: ${Object.keys(PRESETS).join(", ")}`, 2);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const baseDir = dirname(resolve(manifestPath));
  const scenes = manifest.scenes ?? [];
  if (!scenes.length) fail("Manifest has no scenes", 2);
  const timeline = assemblyTimeline(scenes);

  // Words per unique source, from the perception index (built if missing).
  const wordsBySource = {};
  let missingWords = [];
  for (const source of new Set(scenes.map((s) => s.source))) {
    const abs = resolve(baseDir, source);
    if (!existsSync(abs)) fail(`Source not found: ${source} — media may have moved since the edit`, 2);
    const { index } = loadAnalysis(abs);
    if (index.words) wordsBySource[source] = index.words;
    else missingWords.push(source);
  }
  if (!Object.keys(wordsBySource).length) {
    fail(`No word timing for any source (${missingWords.join(", ")}) — captions need whisper; run ripple doctor.`, 1);
  }

  const { words, dropped, suspects } = mapWordsToOutput(timeline, wordsBySource);
  if (!words.length) fail("No words landed inside the assembly — check scene bounds/sources.", 1);
  const chunks = chunkCaptions(words, style);

  // ASS geometry defaults: the burn target's ACTUAL dimensions when burning
  // (a vertical preset render is 1080x1920, not the manifest's 16:9), else
  // the manifest, else 1080p. Explicit --width/--height always win.
  let geoW = manifest.output?.width ?? 1920;
  let geoH = manifest.output?.height ?? 1080;
  const burnInput = args._[1];
  if (args.burn && burnInput && existsSync(burnInput)) {
    const v = (ffprobeJson(burnInput).streams ?? []).find((s) => s.codec_type === "video");
    if (v?.width) {
      geoW = v.width;
      geoH = v.height;
    }
  }
  geoW = args.width ?? geoW;
  geoH = args.height ?? geoH;
  const outDir = ensureDir(args.out ?? join(baseDir, "work", "captions"));
  const stem = `${basename(manifestPath, extname(manifestPath))}_${style}`;
  const srtPath = join(outDir, `${stem}.srt`);
  const assPath = join(outDir, `${stem}.ass`);
  writeFileSync(srtPath, toSrt(chunks));
  writeFileSync(assPath, toAss(chunks, {
    width: geoW, height: geoH, style,
    ...(args.accent ? { accent: args.accent } : {}),
    ...(args.font ? { font: args.font } : {}),
  }));

  // Burn-in: only with a libass build.
  const bin = ffmpegBin();
  const burnable = bin ? hasSubtitlesFilter(bin) : false;
  let burnedVideo = null;
  if (args.burn) {
    if (!burnable) {
      fail("This ffmpeg lacks libass (no subtitles filter) — sidecars were written; " +
        "set RIPPLE_FFMPEG to a libass-enabled ffmpeg to burn, or deliver the .srt/.ass alongside the video.", 1);
    }
    const input = burnInput;
    if (!input || !existsSync(input)) {
      fail("--burn needs the video to burn onto as a second positional: ripple captions edit.json <video> --burn out.mp4", 2);
    }
    const res = run(bin, [
      "-hide_banner", "-v", "error", "-y", "-i", input,
      "-vf", `subtitles=${escapeSubtitlesPath(resolve(assPath))}`,
      "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "copy", args.burn,
    ]);
    if (res.status !== 0) fail(`burn-in failed: ${res.stderr.trim().slice(-600)}`, 1);
    burnedVideo = args.burn;
  }

  const cpsViolations = chunks.filter((c) => c.cpsViolation).map((c) => ({ start: c.start, cps: c.cpsViolation }));
  output({
    ok: true,
    style,
    srt: srtPath,
    ass: assPath,
    events: chunks.length,
    wordsOutsideCut: dropped,
    ...(dropped > 0 ? { note: "wordsOutsideCut counts index words that don't land in the assembled cut — large numbers are EXPECTED for a trimmed edit, not a mapping failure" } : {}),
    ...(suspects > 0 ? { suspectWordsExcluded: suspects } : {}),
    ...(missingWords.length ? { missingWords } : {}),
    ...(burnedVideo ? { burnedVideo } : {}),
    burnIn: burnable
      ? { available: true }
      : { available: false, reason: "ffmpeg built without libass (no subtitles filter) — sidecars written; set RIPPLE_FFMPEG to burn" },
    ...(cpsViolations.length ? { qa: { cpsViolations } } : {}),
    hints: [
      "SRT is universal; the ASS carries the styling (social = karaoke word highlight).",
      "Players render sidecars as-is — burn only for platforms that ignore caption tracks.",
      style === "social" ? "Social preset uppercases and groups ~3 words; pass --accent &H00XXXXXX (ASS &HAABBGGRR) to restyle." : "Subtitle preset follows 42-char/17-cps readability limits; cps violations are listed, not censored.",
    ],
  });
}
