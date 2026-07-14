import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { referenceSilences } from "./analyze.mjs";
import { manifestAnalysisDir, projectOverrides, sceneWaivers, waiverFor } from "./rules.mjs";
import { cutTiming } from "./timing.mjs";
import {
  ensureDir, fail, fileStamp, output, parseArgs, readJsonOrNull, round3, writeJsonAtomic,
} from "./util.mjs";

// The text twin of the timeline sheet: the cached perception index rendered
// as a digest a model can quote and reason over. Before this command the
// text channel for a source was "slice the index with jq" — every session
// hand-built its own perception loop, which is the exact behavior ripple
// exists to eliminate. Pure index/manifest reads: no ffmpeg, no whisper —
// instant, and safe to call as often as the reasoning needs it.
//
// Same discipline as the sheet: every duration arrives pre-computed (a model
// reads "3.9s" reliably; it cannot be trusted to subtract timestamps across
// a table), every field is self-labeling, and timing truth stays with
// silence edges where whisper's timestamps are known to lie.

const MAX_SENTENCE_ROWS = 40;
const MAX_TAIL = 1.0; // the endpoint law's default bound (VIDEO.md)

// Read-only cache lookup: describe NEVER builds the index — that is
// analyze's minute of work, and triggering it from a "just look" command
// would make looking expensive. A missing (or stale — fileStamp keys on
// size+mtime) index is an instruction to the caller, not a build trigger.
export function readIndex(file, analysisDir) {
  const path = join(analysisDir, `${basename(file, extname(file))}_${fileStamp(file)}.analysis.json`);
  return { path, index: readJsonOrNull(path) };
}

// Sentence text is for quoting, and OUT decisions ride on final phrases —
// truncation keeps the opening and the ending, drops the middle.
export function truncateText(text, { max = 96, head = 48, tail = 40 } = {}) {
  if (text.length <= max) return text;
  return `${text.slice(0, head).trimEnd()} … ${text.slice(-tail).trimStart()}`;
}

// The per-sentence rows a model reads instead of jq-slicing the index:
// gapAfter is the pause the SPEAKER left after the thought (the strongest
// take-boundary cue after the words), breathAfter is the inhale prosody
// found inside the following second (about to continue).
export function sentenceTable(index) {
  const sentences = index.sentences ?? [];
  const breaths = index.breaths ?? [];
  return sentences.map((s, i) => {
    const next = sentences[i + 1];
    const breath = breaths.find((b) => b.t >= s.end - 0.05 && b.t <= s.end + 1.0);
    return {
      i,
      start: s.start,
      end: s.end,
      duration: round3(s.end - s.start),
      text: truncateText(s.text),
      wps: s.wps ?? null,
      terminalPitch: s.terminalPitch ?? null,
      gapAfter: round3(Math.max((next ? next.start : index.duration) - s.end, 0)),
      breathAfter: breath ? breath.dur : null,
    };
  });
}

