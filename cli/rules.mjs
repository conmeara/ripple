import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { referenceSilences } from "./analyze.mjs";
import { cutTiming } from "./timing.mjs";
import { fileStamp, readJsonOrNull, round3, silenceEdges } from "./util.mjs";

// ONE registry for every deterministic opinion ripple enforces, keyed by an
// ID that means the same failure at each moment it can be caught: pre-lock
// (`candidates` flags), pre-render (`lint` findings), post-render (`qa`
// gates). Consolidated because the same defect kept changing names between
// surfaces — a tail a session judged at lock time came back as an anonymous
// red at delivery and got re-litigated from scratch. IDs are load-bearing:
// SCREAMING_SNAKE for cut-point flags, kebab-case for delivery gates, every
// pre-existing ID preserved verbatim. Each rule's `origin` names the real
// session failure that created it — a rule nobody can explain gets deleted.
//
// `summary`/`origin` are the plain-text registry canon (no markdown — safe for
// any CLI surface). `doc`/`why` are the markdown cells that render into
// reference/rules.md — they carry the richer prose (tunable bounds in
// backticks, the driftCheck Δ) the doc needs. reference/rules.md is GENERATED
// from this array by scripts/generate-rules-md.mjs (npm run gen:rules); a test
// pins the committed file to the generator output, so the doc can never lie
// about the rules. Edit the doc columns HERE, never the .md.
export const RULES = [
  // -- lock: cut-point flags (candidates at lock time, lint across the manifest)
  {
    id: "SPEECH_AT_OUT", phase: "lock", severity: "block",
    summary: "Tail silence is 0 at every threshold — someone is speaking at the cut point.",
    origin: "A session read \"tail silence: 0\" as a pass and shipped two next-question leaks.",
    doc: "Tail silence 0 at every threshold — someone is speaking at the cut point",
    why: "A session read \"tail silence: 0\" as a pass and shipped two next-question leaks",
  },
  {
    id: "MID_WORD_OUT", phase: "lock", severity: "block",
    summary: "The OUT lands inside a word.",
    origin: "The \"question 5 got cut off\" repair class: OUTs placed from untimed text, not word timing.",
    doc: "The OUT lands inside a word",
    why: "The \"question 5 got cut off\" repair class: OUTs placed from untimed text",
  },
  {
    id: "NEXT_SPEECH_INSIDE", phase: "lock", severity: "block",
    summary: "The next speech starts INSIDE the range — the following prompt/take rides along.",
    origin: "The shipped chore cut: the next question began at 499.5s inside a range ending at 501s.",
    doc: "The next speech starts INSIDE the range",
    why: "The shipped chore cut: the next question began at 499.5s inside a range ending 501s",
  },
  {
    id: "DEAD_AIR_TAIL", phase: "lock", severity: "block",
    summary: "Too much nothing after the last word (bound: maxTail, default 1.0s).",
    origin: "The shipped married cut carried a 2.45s dead tail past every eyeball.",
    doc: "More than `maxTail` (default 1.0s) of nothing after the last word",
    why: "The shipped married cut carried a 2.45s dead tail past every eyeball",
  },
  {
    id: "MID_WORD_IN", phase: "lock", severity: "block",
    summary: "The range starts inside a word.",
    origin: "Same untimed-text failure as MID_WORD_OUT, at the IN — answers opened mid-syllable.",
    doc: "The range starts inside a word",
    why: "Same untimed-text failure at the IN — answers opened mid-syllable",
  },
  {
    id: "LATE_FIRST_WORD", phase: "lock", severity: "block",
    summary: "Too much dead air before the first word (bound: maxLead, default 0.5s).",
    origin: "Ranges opened on the interviewer's silence instead of the answer.",
    doc: "More than `maxLead` (default 0.5s) before the first word",
    why: "Ranges opened on the interviewer's silence instead of the answer",
  },
  {
    id: "INDEX_DRIFT", phase: "lock", severity: "block",
    summary: "The range's isolated re-transcription disagrees with the index's word timing — two measurements, at least one wrong; verify on a tighter window before locking.",
    origin: "A 13-min source drifted 1–5s late on 8 of 10 answers; every cut placed from the index landed on the speaker's reset, three re-renders deep.",
    doc: "The range's isolated re-transcription disagrees with the index's word timing (`driftCheck`, Δ > 1.25s) — chunked analysis prevents cumulative drift, so disagreement means at least one measurement is wrong (often the isolated pass smearing into a near-silent tail); re-verify on a tighter window",
    why: "A 13-min source drifted 1–5s late on 8 of 10 answers; every cut placed from the index landed on the speaker's reset, three re-renders deep",
  },

  // -- render: pre-render findings (lint) and render-time advisories (cut)
  {
    id: "NO_INDEX", phase: "render", severity: "block",
    summary: "A scene's source has no cached perception index — the cut is unverifiable.",
    origin: "Lint must never pass a scene nobody has analyzed; unverified green is how leaks ship.",
    doc: "A scene's source has no cached perception index — the cut is unverifiable",
    why: "Lint must never pass a scene nobody analyzed; unverified green is how leaks ship",
  },
  {
    id: "NO_WORD_TIMING", phase: "render", severity: "warn",
    summary: "The index has no word timing (whisper unavailable when analyzed) — endpoint checks ran on silence alone.",
    origin: "The original leaks shipped off untimed transcript text; silence-only verification must say so.",
    doc: "The index has no word timing — endpoint checks ran on silence alone",
    why: "The original leaks shipped off untimed transcript text; degraded verification must say so",
  },
  {
    id: "DRIFT_SUSPECT", phase: "render", severity: "warn",
    summary: "The scene's source index self-reports word-timing drift — endpoint numbers may be seconds late; the OUT needs candidates' driftCheck before it can be trusted.",
    origin: "Scenes re-scoped by hand from a drifted index kept passing lint green while every cut landed on the speaker's reset.",
    doc: "The scene's source index self-reports word-timing drift — the OUT needs candidates' `driftCheck`; waive per scene with the aligned Δ once it clears",
    why: "Scenes re-scoped by hand from a drifted index kept passing lint green while every cut landed on the speaker's reset",
  },
  {
    id: "jump-cut", phase: "render", severity: "warn",
    summary: "A direct join between mostly-matching frames — the uncanny band between continuous and a clean change.",
    origin: "Locked-off interview joins spliced two takes of the same framing into a visible skip.",
    doc: "A direct join between mostly-matching frames",
    why: "Locked-off interview joins spliced two takes of the same framing into a visible skip",
  },
  {
    id: "off-beat", phase: "render", severity: "warn",
    summary: "Visual boundaries land off the music bed's beat grid.",
    origin: "A montage cut 140ms off the beat felt wrong before anyone could say why.",
    doc: "Visual boundaries land off the music bed's beat grid",
    why: "A montage cut 140ms off the beat felt wrong before anyone could say why",
  },
  {
    id: "waiver-missing-reason", phase: "render", severity: "warn",
    summary: "A waiver with no written reason — ignored, and reported.",
    origin: "Reasonless waivers rot: a month later nobody can tell an intentional exception from a forgotten hack.",
    doc: "A waiver with no written reason (it is ignored, not honored)",
    why: "Reasonless waivers rot — a month later nobody can tell an intentional exception from a hack",
  },

  // -- delivery: qa gates on the rendered artifacts
  {
    id: "decode", phase: "delivery", severity: "block",
    summary: "The final must decode cleanly end to end.",
    origin: "A corrupt final looks fine in a player seek — only a full decode proves the file.",
    doc: "The final must decode cleanly end to end",
    why: "A corrupt final looks fine in a player seek — only a full decode proves the file",
  },
  {
    id: "probe", phase: "delivery", severity: "block",
    summary: "The final has a video stream and a real duration.",
    origin: "A bad -map once delivered an audio-only \"video\" that every downstream tool accepted.",
    doc: "A video stream and a real duration exist",
    why: "A bad -map once delivered an audio-only \"video\" every downstream tool accepted",
  },
  {
    id: "color-policy", phase: "delivery", severity: "block",
    summary: "Delivered color matches the policy — HDR stays HDR, declared SDR stays SDR.",
    origin: "An HLG master silently became washed-out SDR; the release blocker that created the color policy.",
    doc: "Delivered color matches the policy — HDR stays HDR",
    why: "An HLG master silently became washed-out SDR; the release blocker that created the policy",
  },
  {
    id: "clip-count", phase: "delivery", severity: "block",
    summary: "One rendered clip per manifest scene.",
    origin: "A partial --scene render left stale clips that QA'd as the whole edit.",
    doc: "One rendered clip per manifest scene",
    why: "A partial --scene render left stale clips that QA'd as the whole edit",
  },
  {
    id: "clip-decode", phase: "delivery", severity: "block",
    summary: "Every per-scene clip decodes cleanly.",
    origin: "One truncated clip poisoned the assembly while the other nine looked fine.",
    doc: "Every per-scene clip decodes cleanly",
    why: "One truncated clip poisoned the assembly while the other nine looked fine",
  },
  {
    id: "scene-tails", phase: "delivery", severity: "block",
    summary: "Per-scene tail silence within maxTailSilence.",
    origin: "Two >2s interior tails passed the global edge gates — the final's edges can't see inside scene 6.",
    doc: "Per-scene tail silence within `qa.maxTailSilence`",
    why: "Two >2s interior tails passed the global edge gates — the final's edges can't see inside scene 6",
  },
  {
    id: "dialogue-loudness", phase: "delivery", severity: "block",
    summary: "Per-scene dialogue loudness spread within maxLoudnessSpread (fix with scene.gainDb).",
    origin: "One scene sat 6dB quieter than its neighbor — the defect a mixing panel exists to prevent.",
    doc: "Per-scene loudness spread within `qa.maxLoudnessSpread`",
    why: "One scene sat 6dB quieter than its neighbor — the defect a mixing panel exists to prevent",
  },
  {
    id: "leading-silence", phase: "delivery", severity: "block",
    summary: "Opening silence within bounds, allowing an intentional opening card's quiet.",
    origin: "Failing red on every card-led cut taught everyone to ignore red QA.",
    doc: "Opening silence within bounds, allowing an opening card's quiet",
    why: "Failing red on every card-led cut taught everyone to ignore red QA",
  },
  {
    id: "tail-silence", phase: "delivery", severity: "block",
    summary: "Final tail silence within maxTailSilence.",
    origin: "The married-cut dead tail again, caught at delivery when lock and lint were skipped.",
    doc: "Final tail silence within `qa.maxTailSilence`",
    why: "The married-cut dead tail again, caught at delivery when lock and lint were skipped",
  },
  {
    id: "loudness", phase: "delivery", severity: "block",
    summary: "Integrated loudness within ±1 LU of music.loudnessTarget.",
    origin: "A bed mixed hot masked every silence gate; integrated loudness was the only number that caught it.",
    doc: "Integrated loudness within ±1 LU of `music.loudnessTarget`",
    why: "A hot bed masked every silence gate; integrated loudness was the only number that caught it",
  },
  {
    id: "prompt-leak", phase: "delivery", severity: "block",
    summary: "No interviewer prompts or take slates in the final transcript.",
    origin: "\"Next question\" shipped in a final. Twice.",
    doc: "No interviewer prompts or take slates in the final transcript",
    why: "\"Next question\" shipped in a final. Twice",
  },
  {
    id: "scene-endings", phase: "delivery", severity: "block",
    summary: "Every scene.expectEnding phrase is present in the final transcript.",
    origin: "\"Question 5 got cut off\" — the repair loop's acceptance test, promoted to a standing gate.",
    doc: "Every `scene.expectEnding` phrase present in the transcript",
    why: "\"Question 5 got cut off\" — the repair loop's acceptance test, promoted to a standing gate",
  },
  {
    id: "content-gates", phase: "delivery", severity: "block",
    summary: "Content checks must run when the manifest expects them — a missing transcript fails loudly.",
    origin: "Content gates once skipped silently and a leak passed QA green.",
    doc: "Content checks must run when expected — a missing transcript fails loudly",
    why: "Content gates once skipped silently and a leak passed QA green",
  },
  {
    id: "black-frames", phase: "delivery", severity: "block",
    summary: "No black frames the manifest doesn't explain (cards, dissolve/fadeblack overlaps).",
    origin: "A 2-frame black blink at a scene join shipped — every gate was listening, none were looking.",
    doc: "Black frames the manifest doesn't explain (cards, dissolve/fadeblack overlaps are expected)",
    why: "A 2-frame black blink at a scene join shipped — every gate was listening, none were looking",
  },
  {
    id: "freeze-frames", phase: "delivery", severity: "block",
    summary: "No frozen picture outside the manifest's intentional stills/cards.",
    origin: "A mis-seeked segment froze mid-scene while the audio kept talking.",
    doc: "Frozen picture outside the manifest's intentional stills/cards",
    why: "A mis-seeked segment froze mid-scene while the audio kept talking",
  },
];

