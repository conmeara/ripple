import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { driftCheckFrom, endpointFlags, suggestOut } from "./candidates.mjs";
import { RULE_INDEX, endpointFlags as registryEndpointFlags } from "./rules.mjs";
import { fileStamp, findTool } from "./util.mjs";

// Numbers shaped like the real wedding failure: answer's acoustic end at
// 493.0, next question's clumped words at 499.52.
const GOOD_TIMING = {
  wordsInRange: 12,
  firstWordStart: 465.4,
  leadGap: 0.4,
  straddleStart: null,
  lastWordEnd: 493.0,
  tailGap: 0.8,
  straddleEnd: null,
  nextWordStart: 499.52,
  nextText: "What's your favorite, okay,",
  nextAudioStart: 499.3,
};
const QUIET = { "-35dB": { leading: 0, tail: 1.2, spans: 3 }, "-40dB": { leading: 0, tail: 1.0, spans: 3 } };

test("clean range raises no flags", () => {
  assert.deepEqual(endpointFlags(GOOD_TIMING, QUIET, { maxTail: 1.0, maxLead: 0.5, end: 493.8 }), []);
});

test("tail silence 0 at every threshold is a categorical red flag", () => {
  const silence = { "-35dB": { leading: 0, tail: 0, spans: 2 }, "-40dB": { leading: 0, tail: 0, spans: 2 } };
  const flags = endpointFlags(null, silence, { maxTail: 1.0, maxLead: 0.5, end: 501 });
  assert.equal(flags.length, 1);
  assert.equal(flags[0].flag, "SPEECH_AT_OUT");
});

test("zero tail silence is NOT flagged when word timing shows a clean gap", () => {
  // A tight-but-clean cut (0.3s after the last word) reads as tail:0 to
  // silencedetect's 0.25s floor — the words say it's fine.
  const silence = { "-40dB": { leading: 0, tail: 0, spans: 2 } };
  const clean = { ...GOOD_TIMING, tailGap: 0.3 };
  const flags = endpointFlags(clean, silence, { maxTail: 1.0, maxLead: 0.5, end: 493.3 });
  assert.ok(!flags.some((f) => f.flag === "SPEECH_AT_OUT"));
  // But a straddled end corroborates: flag fires.
  const bad = { ...GOOD_TIMING, straddleEnd: "favorite" };
  const flags2 = endpointFlags(bad, silence, { maxTail: 1.0, maxLead: 0.5, end: 493.3 });
  assert.ok(flags2.some((f) => f.flag === "SPEECH_AT_OUT"));
});

test("the shipped chore cut (end=501) trips NEXT_SPEECH_INSIDE", () => {
  const flags = endpointFlags(GOOD_TIMING, QUIET, { maxTail: 1.0, maxLead: 0.5, end: 501 });
  const names = flags.map((f) => f.flag);
  assert.ok(names.includes("NEXT_SPEECH_INSIDE"));
  assert.ok(flags.find((f) => f.flag === "NEXT_SPEECH_INSIDE").detail.includes("What's your favorite"));
});

test("the shipped married cut (2.45s dead tail) trips DEAD_AIR_TAIL", () => {
  const timing = { ...GOOD_TIMING, lastWordEnd: 776.55, tailGap: 2.45, nextWordStart: null, nextText: null };
  const flags = endpointFlags(timing, QUIET, { maxTail: 1.0, maxLead: 0.5, end: 779 });
  assert.deepEqual(flags.map((f) => f.flag), ["DEAD_AIR_TAIL"]);
});

test("mid-word and late-start flags", () => {
  const t = { ...GOOD_TIMING, straddleEnd: "favorite", straddleStart: "owns", leadGap: 1.2 };
  const names = endpointFlags(t, QUIET, { maxTail: 10, maxLead: 0.5, end: 494 }).map((f) => f.flag);
  assert.ok(names.includes("MID_WORD_OUT"));
  assert.ok(names.includes("MID_WORD_IN"));
  assert.ok(names.includes("LATE_FIRST_WORD"));
});

