import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampWordEnds, cutTiming, dtwPreset, fillerSpans, nonSpeechSpans,
  parseMetadataTrack, parseWhisperWords, sceneChangesFromMotion, snapWords, snapWordStarts,
  sentenceEnds, sentenceSpans, subtractSpans,
} from "./timing.mjs";

// Fixture shaped like the real wedding-session failure (scene "chore"):
// answer ends, ~6s look-down silence, then the next question is quietly
// read — whisper stretches the last word across the silence and clumps the
// resumed words at one timestamp.
const WORDS = [
  { start: 490.9, end: 491.31, text: "owns" },
  { start: 491.31, end: 491.47, text: "the" },
  { start: 491.47, end: 491.84, text: "toilet." },
  { start: 491.84, end: 492.04, text: "God," },
  { start: 492.04, end: 492.2, text: "she" },
  { start: 492.2, end: 492.36, text: "loves" },
  { start: 492.36, end: 492.6, text: "that" },
  { start: 492.6, end: 494.8, text: "toilet." }, // end absorbed 1.8s of silence
  { start: 499.52, end: 499.52, text: "What's" }, // clumped after the pause
  { start: 499.52, end: 499.52, text: "your" },
  { start: 499.52, end: 500.04, text: "favorite," },
  { start: 500.04, end: 500.32, text: "okay," },
];
const SILENCES = [{ start: 493.0, end: 499.3 }];

test("parseWhisperWords normalizes and filters annotations", () => {
  const words = parseWhisperWords({
    transcription: [
      { offsets: { from: 1000, to: 1500 }, text: " hello" },
      { offsets: { from: 1500, to: 1600 }, text: "  " },
      { offsets: { from: 2000, to: 2400 }, text: " [coughing]" },
      { offsets: { from: 2500, to: 2600 }, text: " (laughs)" },
      { offsets: { from: 3000, to: 3200 }, text: " world." },
    ],
  });
  assert.deepEqual(words, [
    { start: 1, end: 1.5, text: "hello" },
    { start: 3, end: 3.2, text: "world." },
  ]);
});

test("clampWordEnds trims a word end absorbed into silence", () => {
  const clamped = clampWordEnds(WORDS, SILENCES);
  assert.equal(clamped[7].end, 493.0); // "toilet." 494.8 → 493.0
  assert.equal(clamped[6].end, 492.6); // untouched
});

test("cutTiming on the shipped bad cut (end=501) exposes the leak", () => {
  const t = cutTiming(WORDS, SILENCES, { start: 490, end: 501 });
  // The numbers say speech runs to 500.32 — 7.3s past the answer's real end
  // (493.0). A cut claiming "ends with 'toilet.'" is contradicted by data.
  assert.equal(t.wordsInRange, 12);
  assert.equal(t.lastWordEnd, 500.32);
  assert.equal(t.tailGap, 0.68);
});

test("cutTiming on a correct cut reports the true tail", () => {
  const t = cutTiming(WORDS, SILENCES, { start: 490, end: 495.8 });
  assert.equal(t.lastWordEnd, 493.0); // acoustic end, not whisper's 494.8
  assert.equal(t.tailGap, 2.8); // real dead air inside the cut
  assert.equal(t.nextWordStart, 499.52);
  assert.equal(t.nextText, "What's your favorite, okay,");
  assert.equal(t.nextAudioStart, 499.3); // silencedetect beats clumped words
  assert.equal(t.straddleEnd, null);
});

test("cutTiming flags a mid-word cut", () => {
  const t = cutTiming(WORDS, SILENCES, { start: 490, end: 492.5 });
  assert.equal(t.straddleEnd, "that"); // 492.36–492.6 crosses end
  assert.equal(t.lastWordEnd, 492.36);
});

test("cutTiming start-side: leadGap and straddleStart", () => {
  const t1 = cutTiming(WORDS, SILENCES, { start: 490.0, end: 493 });
  assert.equal(t1.firstWordStart, 490.9);
  assert.equal(t1.leadGap, 0.9);
  assert.equal(t1.straddleStart, null);
  const t2 = cutTiming(WORDS, SILENCES, { start: 491.0, end: 493 });
  assert.equal(t2.straddleStart, "owns"); // 490.9–491.31 crosses start
  assert.equal(t2.leadGap, 0);
});

test("cutTiming with no words in range", () => {
  const t = cutTiming(WORDS, SILENCES, { start: 495, end: 499 });
  assert.equal(t.wordsInRange, 0);
  assert.equal(t.lastWordEnd, null);
  assert.equal(t.tailGap, null);
});

test("subtractSpans handles overlap, containment, and null ends", () => {
  assert.deepEqual(
    subtractSpans([{ start: 0, end: 10 }], [{ start: 2, end: 4 }, { start: 8, end: null }]),
    [{ start: 0, end: 2 }, { start: 4, end: 8 }]
  );
  assert.deepEqual(subtractSpans([{ start: 0, end: 5 }], [{ start: 0, end: 5 }]), []);
});

test("nonSpeechSpans finds audible-but-wordless regions (the laugh finder)", () => {
  // Audio active 0–10 except silence 4–6; words cover 0–3.5.
  const spans = nonSpeechSpans(
    [{ start: 4, end: 6 }],
    [{ start: 0, end: 3.5, text: "hello there" }],
    { start: 0, end: 10 }
  );
  assert.deepEqual(spans, [
    { start: 3.5, end: 4, duration: 0.5 },
    { start: 6, end: 10, duration: 4 },
  ]);
});

test("sentenceEnds fires on punctuation and on real gaps", () => {
  const ends = sentenceEnds(WORDS, SILENCES);
  assert.ok(ends.includes(491.84)); // "toilet." (punctuated)
  assert.ok(ends.includes(493.0)); // clamped "toilet." + 6s gap
  assert.ok(!ends.includes(492.04)); // "God," continues
});

