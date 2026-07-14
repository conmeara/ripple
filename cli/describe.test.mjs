import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  budgetSentences, endpointDigest, markFuzzy, motionCharacter, sentenceTable, truncateText,
} from "./describe.mjs";
import { fileStamp, writeJsonAtomic } from "./util.mjs";

// ---------- fixture: the index shape loadAnalysis writes ----------
// Hand-built (whisper costs a minute; the shape is the contract): 30s
// source, three sentences, a 2.2s mid pause, a laugh, one filler, a breath.

const WORDS = [
  { start: 0.5, end: 0.9, text: "We" },
  { start: 0.9, end: 1.3, text: "met" },
  { start: 1.3, end: 1.6, text: "at" },
  { start: 1.6, end: 1.9, text: "the" },
  { start: 1.9, end: 2.3, text: "coffee" },
  { start: 2.3, end: 2.8, text: "shop." },
  { start: 5.0, end: 5.3, text: "Um," },
  { start: 5.3, end: 5.6, text: "it" },
  { start: 5.6, end: 5.9, text: "was" },
  { start: 5.9, end: 6.4, text: "honestly" },
  { start: 6.4, end: 7.1, text: "the" },
  { start: 7.1, end: 8.0, text: "best." },
  { start: 11.0, end: 11.4, text: "It" },
  { start: 11.4, end: 11.9, text: "was" },
  { start: 11.9, end: 14.0, text: "perfect." },
];

function fixtureIndex(file, overrides = {}) {
  return {
    version: 4,
    file,
    duration: 30,
    hasAudio: true,
    options: { thresholds: ["-35dB", "-40dB", "-45dB"], model: null, prompt: null, lang: null, rmsWindow: 0.5, scenes: true },
    snapKey: "-45dB",
    model: "ggml-base.en.bin",
    words: WORDS,
    // The -45dB spans are the snap map (snapKey): word starts were snapped
    // to THEIR ends, so markFuzzy must judge against them — a fixture with
    // empty snap spans once masked describe judging against the wrong tier.
    // Digitally silent pauses read identically at -40 and -45.
    silences: {
      "-35dB": [],
      "-40dB": [
        { start: 2.8, end: 5.0 },
        { start: 8.0, end: 9.0 },
        { start: 14.0, end: null },
      ],
      "-45dB": [
        { start: 2.8, end: 5.0 },
        { start: 8.0, end: 9.0 },
        { start: 14.0, end: null },
      ],
    },
    speech: [
      { start: 0, end: 2.8 },
      { start: 5, end: 8 },
      { start: 9, end: 14 },
    ],
    sentences: [
      { start: 0.5, end: 2.8, text: "We met at the coffee shop.", words: 6, wps: 2.609, terminalPitch: "falling", slopeSemitonesPerSec: -3.1, netSemitones: -1.4, voicedRatio: 0.44, f0Mean: 110 },
      { start: 5.0, end: 8.0, text: "Um, it was honestly the best.", words: 6, wps: 2, terminalPitch: "level", slopeSemitonesPerSec: 0.4, netSemitones: 0.2, voicedRatio: 0.31, f0Mean: 112 },
      { start: 11.0, end: 14.0, text: "It was perfect.", words: 3, wps: 1, terminalPitch: "falling", slopeSemitonesPerSec: -2.8, netSemitones: -1.2, voicedRatio: 0.5, f0Mean: 108 },
    ],
    sentenceEnds: [2.8, 8.0, 14.0],
    fillers: [{ start: 5.0, end: 5.3, text: "Um,", kind: "filler" }],
    nonSpeech: [
      { start: 9.0, end: 10.2, duration: 1.2 },
      { start: 10.4, end: 10.8, duration: 0.4 },
    ],
    breaths: [{ t: 8.1, dur: 0.3, db: -38.2, belowSpeechDb: 12.4, kind: "breath" }],
    turns: null,
    sceneChanges: [11.0],
    motion: {
      fps: 6,
      values: Array.from({ length: 60 }, (_, i) => ({ t: i * 0.5, ydif: i * 0.5 >= 20 && i * 0.5 < 26 ? 8 : 0.5 })),
    },
    rms: { windowSec: 0.5, values: [] },
    ...overrides,
  };
}