test("flags are the registry's lock rules, byte-compatible with the pre-registry envelope", () => {
  // candidates and lint must judge a range with the SAME implementation.
  assert.equal(endpointFlags, registryEndpointFlags);
  // A range broken every way at once produces only {flag, detail} entries —
  // no decoration; the flag name itself is the registry id.
  const t = { ...GOOD_TIMING, straddleEnd: "favorite", straddleStart: "owns", leadGap: 1.2, tailGap: 2.45 };
  const silence = { "-40dB": { leading: 0, tail: 0, spans: 1 } };
  const flags = endpointFlags(t, silence, { maxTail: 1.0, maxLead: 0.5, end: 501 });
  assert.equal(flags.length, 6);
  for (const f of flags) {
    assert.deepEqual(Object.keys(f), ["flag", "detail"]);
    assert.equal(RULE_INDEX.get(f.flag)?.phase, "lock", f.flag);
    assert.equal(RULE_INDEX.get(f.flag)?.severity, "block", f.flag);
  }
});

// ---------- end-to-end: project retunes reach the lock gate ----------

const CANDIDATES = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "candidates.mjs")).href;
const ffmpeg = findTool(["ffmpeg"]);

// A project on disk: real synthesized audio (candidates runs a fresh
// silencedetect over the range), a planted perception index (so no whisper),
// optional VIDEO.md. Words end at 2.0s; the range ends at 5.0s → 3s tail.
function candidatesProject({ videoMd } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ripple-cand-"));
  const src = join(dir, "src.wav");
  const gen = spawnSync(ffmpeg, [
    "-hide_banner", "-y", "-v", "error",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=16000",
    "-af", "apad=pad_dur=8", "-t", "10", src,
  ], { encoding: "utf8" });
  assert.equal(gen.status, 0, gen.stderr);
  mkdirSync(join(dir, "work", "analysis"), { recursive: true });
  writeFileSync(
    join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
    JSON.stringify({
      version: 6, file: src, duration: 10, hasAudio: true,
      words: [
        { start: 0.3, end: 0.6, text: "We" },
        { start: 0.7, end: 2.0, text: "met." },
      ],
      silences: { "-40dB": [{ start: 2.0, end: null }] },
      turns: [], // "ran, found none" — keeps a tdrz-capable machine from rebuilding
    })
  );
  if (videoMd) writeFileSync(join(dir, "VIDEO.md"), videoMd);
  return { dir, src };
}

function runCandidates(args, cwd) {
  const res = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `const m = await import(${JSON.stringify(CANDIDATES)}); await m.main(${JSON.stringify(args)});`],
    { encoding: "utf8", cwd }
  );
  let json = null;
  try { json = JSON.parse(res.stdout); } catch { /* asserted by callers */ }
  return { status: res.status, json, stderr: res.stderr };
}

test("candidates honors the VIDEO.md project retune exactly like lint", { skip: !ffmpeg }, () => {
  // The same range must never flag differently at lock and pre-render:
  // candidates once ignored VIDEO.md entirely, so a project that retuned
  // DEAD_AIR_TAIL to 4s blocked at lock while lint passed green.
  const retune = ["---", "rules:", '  DEAD_AIR_TAIL: {maxTail: 4.0, reason: "contemplative piece"}', "---"].join("\n");
  const base = ["src.wav", "--start", "0", "--end", "5", "--no-sheet", "--no-transcribe"];

  const bare = candidatesProject({});
  const flagged = runCandidates(base, bare.dir);
  assert.ok(flagged.json, flagged.stderr);
  assert.ok(flagged.json.flags.some((f) => f.flag === "DEAD_AIR_TAIL"), JSON.stringify(flagged.json.flags));

  const tuned = candidatesProject({ videoMd: retune });
  const clean = runCandidates(base, tuned.dir);
  assert.deepEqual(clean.json.flags, []);
  // The retune is echoed, never silent — same shape as lint's envelope.
  assert.deepEqual(clean.json.overrides, [
    { rule: "DEAD_AIR_TAIL", tier: "project", maxTail: 4, reason: "contemplative piece" },
  ]);

  // An explicit flag outranks the retune (and the echo says so).
  const strict = runCandidates([...base, "--max-tail", "2"], tuned.dir);
  assert.ok(strict.json.flags.some((f) => f.flag === "DEAD_AIR_TAIL"));
  assert.equal(strict.json.overrides[0].superseded, true);
});