// Token budget: a 40-minute source has hundreds of sentences, and pasting
// them all buries the signal the digest exists to surface. Past maxRows the
// table collapses into groups — take-bounded when scene changes give usable
// bins, per-minute (widening on very long sources) otherwise — while the
// rows an editor actually navigates by survive in full as `notable`:
// the longest gaps, the slowest and the fastest delivery.
export function budgetSentences(rows, { maxRows = MAX_SENTENCE_ROWS, boundaries = [], duration } = {}) {
  if (rows.length <= maxRows) return { collapsed: false, rows };
  const total = duration ?? (rows.length ? rows[rows.length - 1].end : 0);

  const takeBins = boundaries.filter((b) => b > 0 && b < total).sort((a, b) => a - b);
  let binOf;
  if (takeBins.length && takeBins.length + 1 <= 30) {
    const bins = [0, ...takeBins, Infinity];
    binOf = (t) => {
      let k = 0;
      while (t >= bins[k + 1]) k++;
      return k;
    };
  } else {
    let binSec = 60;
    while (total / binSec > 30) binSec *= 5;
    binOf = (t) => Math.floor(t / binSec);
  }

  const groups = [];
  for (const row of rows) {
    const bin = binOf(row.start);
    const last = groups[groups.length - 1];
    if (last && last.bin === bin) {
      last.i1 = row.i;
      last.end = row.end;
      last.sentences++;
      if (row.wps !== null) { last.wpsSum += row.wps; last.wpsN++; }
      last.lastText = row.text;
      if (row.gapAfter > last.maxGapAfter) last.maxGapAfter = row.gapAfter;
    } else {
      groups.push({
        bin, i0: row.i, i1: row.i, start: row.start, end: row.end, sentences: 1,
        wpsSum: row.wps ?? 0, wpsN: row.wps === null ? 0 : 1,
        firstText: row.text, lastText: row.text, maxGapAfter: row.gapAfter,
      });
    }
  }

  const notable = new Map();
  const mark = (row, why) => {
    const cur = notable.get(row.i) ?? { row, why: [] };
    cur.why.push(why);
    notable.set(row.i, cur);
  };
  [...rows].sort((a, b) => b.gapAfter - a.gapAfter).slice(0, 8)
    .filter((r) => r.gapAfter >= 1)
    .forEach((r) => mark(r, "longest-gap"));
  // One-word blips distort pace — pace outliers need a real sentence.
  const paced = rows.filter((r) => r.wps !== null && r.duration >= 1);
  if (paced.length) {
    mark(paced.reduce((a, b) => (b.wps < a.wps ? b : a)), "slowest");
    mark(paced.reduce((a, b) => (b.wps > a.wps ? b : a)), "fastest");
  }

  return {
    collapsed: true,
    groups: groups.map((g) => ({
      i0: g.i0, i1: g.i1, start: g.start, end: g.end,
      duration: round3(g.end - g.start), sentences: g.sentences,
      meanWps: g.wpsN ? round3(g.wpsSum / g.wpsN) : null,
      maxGapAfter: g.maxGapAfter,
      firstText: g.firstText, lastText: g.lastText,
    })),
    notable: [...notable.values()]
      .sort((a, b) => a.row.i - b.row.i)
      .map(({ row, why }) => ({ ...row, why: why.join("+") })),
  };
}

// The perception doctrine, applied to text: word timestamps right after a
// long pause are unreliable (whisper clumps resumed speech; the index snaps
// it to the silence edge, but a snap is a repair, not a measurement). Marked
// so a model quoting the digest treats silence edges as the timing truth
// there — the text is still right.
export function markFuzzy(words, silences, { minSilence = 1.0, eps = 0.15 } = {}) {
  return words.map((w) => {
    const zeroWidth = w.end - w.start <= 0.021;
    const postPause = silences.some((s) =>
      s.end !== null && s.end !== undefined &&
      s.end - s.start >= minSilence &&
      w.start >= s.end - 0.001 && w.start <= s.end + eps);
    return zeroWidth || postPause ? { ...w, fuzzy: true } : w;
  });
}

// Motion character: still vs active regions from the luma-diff curve. The
// absolute threshold is calibrated against the sheet's heat strip (full
// heat at YDIF 20): ~3 is visible gesturing; below is a seated speaker
// holding still. Regions shorter than minRegion are absorbed — a
// blink-length spike is not a character change.
export function motionCharacter(motion, { bucketSec = 2, threshold = 3, minRegion = 4, duration } = {}) {
  const values = motion?.values ?? [];
  if (!values.length) return null;

  const buckets = new Map();
  for (const v of values) {
    const b = Math.floor(v.t / bucketSec);
    const cur = buckets.get(b) ?? { sum: 0, n: 0 };
    cur.sum += v.ydif;
    cur.n++;
    buckets.set(b, cur);
  }
  const raw = [];
  for (const k of [...buckets.keys()].sort((a, b) => a - b)) {
    const character = buckets.get(k).sum / buckets.get(k).n >= threshold ? "active" : "still";
    const last = raw[raw.length - 1];
    if (last && last.character === character && last.end === k * bucketSec) last.end = (k + 1) * bucketSec;
    else raw.push({ start: k * bucketSec, end: (k + 1) * bucketSec, character });
  }

  const absorbed = [];
  for (const r of raw) {
    const prev = absorbed[absorbed.length - 1];
    if (prev && r.end - r.start < minRegion) { prev.end = r.end; continue; }
    if (prev && prev.end - prev.start < minRegion) {
      // A short opening island takes the character of what follows it.
      absorbed.pop();
      absorbed.push({ start: prev.start, end: r.end, character: r.character });
      continue;
    }
    absorbed.push({ ...r });
  }
  const regions = [];
  for (const r of absorbed) {
    const prev = regions[regions.length - 1];
    if (prev && prev.character === r.character && prev.end >= r.start) prev.end = r.end;
    else regions.push({ ...r });
  }
  if (duration && regions.length) {
    regions[regions.length - 1].end = Math.min(regions[regions.length - 1].end, duration);
  }

  let activeSeconds = 0;
  for (const r of regions) if (r.character === "active") activeSeconds += r.end - r.start;
  const span = regions.length ? regions[regions.length - 1].end - regions[0].start : 0;
  return {
    activeSeconds: round3(activeSeconds),
    stillSeconds: round3(Math.max(span - activeSeconds, 0)),
    regions: regions.map((r) => ({
      start: r.start, end: r.end, duration: round3(r.end - r.start), character: r.character,
    })),
  };
}