// Write a stub source + its cached index; return the source path.
function plantSource(dir, analysisDir, name, indexOverrides = {}, { indexed = true } = {}) {
  const src = join(dir, name);
  writeFileSync(src, `stub ${name}`);
  if (indexed) {
    const stem = `${name.replace(/\.[^.]+$/, "")}_${fileStamp(src)}`;
    writeJsonAtomic(join(analysisDir, `${stem}.analysis.json`), fixtureIndex(src, indexOverrides));
  }
  return src;
}

const DESCRIBE_URL = pathToFileURL(fileURLToPath(new URL("./describe.mjs", import.meta.url))).href;
function runDescribe(args) {
  const script =
    `const m = await import(${JSON.stringify(DESCRIBE_URL)});\n` +
    `await m.main(${JSON.stringify(args)});`;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  let json = null;
  try { json = JSON.parse(res.stdout); } catch {}
  return { status: res.status, json, stderr: res.stderr };
}

function tempSetup() {
  const dir = mkdtempSync(join(tmpdir(), "ripple-describe-"));
  const analysisDir = join(dir, "analysis");
  mkdirSync(analysisDir);
  return { dir, analysisDir };
}

// ---------- pure helpers ----------

test("truncateText keeps the opening and the ending", () => {
  const short = "It was perfect.";
  assert.equal(truncateText(short), short);
  const long = "A".repeat(60) + " middle words that vanish " + "the final phrase survives.";
  const out = truncateText(long);
  assert.ok(out.length < long.length);
  assert.ok(out.includes(" … "));
  assert.ok(out.startsWith("AAAA"));
  assert.ok(out.endsWith("the final phrase survives."));
});

test("sentenceTable pre-computes gapAfter and attaches breaths", () => {
  const rows = sentenceTable(fixtureIndex("/x.mp4"));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.i), [0, 1, 2]);
  assert.deepEqual(rows.map((r) => r.gapAfter), [2.2, 3, 16]); // last gap runs to duration
  assert.deepEqual(rows.map((r) => r.breathAfter), [null, 0.3, null]);
  assert.deepEqual(rows.map((r) => r.terminalPitch), ["falling", "level", "falling"]);
  assert.equal(rows[0].duration, 2.3);
  assert.equal(rows[0].text, "We met at the coffee shop.");
});

test("budgetSentences passes short tables through untouched", () => {
  const rows = sentenceTable(fixtureIndex("/x.mp4"));
  const budget = budgetSentences(rows);
  assert.equal(budget.collapsed, false);
  assert.equal(budget.rows.length, 3);
});

function longRows(n = 50) {
  return Array.from({ length: n }, (_, i) => ({
    i,
    start: i * 10,
    end: i * 10 + (i === 7 ? 2 : 8), // row 7 ends early → 38s gap
    duration: i === 7 ? 2 : 8,
    text: `sentence ${i}`,
    wps: i === 3 ? 1.2 : i === 9 ? 5.5 : 3,
    terminalPitch: "level",
    gapAfter: i === 7 ? 38 : 2,
    breathAfter: null,
  }));
}

test("budgetSentences collapses long tables and keeps the notable rows", () => {
  const budget = budgetSentences(longRows(), { duration: 500 });
  assert.equal(budget.collapsed, true);
  assert.ok(budget.groups.length >= 2 && budget.groups.length <= 30);
  // Group rows self-describe their span and pace.
  assert.equal(budget.groups[0].i0, 0);
  assert.ok(budget.groups[0].sentences >= 1);
  assert.ok(budget.groups.every((g) => g.duration > 0 && g.firstText && g.lastText));
  // The rows an editor navigates by survive in full.
  const gap = budget.notable.find((r) => r.i === 7);
  assert.ok(gap && gap.why.includes("longest-gap"));
  const slow = budget.notable.find((r) => r.i === 3);
  assert.ok(slow && slow.why.includes("slowest"));
  const fast = budget.notable.find((r) => r.i === 9);
  assert.ok(fast && fast.why.includes("fastest"));
});

test("budgetSentences bins by take boundaries when they are usable", () => {
  const budget = budgetSentences(longRows(), { boundaries: [250], duration: 500 });
  assert.equal(budget.collapsed, true);
  assert.equal(budget.groups.length, 2);
  assert.equal(budget.groups[0].i1, 24); // rows 0..24 start before 250
  assert.equal(budget.groups[1].i0, 25);
});