export const RULE_INDEX = new Map(RULES.map((r) => [r.id, r]));

// Categorical verdicts, not vibes: the numbers say whether a cut range is
// clean, and each red flag names the exact failure it prevents. A real
// session shipped two next-question leaks because "tail silence: 0" read as
// a pass and the transcript was untimed text. ONE implementation, two
// callers: candidates (fresh per-range silence) and lint (cached index
// silence) — the same range must never flag differently at the two moments.
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

// ---------- VIDEO.md front-matter (project-tier overrides) ----------

function stripQuotes(v) {
  return /^".*"$/.test(v) || /^'.*'$/.test(v) ? v.slice(1, -1) : v;
}

function scalarValue(raw) {
  let v = raw;
  // A trailing comment only counts outside quotes. For a quoted value the
  // string ends at the closing quote — `reason: "x" # y` stores "x", never
  // the quotes-plus-comment literal.
  const quote = v[0] === '"' || v[0] === "'" ? v[0] : null;
  if (quote) {
    const close = v.indexOf(quote, 1);
    if (close !== -1) return v.slice(1, close);
    return v; // unterminated quote: keep the literal, don't guess
  }
  const hash = v.indexOf(" #");
  if (hash !== -1) v = v.slice(0, hash).trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

// Inline flow map: {maxTail: 2.5, reason: "contemplative, long tails"} —
// commas inside quotes must not split, and a trailing `# comment` after the
// closing brace must not glue itself onto the last entry's value (it once
// turned `maxTail: 2.5} # note` into the string "2.5}", silently disabling
// the retune while the overrides echo still claimed it).
function parseFlowMap(raw) {
  let s = raw.trim();
  let braceQuote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (braceQuote) {
      if (ch === braceQuote) braceQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      braceQuote = ch;
      continue;
    }
    if (ch === "}") {
      s = s.slice(0, i + 1);
      break;
    }
  }
  const inner = s.replace(/^\{/, "").replace(/\}$/, "");
  const out = {};
  const parts = [];
  let part = "";
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      part += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      part += ch;
      continue;
    }
    if (ch === ",") {
      parts.push(part);
      part = "";
      continue;
    }
    part += ch;
  }
  if (part.trim()) parts.push(part);
  for (const p of parts) {
    const colon = p.indexOf(":");
    if (colon === -1) continue;
    out[stripQuotes(p.slice(0, colon).trim())] = scalarValue(p.slice(colon + 1).trim());
  }
  return out;
}