// The endpoint law rendered as data: OUT = lastWordEnd + tail (≤ maxTail).
// Flag names reuse candidates' vocabulary — one language for one failure
// class, whichever command reports it. `waiver` is lint's waiver lookup
// (rules.mjs waiverFor, curried over the two tiers): a waived flag renders
// as an accepted exception WITH its reason — never as a bare flag inviting
// a session to re-litigate it, and never silently dropped.
export function endpointDigest(timing, { end, maxTail = MAX_TAIL, waiver = () => null } = {}) {
  if (!timing) return null;
  const all = [];
  const flag = (id, detail) => all.push({ id, text: `${id}: ${detail}` });
  if (timing.straddleEnd) {
    flag("MID_WORD_OUT", `the cut lands inside the word "${timing.straddleEnd}"`);
  }
  if (timing.nextWordStart !== null && timing.nextWordStart < end - 0.05) {
    flag("NEXT_SPEECH_INSIDE", `next speech starts at ${timing.nextWordStart}s, INSIDE this range: "${timing.nextText}"`);
  }
  if (timing.tailGap !== null && timing.tailGap > maxTail) {
    flag("DEAD_AIR_TAIL", `${timing.tailGap}s of nothing after the last word (law: ≤ ${maxTail}s)`);
  }
  if (timing.straddleStart) {
    flag("MID_WORD_IN", `the range starts inside the word "${timing.straddleStart}"`);
  }
  const flags = [];
  const waived = [];
  for (const f of all) {
    const w = waiver(f.id);
    if (w) waived.push({ flag: f.text, waiverReason: w.reason, waiverTier: w.tier });
    else flags.push(f.text);
  }
  return {
    lastWordEnd: timing.lastWordEnd,
    tailGap: timing.tailGap,
    verdict: flags.length ? "flagged"
      : waived.length ? "waived"
        : timing.lastWordEnd === null ? "no-words-in-range" : "within-law",
    ...(flags.length ? { flags } : {}),
    ...(waived.length ? { waived } : {}),
    nextText: timing.nextText,
  };
}

// Timeline totals. Cards default to 2.5s (schema); J/L-cuts overlap audio,
// not record time, so they never change the total.
export function sceneTotals(scenes) {
  const cards = scenes.filter((s) => s.card || s.cardFile);
  const contentSeconds = round3(scenes.reduce((a, s) => a + (s.end - s.start), 0));
  const cardSeconds = round3(cards.reduce((a, s) => a + (s.cardDuration ?? 2.5), 0));
  return {
    scenes: scenes.length,
    contentSeconds,
    cards: cards.length,
    cardSeconds,
    timelineSeconds: round3(contentSeconds + cardSeconds),
  };
}

// ---------- mode builders ----------