test("markFuzzy flags post-pause and zero-width words only", () => {
  const silences = [
    { start: 2.8, end: 5.0 }, // 2.2s — long enough
    { start: 6.0, end: 6.5 }, // 0.5s — too short to distrust
    { start: 14.0, end: null }, // EOF-open span never marks
  ];
  const words = markFuzzy(
    [
      { start: 1.0, end: 1.4, text: "we" },
      { start: 5.0, end: 5.4, text: "What's" }, // snapped to the silence edge
      { start: 5.4, end: 5.4, text: "your" }, // zero-width clump
      { start: 6.5, end: 6.9, text: "favorite" },
    ],
    silences
  );
  assert.equal(words[0].fuzzy, undefined);
  assert.equal(words[1].fuzzy, true);
  assert.equal(words[2].fuzzy, true);
  assert.equal(words[3].fuzzy, undefined);
});

test("motionCharacter splits still from active and absorbs blips", () => {
  const motion = fixtureIndex("/x.mp4").motion;
  const out = motionCharacter(motion, { duration: 30 });
  assert.deepEqual(out.regions.map((r) => r.character), ["still", "active", "still"]);
  assert.deepEqual(out.regions.map((r) => r.start), [0, 20, 26]);
  assert.equal(out.activeSeconds, 6);
  assert.equal(out.stillSeconds, 24);
  assert.equal(motionCharacter(null), null);
  // One hot bucket inside stillness is a blip, not a character change.
  const blip = motionCharacter({
    values: Array.from({ length: 60 }, (_, i) => ({ t: i * 0.5, ydif: i === 20 ? 9 : 0.5 })),
  }, { duration: 30 });
  assert.deepEqual(blip.regions.map((r) => r.character), ["still"]);
});

test("endpointDigest applies the endpoint law", () => {
  const clean = endpointDigest(
    { lastWordEnd: 2.8, tailGap: 0.6, straddleStart: null, straddleEnd: null, nextWordStart: 5.0, nextText: "Um, it was" },
    { end: 3.4 }
  );
  assert.equal(clean.verdict, "within-law");
  assert.equal(clean.flags, undefined);

  const deadAir = endpointDigest(
    { lastWordEnd: 14, tailGap: 2, straddleStart: null, straddleEnd: null, nextWordStart: null, nextText: null },
    { end: 16 }
  );
  assert.equal(deadAir.verdict, "flagged");
  assert.match(deadAir.flags[0], /DEAD_AIR_TAIL/);

  const leak = endpointDigest(
    { lastWordEnd: 2.8, tailGap: 3.2, straddleStart: null, straddleEnd: null, nextWordStart: 5.0, nextText: "Um, it was" },
    { end: 6 }
  );
  assert.ok(leak.flags.some((f) => /NEXT_SPEECH_INSIDE/.test(f)));

  const midWord = endpointDigest(
    { lastWordEnd: 11.9, tailGap: 0.1, straddleStart: null, straddleEnd: "perfect.", nextWordStart: null, nextText: null },
    { end: 12.5 }
  );
  assert.ok(midWord.flags.some((f) => /MID_WORD_OUT/.test(f)));
});

// ---------- CLI: overview ----------

test("overview digests the cached index: ratio up top, thresholds applied", () => {
  const { dir, analysisDir } = tempSetup();
  const src = plantSource(dir, analysisDir, "take1.mp4");
  const { status, json } = runDescribe([src, "--analysis-dir", analysisDir]);
  assert.equal(status, 0);
  assert.equal(json.ok, true);
  assert.equal(json.mode, "overview");
  assert.equal(json.duration, 30);
  assert.equal(json.speech.seconds, 10.8);
  assert.equal(json.speech.ratio, 0.36);
  assert.equal(json.speech.silenceSeconds, 19.2);
  // Silences above ~1s only, with bounds and pre-computed durations.
  assert.deepEqual(json.silences, [
    { start: 2.8, end: 5, duration: 2.2 },
    { start: 8, end: 9, duration: 1 },
    { start: 14, end: 30, duration: 16 },
  ]);
  // nonSpeech sorted by duration (reaction-beat candidates first).
  assert.deepEqual(json.nonSpeech.map((s) => s.duration), [1.2, 0.4]);
  assert.deepEqual(json.fillers, { count: 1, removableSeconds: 0.3, kinds: { filler: 1 } });
  assert.deepEqual(json.takes.sceneChanges, { count: 1, times: [11] });
  assert.equal(json.takes.turns, null);
  assert.equal(json.collapsed, false);
  assert.equal(json.sentences.length, 3);
  assert.equal(json.sentences[1].gapAfter, 3);
  assert.equal(json.sentences[1].breathAfter, 0.3);
  assert.deepEqual(json.motion.regions.map((r) => r.character), ["still", "active", "still"]);
});