// Indentation in columns. Real YAML rejects tab indentation loudly; this
// parser has no error channel, so a tab counted as one column would silently
// dedent a tab-indented child out of its space-indented parent (the retune
// lands as stray sibling keys and never applies). Expanding tabs to 8-column
// tab stops keeps a tab-indented child nested under any realistic parent.
function indentOf(line) {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") col++;
    else if (ch === "\t") col += 8 - (col % 8);
    else break;
  }
  return col;
}

// VIDEO.md opens with a `---` front-matter block carrying project-tier rule
// overrides. Hand-written YAML-subset parser (runtime deps are banned):
// `key: value` scalars, nesting by indentation, inline {k: v} flow maps,
// quotes, `#` comments. That is everything the rules block needs — anything
// richer belongs in edit.json, not YAML.
export function parseFrontMatter(text) {
  const lines = text.split("\n");
  if ((lines[0] ?? "").trim() !== "---") return {};
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (close === -1) return {};
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of lines.slice(1, close)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = indentOf(raw);
    const colon = raw.indexOf(":");
    if (colon === -1) continue;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    const key = stripQuotes(raw.slice(0, colon).trim());
    const rest = raw.slice(colon + 1).trim();
    if (!rest || rest.startsWith("#")) {
      parent[key] = {};
      stack.push({ indent, obj: parent[key] });
    } else if (rest.startsWith("{")) {
      parent[key] = parseFlowMap(rest);
    } else {
      parent[key] = scalarValue(rest);
    }
  }
  return root;
}

