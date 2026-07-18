import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { referenceSilences } from "./analyze.mjs";
import { cutTiming } from "./timing.mjs";
import { fileStamp, readJsonOrNull, round3, silenceEdges } from "./util.mjs";

// Categorical cut-point checks shared by candidates and lint. A range must
// produce the same result when it is inspected directly and when the whole
// manifest is checked before rendering.
export function endpointFlags(timing, silence, { maxTail = 1.0, maxLead = 0.5, end }) {
  const flags = [];
  const zeroTailEverywhere = Object.values(silence).every((s) => s.tail === 0);
  // Zero tail silence means audio at the cut — but when word timing shows a
  // clean positive gap after the last word (no straddle), the "audio" is
  // just a cut placed right after speech ends: expected, not a defect. The
  // flag fires only when word data is absent or corroborates it.
  const corroborated = !timing || timing.straddleEnd !== null ||
    timing.wordsInRange === 0 ||
    (timing.tailGap !== null && timing.tailGap < 0.15);
  if (zeroTailEverywhere && corroborated) {
    flags.push({
      flag: "SPEECH_AT_OUT",
      detail: "tail silence is 0 at every threshold — someone is speaking at the cut point. This is a red flag, not a pass.",
    });
  }
  if (!timing) return flags;
  if (timing.straddleEnd) {
    flags.push({
      flag: "MID_WORD_OUT",
      detail: `the cut lands inside the word "${timing.straddleEnd}"`,
    });
  }
  if (timing.nextWordStart !== null && timing.nextWordStart < end - 0.05) {
    flags.push({
      flag: "NEXT_SPEECH_INSIDE",
      detail: `next speech starts at ${timing.nextWordStart}s, INSIDE this range (ends ${end}s): "${timing.nextText}"`,
    });
  }
  if (timing.tailGap !== null && timing.tailGap > maxTail) {
    flags.push({
      flag: "DEAD_AIR_TAIL",
      detail: `${timing.tailGap}s of nothing after the last word (bound ${maxTail}s) — cut at lastWordEnd + tail preference`,
    });
  }
  if (timing.straddleStart) {
    flags.push({
      flag: "MID_WORD_IN",
      detail: `the range starts inside the word "${timing.straddleStart}"`,
    });
  }
  if (timing.leadGap !== null && timing.leadGap > maxLead) {
    flags.push({
      flag: "LATE_FIRST_WORD",
      detail: `${timing.leadGap}s before the first word (bound ${maxLead}s) — move the IN toward firstWordStart`,
    });
  }
  return flags;
}

// Where analyze cached the indexes for a given manifest. Analyze writes to
// <root>/work/analysis and a manifest lives at <root>/edit.json or
// <root>/work/edit.json. Derive the root from the manifest so lint and the
// write hook agree with analyze regardless of the caller's cwd.
export function manifestAnalysisDir(manifestPath) {
  const baseDir = dirname(resolve(manifestPath));
  const local = join(baseDir, "work", "analysis");
  if (basename(baseDir) === "work" && !existsSync(local)) {
    return join(dirname(baseDir), "work", "analysis");
  }
  return local;
}

// Per-range silence edges computed from the cached whole-file silence map.
// candidates runs silencedetect with d=0.25, so clipped spans shorter than
// that floor must be dropped here to keep both callers aligned.
const SILENCEDETECT_MIN = 0.25;
function rangeSilence(index, start, end) {
  const dur = round3(end - start);
  const out = {};
  for (const [key, spans] of Object.entries(index.silences ?? {})) {
    const clipped = (spans ?? [])
      .map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end ?? index.duration, end) }))
      .filter((s) => s.end - s.start >= SILENCEDETECT_MIN - 0.001)
      .map((s) => ({ start: round3(s.start - start), end: round3(s.end - start) }));
    out[key] = { ...silenceEdges(clipped, dur), spans: clipped.length };
  }
  return out;
}

const WARN_CODES = new Set(["NO_WORD_TIMING", "DRIFT_SUSPECT"]);

// Fast, read-only pre-render checks over cached perception. A missing index is
// a blocking finding: green means verified, never merely unexamined.
export function lintManifest(manifestPath, {
  scene, analysisDir, maxTail = 1.0, maxLead = 0.5,
} = {}) {
  const baseDir = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const indexDir = analysisDir ?? manifestAnalysisDir(manifestPath);
  const findings = [];
  const scenes = (manifest.scenes ?? []).filter((s) => !scene || s.slug === scene);
  const endpoints = [];

  for (const s of scenes) {
    const push = (code, detail) => {
      findings.push({
        code,
        scene: s.slug,
        detail,
        severity: WARN_CODES.has(code) ? "warn" : "block",
      });
    };

    const src = s.source ? resolve(baseDir, s.source) : null;
    if (!src || !existsSync(src)) {
      push("NO_INDEX", `source not found: ${s.source ?? "(missing)"} — nothing to verify, nothing to render`);
      endpoints.push({ scene: s.slug, verdict: "no-index" });
      continue;
    }
    const stem = `${basename(src, extname(src))}_${fileStamp(src)}`;
    const index = readJsonOrNull(join(indexDir, `${stem}.analysis.json`));
    if (!index) {
      push("NO_INDEX", `no cached perception index for ${s.source} — run: ripple analyze "${s.source}"`);
      endpoints.push({ scene: s.slug, verdict: "no-index" });
      continue;
    }
    if (index.hasAudio === false) continue;
    if (typeof s.start !== "number" || typeof s.end !== "number" || s.end <= s.start) continue;
    if (!index.words) {
      push("NO_WORD_TIMING", index.wordsNote ?? "index has no word timing — endpoint checks ran on silence alone");
    }
    if (index.drift?.suspected) {
      push(
        "DRIFT_SUSPECT",
        `${s.source}'s index self-reports word-timing drift (${index.drift.stretchedEndings} stretched endings, worst ${index.drift.maxStretch}s) — ` +
        `verify this scene's OUT with candidates' driftCheck before trusting it`
      );
    }
    const silenceRef = referenceSilences(index).map((sp) => ({ ...sp, end: sp.end ?? index.duration }));
    const timing = index.words ? cutTiming(index.words, silenceRef, { start: s.start, end: s.end }) : null;
    const silence = rangeSilence(index, s.start, s.end);
    const before = findings.length;
    for (const f of endpointFlags(timing, silence, { maxTail, maxLead, end: s.end })) {
      push(f.flag, f.detail);
    }
    const sceneFindings = findings.slice(before);
    endpoints.push({
      scene: s.slug,
      in: s.start,
      out: s.end,
      duration: round3(s.end - s.start),
      lastWordEnd: timing?.lastWordEnd ?? null,
      tailGap: timing?.tailGap ?? null,
      ...(timing?.nextText ? { nextText: timing.nextText } : {}),
      verdict: sceneFindings.length ? "flagged"
        : !timing || timing.lastWordEnd === null ? "no-words-in-range"
          : "clear",
    });
  }

  return { findings, scenes: scenes.map((s) => s.slug), endpoints };
}