test("overview collapses the sentence table past the token budget", () => {
  const { dir, analysisDir } = tempSetup();
  const sentences = Array.from({ length: 60 }, (_, i) => ({
    start: i * 10, end: i * 10 + 8, text: `sentence ${i}`, words: 10, wps: 3,
  }));
  const src = plantSource(dir, analysisDir, "long.mp4", {
    duration: 600,
    words: [],
    silences: { "-40dB": [] },
    speech: [{ start: 0, end: 600 }],
    sentences,
    sentenceEnds: sentences.map((s) => s.end),
    fillers: [],
    nonSpeech: [],
    breaths: [],
    sceneChanges: [],
    motion: null,
  });
  const { status, json } = runDescribe([src, "--analysis-dir", analysisDir]);
  assert.equal(status, 0);
  assert.equal(json.sentencesTotal, 60);
  assert.equal(json.collapsed, true);
  assert.equal(json.sentences, undefined);
  assert.ok(json.groups.length >= 2 && json.groups.length <= 30);
  assert.ok(Array.isArray(json.notable));
  assert.ok(json.hints.some((h) => /notable/.test(h)));
});

// ---------- CLI: zoom ----------

test("zoom returns word-level detail with fuzzy marks and sentence bounds", () => {
  const { dir, analysisDir } = tempSetup();
  const src = plantSource(dir, analysisDir, "take1.mp4");
  const { status, json } = runDescribe([src, "--around", "5.5", "--span", "5", "--analysis-dir", analysisDir]);
  assert.equal(status, 0);
  assert.equal(json.mode, "zoom");
  assert.deepEqual(json.window, { start: 3, end: 8, span: 5 });
  assert.equal(json.words.length, 6);
  assert.equal(json.words[0].text, "Um,");
  assert.equal(json.words[0].fuzzy, true); // resumes right at the 2.2s silence edge
  assert.ok(json.words.slice(1).every((w) => w.fuzzy === undefined));
  assert.deepEqual(json.silences, [{ start: 2.8, end: 5, duration: 2.2 }]);
  assert.deepEqual(json.breaths, []); // 8.1s breath sits just past the window
  assert.equal(json.sentenceBefore.end, 2.8);
  assert.match(json.sentenceBefore.text, /coffee shop\.$/);
  assert.equal(json.sentenceAfter.start, 11);
  assert.match(json.sentenceAfter.text, /^It was perfect\./);
});

test("zoom judges fuzzy against the snap map, not the reference spans", () => {
  // On a fade-in the -45dB (snap) span ends BEFORE the -40dB (reference)
  // span: analyze snapped the word start to 10.0 (the -45 end), and judging
  // against the -40 spans (end 10.6) left the repaired timestamp unmarked —
  // the digest presented a snap as a measurement.
  const { dir, analysisDir } = tempSetup();
  const src = plantSource(dir, analysisDir, "fade.mp4", {
    words: [{ start: 10.0, end: 10.4, text: "your" }],
    silences: {
      "-35dB": [],
      "-40dB": [{ start: 7.9, end: 10.6 }],
      "-45dB": [{ start: 8.0, end: 10.0 }],
    },
    sentences: [{ start: 10.0, end: 10.4, text: "your", words: 1, wps: 2.5 }],
    sentenceEnds: [10.4],
    fillers: [],
    nonSpeech: [],
    breaths: [],
  });
  const { status, json } = runDescribe([src, "--around", "10", "--span", "4", "--analysis-dir", analysisDir]);
  assert.equal(status, 0);
  assert.equal(json.words[0].fuzzy, true); // snapped to the -45 span end
});

test("zoom --start/--end clamps to the file and rejects empty windows", () => {
  const { dir, analysisDir } = tempSetup();
  const src = plantSource(dir, analysisDir, "take1.mp4");
  const ok = runDescribe([src, "--start", "9", "--end", "99", "--analysis-dir", analysisDir]);
  assert.equal(ok.status, 0);
  assert.equal(ok.json.window.end, 30);
  const bad = runDescribe([src, "--start", "9", "--end", "9", "--analysis-dir", analysisDir]);
  assert.equal(bad.status, 2);
  assert.equal(bad.json.ok, false);
});

// ---------- CLI: manifest ----------