function overviewDigest(index) {
  const duration = index.duration;
  const silenceRef = referenceSilences(index).map((s) => ({ start: s.start, end: s.end ?? duration }));

  const speechSeconds = round3((index.speech ?? []).reduce((a, s) => a + (s.end - s.start), 0));
  let silences = silenceRef
    .map((s) => ({ start: round3(s.start), end: round3(s.end), duration: round3(s.end - s.start) }))
    .filter((s) => s.duration >= 1);
  let silencesOmitted = 0;
  if (silences.length > 60) {
    const keep = new Set([...silences].sort((a, b) => b.duration - a.duration).slice(0, 60));
    silencesOmitted = silences.length - keep.size;
    silences = silences.filter((s) => keep.has(s));
  }

  const rows = index.sentences ? sentenceTable(index) : null;
  const budget = rows
    ? budgetSentences(rows, { boundaries: index.sceneChanges ?? [], duration })
    : null;

  const notes = [index.wordsNote, index.prosodyNote, index.turnsNote].filter(Boolean);
  return {
    duration,
    speech: index.hasAudio === false ? null : {
      seconds: speechSeconds,
      ratio: duration ? round3(speechSeconds / duration) : null,
      silenceSeconds: round3(duration - speechSeconds),
    },
    takes: {
      sceneChanges: index.sceneChanges
        ? { count: index.sceneChanges.length, times: index.sceneChanges.slice(0, 48) }
        : null,
      turns: index.turns
        ? { count: index.turns.length, times: index.turns.map((t) => t.snappedT ?? t.t).slice(0, 48) }
        : null,
    },
    motion: motionCharacter(index.motion, { duration }),
    silences,
    ...(silencesOmitted ? { silencesOmitted } : {}),
    nonSpeech: index.nonSpeech
      ? [...index.nonSpeech].sort((a, b) => b.duration - a.duration)
      : null,
    fillers: index.fillers
      ? {
          count: index.fillers.length,
          removableSeconds: round3(index.fillers.reduce((a, f) => a + (f.end - f.start), 0)),
          kinds: index.fillers.reduce((acc, f) => {
            acc[f.kind] = (acc[f.kind] ?? 0) + 1;
            return acc;
          }, {}),
        }
      : null,
    sentencesTotal: rows ? rows.length : null,
    collapsed: budget ? budget.collapsed : false,
    ...(budget && !budget.collapsed ? { sentences: budget.rows } : {}),
    ...(budget?.collapsed ? { groups: budget.groups, notable: budget.notable } : {}),
    ...(notes.length ? { notes } : {}),
    hints: [
      "Every duration is pre-computed — reason with duration/gapAfter/removableSeconds; never subtract timestamps yourself.",
      "nonSpeech rows (sorted longest first) are reaction beats — laughs, claps, stings: prime cut-away and hold material.",
      "terminalPitch falling = thought complete (safe OUT); rising/level = more coming. NEVER use it as a question detector.",
      ...(budget?.collapsed
        ? ["Long source: `groups` summarize the sentence table; `notable` keeps the rows an editor navigates by (longest gaps, slowest/fastest delivery)."]
        : []),
      "Zoom before deciding: `ripple describe <file> --around T --span 12` gives word-level detail; `ripple candidates` gives the verdict.",
    ],
  };
}