test("sentenceSpans groups words and reports pace", () => {
  const sentences = sentenceSpans(WORDS, SILENCES);
  assert.equal(sentences[0].text, "owns the toilet.");
  assert.equal(sentences[0].start, 490.9);
  assert.equal(sentences[0].end, 491.84);
  assert.equal(sentences[0].words, 3);
  assert.ok(sentences[0].wps > 2 && sentences[0].wps < 4);
  assert.equal(sentences[1].text, "God, she loves that toilet.");
});

test("fillerSpans catches vocalized pauses and restarts, not real words", () => {
  const words = [
    { start: 0, end: 0.3, text: "Um," },
    { start: 0.4, end: 0.7, text: "she" },
    { start: 0.8, end: 1.1, text: "she" },
    { start: 1.2, end: 1.5, text: "likes" },
    { start: 1.6, end: 1.9, text: "like" },
  ];
  const spans = fillerSpans(words);
  assert.deepEqual(spans.map((s) => [s.text, s.kind]), [
    ["Um,", "filler"],
    ["she", "restart"],
  ]);
});

test("parseMetadataTrack reads pts_time/value pairs incl. -inf", () => {
  const track = parseMetadataTrack(
    "frame:0    pts:0       pts_time:0\n" +
      "lavfi.astats.Overall.RMS_level=-33.419458\n" +
      "frame:1    pts:8000    pts_time:0.5\n" +
      "lavfi.astats.Overall.RMS_level=-inf\n",
    "RMS_level"
  );
  assert.deepEqual(track, [
    { t: 0, value: -33.419 },
    { t: 0.5, value: -120 },
  ]);
});

test("dtwPreset maps ggml filenames, incl. quantized, unknown → null", () => {
  assert.equal(dtwPreset("/x/ggml-base.en.bin"), "base.en");
  assert.equal(dtwPreset("/x/ggml-large-v3-turbo.bin"), "large.v3.turbo");
  assert.equal(dtwPreset("/x/ggml-small.en-q5_1.bin"), "small.en");
  assert.equal(dtwPreset("/x/ggml-custom-ft.bin"), null);
  assert.equal(dtwPreset("/x/model.gguf"), null);
});

test("sceneChangesFromMotion finds outlier spikes with a refractory gap", () => {
  const track = Array.from({ length: 600 }, (_, i) => ({
    t: i / 6,
    value: i === 120 ? 80 : i === 121 ? 60 : i === 400 ? 90 : 3 + (i % 5),
  }));
  const changes = sceneChangesFromMotion(track);
  assert.deepEqual(changes, [20, 400 / 6]); // 121 suppressed by minGap
  assert.deepEqual(sceneChangesFromMotion([]), []);
  // A static talking head (all low, low variance) yields no changes.
  const flat = Array.from({ length: 100 }, (_, i) => ({ t: i, value: 4 }));
  assert.deepEqual(sceneChangesFromMotion(flat), []);
});

test("snapWordStarts pushes drifted word starts out of silence (real case)", () => {
  // Whole-file whisper smeared the resumed question across a 6.8s silence.
  const words = [
    { start: 492.21, end: 492.92, text: "toilet." },
    { start: 492.99, end: 494.93, text: "What's" }, // fully inside silence (20ms after onset)
    { start: 494.93, end: 496.24, text: "your" },
    { start: 496.24, end: 499.92, text: "favorite?" }, // starts inside, ends after
    { start: 499.92, end: 500.39, text: "Okay," }, // real word after resume
  ];
  const silences = [{ start: 492.928, end: 499.717 }];
  const snapped = snapWordStarts(words, silences);
  assert.deepEqual(snapped[0], words[0]); // real word barely overlapping: untouched
  assert.equal(snapped[1].start, 499.717); // phantom, collapsed to resume point
  assert.equal(snapped[1].end, 499.717);
  assert.equal(snapped[3].start, 499.717); // 88% inside → snapped, keeps its end
  assert.equal(snapped[3].end, 499.92);
  assert.deepEqual(snapped[4], words[4]); // after resume: untouched
});

test("snapWordStarts leaves words in soft speech alone (low overlap)", () => {
  // Silence covers only a third of the word: it's a real word with a pause.
  const words = [{ start: 10, end: 13, text: "wellllll" }];
  const snapped = snapWordStarts(words, [{ start: 11.8, end: 12.8 }]);
  assert.deepEqual(snapped, words);
});

test("snapWords end-to-end restores acoustic truth on the chore cut", () => {
  const words = [
    { start: 492.21, end: 494.8, text: "toilet." }, // end absorbed silence
    { start: 492.99, end: 494.93, text: "What's" }, // start drifted into it
  ];
  const silences = [{ start: 492.928, end: 499.717 }];
  const snapped = snapWords(words, silences);
  assert.equal(snapped[0].end, 492.928); // clamped to silence onset
  assert.equal(snapped[1].start, 499.717); // snapped to resume
});

test("snapWords re-sorts after snapping reorders words", () => {
  // The phantom jumps past its unsnapped neighbor: order must be restored.
  const words = [
    { start: 10.0, end: 10.5, text: "before" },
    { start: 10.6, end: 14.9, text: "phantom" }, // mostly inside silence → snapped to 15
    { start: 12.0, end: 16.5, text: "partial" }, // 62% inside → snapped to 15, keeps end
    { start: 15.2, end: 15.6, text: "after" },
  ];
  const snapped = snapWords(words, [{ start: 10.55, end: 15.0 }]);
  const starts = snapped.map((w) => w.start);
  assert.deepEqual([...starts].sort((a, b) => a - b), starts); // sorted
  assert.equal(snapped[0].text, "before");
});