test("driftCheckFrom: the q3 numbers — index late by seconds is 'drifted'", () => {
  // Real failure: range 368.6–411.0; the index put lastWordEnd at 411.61
  // while an isolated re-transcription of the same range ended the final
  // word at 404.88 (range-local 36.28). Δ = +6.73s of the speaker's reset.
  const timing = { ...GOOD_TIMING, lastWordEnd: 411.61 };
  const iso = [
    { start: 33.2, end: 34.9, text: "embraced" },
    { start: 35.0, end: 36.28, text: "other." },
  ];
  const dc = driftCheckFrom(timing, iso, { start: 368.6 });
  assert.equal(dc.verdict, "drifted");
  assert.equal(dc.isolatedLastWordEnd, 404.88);
  assert.equal(dc.deltaSeconds, 6.73);
  assert.equal(dc.indexLastWordEnd, 411.61);
});

test("driftCheckFrom: agreement within threshold is 'aligned'; degraded inputs return null", () => {
  const timing = { ...GOOD_TIMING, lastWordEnd: 100.0 };
  const iso = [{ start: 2.0, end: 9.6, text: "done." }];
  assert.equal(driftCheckFrom(timing, iso, { start: 90 }).verdict, "aligned"); // Δ 0.4
  // Inter-run whisper jitter (~0.8s observed on a clean 24s clip) must not
  // trip a blocking flag — the delta is still reported for the editor.
  const jitter = driftCheckFrom(timing, [{ start: 2.0, end: 9.2, text: "done." }], { start: 90 });
  assert.equal(jitter.verdict, "aligned");
  assert.equal(jitter.deltaSeconds, 0.8);
  // Zero-width clumped words carry no timing evidence.
  assert.equal(driftCheckFrom(timing, [{ start: 5, end: 5, text: "ghost" }], { start: 90 }), null);
  assert.equal(driftCheckFrom(timing, [], { start: 90 }), null);
  assert.equal(driftCheckFrom(null, iso, { start: 90 }), null);
  assert.equal(driftCheckFrom({ ...timing, lastWordEnd: null }, iso, { start: 90 }), null);
});

test("INDEX_DRIFT is a registered lock rule that blocks", () => {
  const rule = RULE_INDEX.get("INDEX_DRIFT");
  assert.ok(rule, "INDEX_DRIFT missing from the registry");
  assert.equal(rule.phase, "lock");
  assert.equal(rule.severity, "block");
});

test("suggestOut lands a breath after the last word, capped before next speech", () => {
  assert.equal(suggestOut(GOOD_TIMING), 493.6);
  // Next speech close behind: suggestion backs off.
  const tight = { ...GOOD_TIMING, nextWordStart: 493.5, nextAudioStart: 493.4 };
  assert.equal(suggestOut(tight), 493.25);
  // No clean gap between last word and next sound: no suggestion at all —
  // a nudge into the next speech would be worse than silence.
  const wall = { ...GOOD_TIMING, nextAudioStart: 493.05 };
  assert.equal(suggestOut(wall), null);
  assert.equal(suggestOut(null), null);
  assert.equal(suggestOut({ ...GOOD_TIMING, lastWordEnd: null }), null);
});