// ---------- waiver accounting (lint only) ----------
// ONE reading of the two waiver tiers, because a waiver honored by lint but
// omitted from its output reopens accepted exceptions: a waived
// DEAD_AIR_TAIL must stay visibly waived so sessions do not re-litigate it.

// A retune value must end up numeric. Quoted numbers coerce ("5.0" — YAML
// users quote by habit and real YAML would still read a number); anything
// else is null so a type-invalid retune is never applied.
function numeric(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

// Project tier: VIDEO.md front-matter `rules:` — threshold retunes and
// standing waivers, honored only WITH a reason. `reasonless` lists the ids
// ignored for want of one (the caller decides how to report them).
// Precedence: an explicitly passed bound (a CLI flag) outranks the project
// retune, which outranks the default — `lint --max-tail 0.2` asking for
// strict must never be silently loosened back by VIDEO.md. A retune
// suppressed by an explicit flag is still echoed, marked `superseded`, and a
// non-numeric retune value is dropped from the echo entirely: the overrides
// block must never assert a retune that isn't live.
export function projectOverrides(videoMdPath, { maxTail, maxLead } = {}) {
  const projectRules = existsSync(videoMdPath)
    ? parseFrontMatter(readFileSync(videoMdPath, "utf8")).rules ?? {}
    : {};
  const waive = new Map();
  const overrides = [];
  const reasonless = [];
  let effMaxTail = maxTail ?? 1.0;
  let effMaxLead = maxLead ?? 0.5;
  for (const [id, spec] of Object.entries(projectRules)) {
    if (!spec || typeof spec !== "object") continue;
    const { reason, waive: w, ...params } = spec;
    if (!reason) {
      reasonless.push(id);
      continue;
    }
    if (w === true) waive.set(id, reason);
    let superseded = false;
    for (const [ruleId, param, explicit, apply] of [
      ["DEAD_AIR_TAIL", "maxTail", maxTail, (v) => { effMaxTail = v; }],
      ["LATE_FIRST_WORD", "maxLead", maxLead, (v) => { effMaxLead = v; }],
    ]) {
      if (!(param in params)) continue;
      const v = numeric(params[param]);
      if (id === ruleId && v !== null) {
        params[param] = v;
        if (explicit === undefined) apply(v);
        else superseded = true;
      } else {
        delete params[param]; // invalid or misplaced: not live, not echoed
      }
    }
    overrides.push({
      rule: id, tier: "project",
      ...(w === true ? { waive: true } : {}),
      ...params,
      ...(superseded ? { superseded: true } : {}),
      reason,
    });
  }
  return { waive, overrides, reasonless, maxTail: effMaxTail, maxLead: effMaxLead };
}

// Scene tier: scenes[].waivers travel in the manifest next to the bounds
// they excuse. Same reason discipline, same `reasonless` contract.
export function sceneWaivers(scene) {
  const waive = new Map();
  const reasonless = [];
  for (const w of Array.isArray(scene?.waivers) ? scene.waivers : []) {
    if (!w?.rule) continue;
    if (!w.reason) {
      reasonless.push(w.rule);
      continue;
    }
    waive.set(w.rule, w.reason);
  }
  return { waive, reasonless };
}

// The waiver closest to the cut wins: scene tier outranks project tier.
export function waiverFor(id, sceneWaive, projectWaive) {
  return sceneWaive.has(id) ? { reason: sceneWaive.get(id), tier: "scene" }
    : projectWaive.has(id) ? { reason: projectWaive.get(id), tier: "project" }
      : null;
}

// ---------- pre-render lint ----------

// Where analyze cached the indexes for a given manifest. Analyze writes to
// <root>/work/analysis and a manifest lives at <root>/edit.json or
// <root>/work/edit.json (status.resolveManifestPath's two layouts) — derive
// the root from the manifest itself so lint and the write hook
// agree with analyze REGARDLESS of the caller's cwd. Anchoring on
// dirname(manifest) alone sent lint to <root>/work/work/analysis for the
// work/edit.json layout: false NO_INDEX blocks while status said clean.
export function manifestAnalysisDir(manifestPath) {
  const baseDir = dirname(resolve(manifestPath));
  const local = join(baseDir, "work", "analysis");
  if (basename(baseDir) === "work" && !existsSync(local)) {
    return join(dirname(baseDir), "work", "analysis");
  }
  return local;
}

// Per-range silence edges computed from the INDEX's whole-file silence map
// (no ffmpeg run): clip each threshold's spans to the range and shift to
// range-relative time, matching the shape candidates builds with a fresh
// silencedetect pass. Matching includes the detector's floor: candidates'
// silencedetect runs with d=0.25 and cannot report a sliver shorter than
// that at a range edge, so a clipped span under 0.25s must be dropped here
// too — keeping it once let a 0.1s tail sliver lint green while the same
// range blocked SPEECH_AT_OUT at lock, violating the one-implementation
// invariant above.
const SILENCEDETECT_MIN = 0.25; // silencedetect d=0.25 (analyze/candidates)
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

// Pre-render lint: every lock rule across every scene of a manifest, from
// CACHED perception only. Never triggers an analyze, never writes — a
// file-write hook runs this on each edit.json save, and a lint that quietly
// spent a minute of whisper would get that hook removed within a day. A
// missing index is itself a finding (NO_INDEX): green means verified, never
// unexamined. Waivers (scene tier: scenes[].waivers; project tier: VIDEO.md
// front-matter `rules:`) surface as waived-with-reason — never silently
// dropped — and a waiver without a reason is ignored and reported.
export function lintManifest(manifestPath, {
  scene, analysisDir, videoMd, maxTail, maxLead,
} = {}) {
  const baseDir = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const indexDir = analysisDir ?? manifestAnalysisDir(manifestPath);
  const findings = [];

  const project = projectOverrides(videoMd ?? join(baseDir, "VIDEO.md"), { maxTail, maxLead });
  for (const id of project.reasonless) {
    findings.push({
      rule: "waiver-missing-reason", scene: null,
      detail: `VIDEO.md overrides ${id} without a reason — ignored; every waiver states why`,
      severity: "warn", waived: false, waiverReason: null,
    });
  }
  const { overrides, maxTail: effMaxTail, maxLead: effMaxLead } = project;

  const scenes = (manifest.scenes ?? []).filter((s) => !scene || s.slug === scene);
  // The endpoint law rendered as data, one row per scene — the compact
  // digest a session scans before deciding where to zoom. Verdicts derive
  // from the SAME findings pushed below (never a second implementation of
  // the law): flagged = any unwaived endpoint finding, waived = every
  // endpoint finding carries its written reason.
  const endpoints = [];
  for (const s of scenes) {
    const sceneTier = sceneWaivers(s);
    for (const rule of sceneTier.reasonless) {
      findings.push({
        rule: "waiver-missing-reason", scene: s.slug,
        detail: `waiver for ${rule} has no reason — ignored; every waiver states why`,
        severity: "warn", waived: false, waiverReason: null,
      });
    }
    const push = (id, detail) => {
      const w = waiverFor(id, sceneTier.waive, project.waive);
      findings.push({
        rule: id, scene: s.slug, detail,
        severity: RULE_INDEX.get(id)?.severity ?? "block",
        waived: Boolean(w), waiverReason: w?.reason ?? null,
        ...(w ? { waiverTier: w.tier } : {}),
      });
    };

    const src = s.source ? resolve(baseDir, s.source) : null;
    if (!src || !existsSync(src)) {
      push("NO_INDEX", `source not found: ${s.source ?? "(missing)"} — nothing to verify, nothing to render`);
      endpoints.push({ scene: s.slug, verdict: "no-index" });
      continue;
    }
    // Same cache stem as analyze builds — read-only; a missing or stale
    // index is a finding, never a rebuild.
    const stem = `${basename(src, extname(src))}_${fileStamp(src)}`;
    const index = readJsonOrNull(join(indexDir, `${stem}.analysis.json`));
    if (!index) {
      push("NO_INDEX", `no cached perception index for ${s.source} — run: ripple analyze "${s.source}"`);
      endpoints.push({ scene: s.slug, verdict: "no-index" });
      continue;
    }
    if (index.hasAudio === false) continue; // silent b-roll: no endpoints to verify
    if (typeof s.start !== "number" || typeof s.end !== "number" || s.end <= s.start) continue; // cut's validate owns bounds errors
    if (!index.words) {
      push("NO_WORD_TIMING", index.wordsNote ?? "index has no word timing — endpoint checks ran on silence alone");
    }
    // The index self-reports drift (analyze's stretched-endings check):
    // every endpoint number below may be seconds late. Lint can't
    // re-transcribe (fast and side-effect-free by contract) — candidates'
    // driftCheck is the arbiter, so the finding names it. Waivable per
    // scene once its driftCheck comes back aligned.
    if (index.drift?.suspected) {
      push("DRIFT_SUSPECT",
        `${s.source}'s index self-reports word-timing drift (${index.drift.stretchedEndings} stretched endings, worst ${index.drift.maxStretch}s) — ` +
        `verify this scene's OUT with candidates' driftCheck; waive with the aligned Δ once it clears`);
    }
    const silenceRef = referenceSilences(index).map((sp) => ({ ...sp, end: sp.end ?? index.duration }));
    const timing = index.words ? cutTiming(index.words, silenceRef, { start: s.start, end: s.end }) : null;
    const silence = rangeSilence(index, s.start, s.end);
    const before = findings.length;
    for (const f of endpointFlags(timing, silence, { maxTail: effMaxTail, maxLead: effMaxLead, end: s.end })) {
      push(f.flag, f.detail);
    }
    const sceneFindings = findings.slice(before).filter((f) => f.rule !== "waiver-missing-reason");
    const unwaived = sceneFindings.filter((f) => !f.waived);
    endpoints.push({
      scene: s.slug,
      in: s.start,
      out: s.end,
      duration: round3(s.end - s.start),
      lastWordEnd: timing?.lastWordEnd ?? null,
      tailGap: timing?.tailGap ?? null,
      ...(timing?.nextText ? { nextText: timing.nextText } : {}),
      verdict: unwaived.length ? "flagged"
        : sceneFindings.length ? "waived"
          : !timing || timing.lastWordEnd === null ? "no-words-in-range"
            : "within-law",
    });
  }

  return { findings, overrides, scenes: scenes.map((s) => s.slug), endpoints };
}