test("manifest mode renders the timeline as text with endpoint-law checks", () => {
  const { dir, analysisDir } = tempSetup();
  plantSource(dir, analysisDir, "src.mp4");
  plantSource(dir, analysisDir, "other.mp4", {}, { indexed: false });
  const manifestPath = join(dir, "edit.json");
  writeJsonAtomic(manifestPath, {
    version: 1,
    scenes: [
      { id: 1, slug: "met", source: "src.mp4", start: 0.5, end: 3.4, status: "locked", reasoning: "clean take, falling close", card: "How did you meet?", cardDuration: 2.5 },
      { id: 2, slug: "perfect", source: "src.mp4", start: 11, end: 16, status: "proposed", reasoning: "single take" },
      { id: 3, slug: "other", source: "other.mp4", start: 0, end: 5, status: "proposed" },
    ],
  });
  const { status, json } = runDescribe(["--manifest", manifestPath, "--analysis-dir", analysisDir]);
  assert.equal(status, 0);
  assert.equal(json.mode, "manifest");
  assert.equal(json.scenes.length, 3);

  const met = json.scenes[0];
  assert.equal(met.in, 0.5);
  assert.equal(met.out, 3.4);
  assert.equal(met.duration, 2.9);
  assert.equal(met.lastWordEnd, 2.8);
  assert.equal(met.tailGap, 0.6);
  assert.equal(met.endpoint, "within-law");
  assert.match(met.nextText, /^Um,/); // the next take's opening, for the leak check

  const perfect = json.scenes[1];
  assert.equal(perfect.endpoint, "flagged");
  assert.match(perfect.flags[0], /DEAD_AIR_TAIL: 2s/);

  const other = json.scenes[2];
  assert.match(other.note, /ripple analyze/);
  assert.equal(other.reasoning, null); // a missing reasoning stays visible

  assert.deepEqual(json.totals, {
    scenes: 3, contentSeconds: 12.9, cards: 1, cardSeconds: 2.5, timelineSeconds: 15.4,
  });
});

test("manifest mode applies lint's waiver accounting: waived renders with its reason", () => {
  const { dir, analysisDir } = tempSetup();
  plantSource(dir, analysisDir, "src.mp4");
  const manifestPath = join(dir, "edit.json");
  writeJsonAtomic(manifestPath, {
    version: 1,
    scenes: [
      {
        id: 1, slug: "held", source: "src.mp4", start: 11, end: 16, status: "locked", reasoning: "r",
        waivers: [{ rule: "DEAD_AIR_TAIL", reason: "she looks at the photo — the silence is the scene" }],
      },
      { id: 2, slug: "bare", source: "src.mp4", start: 11, end: 16, status: "proposed", reasoning: "r" },
    ],
  });
  const { status, json } = runDescribe(["--manifest", manifestPath, "--analysis-dir", analysisDir]);
  assert.equal(status, 0);

  const held = json.scenes[0];
  assert.equal(held.endpoint, "waived");
  assert.equal(held.flags, undefined);
  assert.equal(held.waived.length, 1);
  assert.match(held.waived[0].flag, /^DEAD_AIR_TAIL: 2s/);
  assert.match(held.waived[0].waiverReason, /silence is the scene/);
  assert.equal(held.waived[0].waiverTier, "scene");

  // The identical range without the waiver still flags — waivers never leak.
  const bare = json.scenes[1];
  assert.equal(bare.endpoint, "flagged");
  assert.match(bare.flags[0], /^DEAD_AIR_TAIL/);
  assert.equal(bare.waived, undefined);
});

test("manifest mode honors VIDEO.md project-tier retunes exactly like lint", () => {
  const { dir, analysisDir } = tempSetup();
  plantSource(dir, analysisDir, "src.mp4");
  writeFileSync(join(dir, "VIDEO.md"), [
    "---",
    "rules:",
    '  DEAD_AIR_TAIL: {maxTail: 2.5, reason: "contemplative piece, long tails"}',
    "---",
    "# VIDEO.md",
  ].join("\n"));
  const manifestPath = join(dir, "edit.json");
  writeJsonAtomic(manifestPath, {
    version: 1,
    scenes: [{ id: 1, slug: "perfect", source: "src.mp4", start: 11, end: 16, status: "locked", reasoning: "r" }],
  });
  const { json } = runDescribe(["--manifest", manifestPath, "--analysis-dir", analysisDir]);
  // The 2s tail sits under the retuned 2.5s bound: within-law here exactly
  // as at the lint gate, and the hint states the effective bound.
  assert.equal(json.scenes[0].endpoint, "within-law");
  assert.equal(json.scenes[0].flags, undefined);
  assert.ok(json.hints.some((h) => h.includes("2.5s")));
});