function zoomDigest(index, { start, end }) {
  const duration = index.duration;
  const silenceRef = referenceSilences(index);
  // markFuzzy must see the SAME spans the snap used (index.snapKey, the
  // strictest threshold) — analyze snapped word starts to those span ends,
  // and a -45dB span always ends before its -40dB span, so judging against
  // the reference spans left every snapped post-pause word unmarked: the
  // digest presented a repaired timestamp as a measurement.
  const snapSilences = index.silences?.[index.snapKey] ?? silenceRef;
  const words = index.words
    ? markFuzzy(index.words, snapSilences).filter((w) => w.end > start && w.start < end)
    : null;

  const sentences = index.sentences ?? [];
  const before = [...sentences].reverse().find((s) => s.end <= start) ?? null;
  const after = sentences.find((s) => s.start >= end) ?? null;
  const tailText = (t) => (t.length <= 64 ? t : `… ${t.slice(-60).trimStart()}`);
  const headText = (t) => (t.length <= 64 ? t : `${t.slice(0, 60).trimEnd()} …`);

  const notes = [index.wordsNote].filter(Boolean);
  return {
    window: { start: round3(start), end: round3(end), span: round3(end - start) },
    words,
    silences: silenceRef
      .map((s) => ({ start: s.start, end: s.end ?? duration }))
      .filter((s) => s.start < end && s.end > start)
      .map((s) => ({ start: round3(s.start), end: round3(s.end), duration: round3(s.end - s.start) })),
    breaths: index.breaths
      ? index.breaths.filter((b) => b.t >= start && b.t <= end).map((b) => ({ t: b.t, dur: b.dur, db: b.db }))
      : null,
    sentenceBefore: before
      ? { end: before.end, ...(before.terminalPitch ? { terminalPitch: before.terminalPitch } : {}), text: tailText(before.text) }
      : null,
    sentenceAfter: after ? { start: after.start, text: headText(after.text) } : null,
    ...(notes.length ? { notes } : {}),
    hints: [
      "fuzzy: true = post-pause timestamp (whisper clumps resumed speech) — trust the silence edges for timing there; the text is still right.",
      "The endpoint law is arithmetic: OUT = last word end + tail preference (≤1.0s). `ripple candidates --start S --end E` returns the verdict.",
      "A breath right after a 'final' word means the speaker is about to continue — read sentenceAfter before cutting.",
    ],
  };
}

function manifestDigest(manifest, manifestPath, { analysisDir, slug, sourceFilter }) {
  const baseDir = dirname(resolve(manifestPath));
  let scenes = manifest.scenes ?? [];
  if (sourceFilter) {
    scenes = scenes.filter((s) => s.source && resolve(baseDir, s.source) === resolve(sourceFilter));
    if (!scenes.length) fail(`No scenes in ${manifestPath} use source: ${sourceFilter}`, 2);
  }
  if (slug) {
    scenes = scenes.filter((s) => s.slug === slug);
    if (!scenes.length) fail(`Scene not found in manifest: ${slug}`, 2);
  }

  // One index read per source, however many scenes share it.
  const cache = new Map();
  const lookup = (srcAbs) => {
    if (!cache.has(srcAbs)) {
      cache.set(srcAbs, existsSync(srcAbs) ? readIndex(srcAbs, analysisDir).index : undefined);
    }
    return cache.get(srcAbs);
  };

  // Lint's waiver accounting, verbatim (rules.mjs): a DEAD_AIR_TAIL the
  // project waived or retuned must read the same here as at the lint gate —
  // describe rendering it as a bare flag reopened accepted exceptions. No
  // explicit bounds passed: an explicit value would outrank the retune.
  const project = projectOverrides(join(baseDir, "VIDEO.md"));

  const rows = scenes.map((scene) => {
    const row = {
      slug: scene.slug,
      source: scene.source,
      in: scene.start,
      out: scene.end,
      duration: round3(scene.end - scene.start),
      ...(scene.status ? { status: scene.status } : {}),
      ...(scene.card ? { card: scene.card } : {}),
      // reasoning is required by doctrine — null stays visible as the gap it is.
      reasoning: scene.reasoning ? truncateText(scene.reasoning, { max: 200, head: 120, tail: 60 }) : null,
    };
    // A mid-edit manifest may not carry `source` yet (the lint hook's whole
    // audience): a missing source is a note, exactly as lint reports it —
    // never a crash with an empty envelope.
    const srcAbs = scene.source ? resolve(baseDir, scene.source) : null;
    const index = srcAbs ? lookup(srcAbs) : undefined;
    if (index === undefined) return { ...row, note: `source not found: ${srcAbs ?? "(missing)"}` };
    if (!index) return { ...row, note: `no cached index — run \`ripple analyze ${scene.source}\`` };
    if (!index.words) return { ...row, note: index.wordsNote ?? "index has no word timing" };
    const silenceRef = referenceSilences(index).map((s) => ({ ...s, end: s.end ?? index.duration }));
    const timing = cutTiming(index.words, silenceRef, { start: scene.start, end: scene.end });
    const sceneTier = sceneWaivers(scene);
    const d = endpointDigest(timing, {
      end: scene.end,
      maxTail: project.maxTail,
      waiver: (id) => waiverFor(id, sceneTier.waive, project.waive),
    });
    return {
      ...row,
      lastWordEnd: d.lastWordEnd,
      tailGap: d.tailGap,
      endpoint: d.verdict,
      ...(d.flags ? { flags: d.flags } : {}),
      ...(d.waived ? { waived: d.waived } : {}),
      nextText: d.nextText,
    };
  });

  return {
    manifest: manifestPath,
    scenes: rows,
    totals: sceneTotals(scenes),
    hints: [
      `endpoint within-law = tailGap ≤ ${project.maxTail}s with no mid-word cut and no next-speech leak; every flag names a failure that shipped in a real session.`,
      "endpoint waived = every flag carries a written waiver (scenes[].waivers or VIDEO.md rules) — an accepted exception with its reason attached, not a defect to re-litigate.",
      "Read nextText for every scene: it must be the next prompt or take, NOT more of the answer.",
      "Scenes without a cached index carry a note — run `ripple analyze <source>`; describe never builds the index.",
    ],
  };
}

