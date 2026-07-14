import assert from "node:assert/strict";
import { test } from "node:test";
import { endpointFlags, suggestOut } from "./candidates.mjs";

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