test("a mid-edit scene without `source` is a note, never a crash", () => {
  // The lint hook's whole audience is manifests that don't yet satisfy the
  // schema; describe must report the same manifest lint handles gracefully
  // — an unguarded resolve(baseDir, undefined) once threw a raw stack with
  // zero bytes on stdout.
  const { dir, analysisDir } = tempSetup();
  const manifestPath = join(dir, "edit.json");
  writeJsonAtomic(manifestPath, {
    version: 1,
    scenes: [{ id: 1, slug: "card-open", card: "Welcome", start: 0, end: 2.5 }],
  });
  const { status, json } = runDescribe(["--manifest", manifestPath, "--analysis-dir", analysisDir]);
  assert.equal(status, 0);
  assert.equal(json.ok, true);
  assert.match(json.scenes[0].note, /source not found: \(missing\)/);
});

test("manifest mode defaults the analysis dir to the manifest's root, not the cwd", () => {
  // The child process runs from the repo, not the fixture project: the
  // cached index must still be found next to the manifest (a cwd anchor
  // once made describe and lint contradict each other on one manifest).
  const dir = mkdtempSync(join(tmpdir(), "ripple-describe-"));
  const analysisDir = join(dir, "work", "analysis");
  mkdirSync(analysisDir, { recursive: true });
  plantSource(dir, analysisDir, "src.mp4");
  const manifestPath = join(dir, "edit.json");
  writeJsonAtomic(manifestPath, {
    version: 1,
    scenes: [{ id: 1, slug: "met", source: "src.mp4", start: 0.5, end: 3.4, status: "locked", reasoning: "r" }],
  });
  const { status, json } = runDescribe(["--manifest", manifestPath]); // no --analysis-dir
  assert.equal(status, 0);
  assert.equal(json.scenes[0].endpoint, "within-law"); // index found, verdict rendered
  assert.equal(json.scenes[0].note, undefined);
});

test("--out creates the parent directory like every other --out command", () => {
  const { dir, analysisDir } = tempSetup();
  const src = plantSource(dir, analysisDir, "take1.mp4");
  const out = join(dir, "reports", "digest.json");
  const { status, json } = runDescribe([src, "--analysis-dir", analysisDir, "--out", out]);
  assert.equal(status, 0);
  assert.equal(json.saved, out);
  assert.equal(JSON.parse(readFileSync(out, "utf8")).mode, "overview");
});

test("manifest --scene filters to one scene; unknown slug is a usage error", () => {
  const { dir, analysisDir } = tempSetup();
  plantSource(dir, analysisDir, "src.mp4");
  const manifestPath = join(dir, "edit.json");
  writeJsonAtomic(manifestPath, {
    version: 1,
    scenes: [
      { id: 1, slug: "met", source: "src.mp4", start: 0.5, end: 3.4, status: "locked", reasoning: "r" },
      { id: 2, slug: "perfect", source: "src.mp4", start: 11, end: 14.6, status: "locked", reasoning: "r" },
    ],
  });
  const one = runDescribe(["--manifest", manifestPath, "--scene", "perfect", "--analysis-dir", analysisDir]);
  assert.equal(one.status, 0);
  assert.equal(one.json.scenes.length, 1);
  assert.equal(one.json.scenes[0].slug, "perfect");
  const missing = runDescribe(["--manifest", manifestPath, "--scene", "nope", "--analysis-dir", analysisDir]);
  assert.equal(missing.status, 2);
  assert.equal(missing.json.ok, false);
});

// ---------- CLI: envelopes ----------

test("missing index is a directive envelope, not a build trigger", () => {
  const { dir, analysisDir } = tempSetup();
  const src = plantSource(dir, analysisDir, "cold.mp4", {}, { indexed: false });
  const { status, json } = runDescribe([src, "--analysis-dir", analysisDir]);
  assert.equal(status, 1);
  assert.equal(json.ok, false);
  assert.match(json.error.message, /ripple analyze/);
  assert.match(json.error.fix, /^ripple analyze /);
});

test("usage errors exit 2 with a JSON envelope", () => {
  const none = runDescribe([]);
  assert.equal(none.status, 2);
  assert.equal(none.json.ok, false);
  const orphanScene = runDescribe(["--scene", "x"]);
  assert.equal(orphanScene.status, 2);
  assert.match(orphanScene.json.error.message, /--scene needs --manifest/);
});