// ---------- impl ----------

export async function main(argv) {
  const args = parseArgs(argv, {
    start: "number", end: "number", around: "number", span: "number",
    manifest: "string", scene: "string", out: "string", "analysis-dir": "string",
  });
  const file = args._[0];
  // Manifest mode anchors the index cache on the manifest's project root
  // (rules.mjs manifestAnalysisDir) so describe and lint agree on the same
  // manifest from any cwd; file mode keeps analyze's own cwd anchor.
  const analysisDir = args["analysis-dir"] ??
    (args.manifest ? manifestAnalysisDir(args.manifest) : join(process.cwd(), "work", "analysis"));
  const usage =
    "Usage: ripple describe <file> [--around T --span 12 | --start S --end E]\n" +
    "       ripple describe --manifest edit.json [--scene slug] [<file>]\n" +
    "       [--analysis-dir work/analysis] [--out digest.json]";

  if (args.scene && !args.manifest) fail("--scene needs --manifest", 2);
  if (!file && !args.manifest) fail(usage, 2);

  let envelope;
  if (args.manifest) {
    // MANIFEST mode: the timeline as text. A range makes no sense here —
    // scenes address their own sources.
    if (args.around !== undefined || args.start !== undefined || args.end !== undefined) {
      fail("--around/--start/--end do not apply to --manifest mode (address a scene with --scene)", 2);
    }
    if (!existsSync(args.manifest)) fail(`Manifest not found: ${args.manifest}`, 2);
    const manifest = readJsonOrNull(args.manifest);
    if (!manifest) fail(`Unreadable manifest: ${args.manifest}`, 2);
    envelope = {
      ok: true,
      mode: "manifest",
      ...manifestDigest(manifest, args.manifest, {
        analysisDir, slug: args.scene, sourceFilter: file,
      }),
    };
  } else {
    if (!existsSync(file)) fail(`File not found: ${file}`, 2);
    const { index, path: indexPath } = readIndex(file, analysisDir);
    if (!index) {
      fail(
        `No cached index for ${file} — run \`ripple analyze ${file}\` first. ` +
        "describe reads the cache; it never builds it (a changed file needs re-analysis).",
        1,
        { fix: `ripple analyze ${file}` }
      );
    }

    const zoom = args.around !== undefined || args.start !== undefined || args.end !== undefined;
    if (zoom) {
      let start;
      let end;
      if (args.around !== undefined) {
        const span = args.span ?? 12;
        start = Math.max(0, args.around - span / 2);
        end = Math.min(index.duration, args.around + span / 2);
      } else {
        start = Math.max(args.start ?? 0, 0);
        end = Math.min(args.end ?? index.duration, index.duration);
      }
      if (end <= start) fail("--end must be greater than --start", 2);
      envelope = { ok: true, file, mode: "zoom", index: indexPath, ...zoomDigest(index, { start, end }) };
    } else {
      envelope = { ok: true, file, mode: "overview", index: indexPath, ...overviewDigest(index) };
    }
  }

  if (args.out) {
    ensureDir(dirname(resolve(args.out))); // same contract as review/handoff --out
    writeJsonAtomic(args.out, envelope);
  }
  output(args.out ? { ...envelope, saved: args.out } : envelope);
}
