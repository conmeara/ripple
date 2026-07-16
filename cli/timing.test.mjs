import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampWordEnds, cutTiming, dtwPreset, fillerSpans, markSuspectWords, nonSpeechSpans,
  parseMetadataTrack, parseWhisperWords, sceneChangesFromMotion, snapWords, snapWordStarts,
  sentenceEnds, sentenceSpans, stretchedEndings, subtractSpans,
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

// Whisper's classic outro fabrication: real speech ends at 10.4, the room
// stays silent to EOF, and "Thanks for watching." appears written across
// the dead air. The rms track corroborates: energy until ~10.7, floor after.
const OUTRO_WORDS = [
  { start: 10.0, end: 10.4, text: "done." },
  { start: 15.0, end: 15.5, text: "Thanks" },
  { start: 15.5, end: 15.9, text: "for" },
  { start: 15.9, end: 16.6, text: "watching." },
];
const OUTRO_SILENCES = [{ start: 10.7, end: null }]; // runs to EOF
const OUTRO_RMS = Array.from({ length: 60 }, (_, i) => {
  const t = i * 0.5;
  return { t, db: t < 10.7 ? -20 : -70 };
});

test("markSuspectWords flags fabrications inside trailing silence, in place", () => {
  const marked = markSuspectWords(OUTRO_WORDS, {
    silences: OUTRO_SILENCES, rms: OUTRO_RMS, rmsWindow: 0.5, duration: 30, floorDb: -45,
  });
  assert.equal(marked.length, 4); // flagged, never deleted
  assert.equal(marked[0].suspect, undefined);
  assert.deepEqual(marked.slice(1).map((w) => w.suspectReason),
    ["in-silence", "in-silence", "in-silence"]);
});

test("a quiet real word OVERLAPPING silence is never suspect — containment only", () => {
  // Trails into the silence but starts in speech: overlap, not containment.
  const words = [{ start: 10.5, end: 11.2, text: "yeah" }];
  const marked = markSuspectWords(words, {
    silences: [{ start: 10.7, end: 14 }], rms: OUTRO_RMS, duration: 30,
  });
  assert.equal(marked[0].suspect, undefined);
});

test("rms energy vetoes an in-silence verdict — both signals must agree", () => {
  const words = [{ start: 15, end: 15.5, text: "hello" }];
  const marked = markSuspectWords(words, {
    silences: [{ start: 14, end: 17 }], rms: [{ t: 15, db: -30 }], duration: 30,
  });
  assert.equal(marked[0].suspect, undefined);
});

test("no rms samples over the word means no verdict — marking needs positive evidence", () => {
  const words = [{ start: 15, end: 15.5, text: "hello" }];
  const marked = markSuspectWords(words, {
    silences: [{ start: 14, end: 17 }], rms: [], duration: 30,
  });
  assert.equal(marked[0].suspect, undefined);
});

test("zero-width phantoms snapped to the resume point stay real (their text is nextText)", () => {
  const words = [{ start: 17, end: 17, text: "What's" }];
  const marked = markSuspectWords(words, {
    silences: [{ start: 14, end: 17 }], rms: OUTRO_RMS, duration: 30,
  });
  assert.equal(marked[0].suspect, undefined);
});

test("a mid-file fabrication stranded inside a closed silence is suspect", () => {
  // Whisper wrote "Thanks for watching." over 20s of measured mid-file dead
  // air. Marking used to run after snapWords, which parked the fabrication
  // zero-width at the resume point where the boundary exemption cleared it —
  // and the phrase came back as a timestamped search hit / caption /
  // sentence. Marking now reads the RAW placement: the chain ends 13s
  // before audio resumes, so it cannot be smeared real speech.
  const words = [
    { start: 89.0, end: 90.2, text: "done." },
    { start: 100.0, end: 100.6, text: "Thanks" },
    { start: 100.6, end: 101.0, text: "for" },
    { start: 101.0, end: 101.8, text: "watching." },
    { start: 115.2, end: 115.6, text: "Next" },
  ];
  const silences = [{ start: 90.6, end: 115.0 }];
  const rms = Array.from({ length: 300 }, (_, i) => {
    const t = i * 0.5;
    return { t, db: t > 90.6 && t < 114.5 ? -70 : -20 };
  });
  const marked = markSuspectWords(words, { silences, rms, rmsWindow: 0.5, duration: 300 });
  assert.deepEqual(marked.slice(1, 4).map((w) => w.suspectReason),
    ["in-silence", "in-silence", "in-silence"]);
  assert.equal(marked[0].suspect, undefined);
  assert.equal(marked[4].suspect, undefined);
  // Through the real pipeline order (mark, then snap): still flagged, and
  // sentence consumers never see the phrase nobody spoke.
  const snapped = snapWords(marked, silences);
  assert.ok(snapped.filter((w) => w.suspect).length === 3);
  const sentences = sentenceSpans(snapped, silences);
  assert.ok(!sentences.some((s) => /Thanks for watching/.test(s.text)), JSON.stringify(sentences));
});

test("whisper's backward smear of resumed speech is NOT suspect — its chain reaches the resume", () => {
  // The chore-cut shape: real resumed speech spread across the pause, last
  // word crossing the silence end. The rms over the smeared placements is
  // genuinely dead (the audio lives at the resume), so only the chain test
  // separates this from a fabrication — flagging it would erase nextText
  // and bring the next-question leak back.
  const words = [
    { start: 492.21, end: 492.92, text: "toilet." },
    { start: 492.99, end: 494.93, text: "What's" },
    { start: 494.93, end: 496.24, text: "your" },
    { start: 496.24, end: 499.92, text: "favorite?" },
  ];
  const silences = [{ start: 492.928, end: 499.717 }];
  const rms = Array.from({ length: 40 }, (_, i) => {
    const t = 490 + i * 0.5;
    return { t, db: t > 493 && t < 499.5 ? -70 : -20 };
  });
  const marked = markSuspectWords(words, { silences, rms, rmsWindow: 0.5, duration: 520 });
  assert.ok(marked.every((w) => !w.suspect), JSON.stringify(marked));
});

test("a phantom snapped to EOF is suspect — nothing resumes at the last sample", () => {
  // Some ffmpeg builds close the trailing silence span at EOF instead of
  // leaving end null; the snap then parks the fabrication at duration.
  const words = [{ start: 16.48, end: 16.48, text: "watching." }];
  const marked = markSuspectWords(words, {
    silences: [{ start: 10.7, end: 16.48 }], rms: OUTRO_RMS, duration: 16.48,
  });
  assert.equal(marked[0].suspectReason, "in-silence");
});

test("markSuspectWords flags an island word over a continuous music bed", () => {
  // Music bed from 5.2s on: silencedetect sees nothing, but "you" at 14s
  // has no speech neighbor and no pause within 2s on either side.
  const words = [
    { start: 4.0, end: 4.3, text: "enjoy" },
    { start: 4.3, end: 4.6, text: "this." },
    { start: 14.0, end: 14.5, text: "you" },
  ];
  const marked = markSuspectWords(words, {
    silences: [{ start: 4.7, end: 5.2 }], duration: 30, rms: [],
  });
  assert.equal(marked[0].suspect, undefined);
  assert.equal(marked[1].suspect, undefined);
  assert.equal(marked[2].suspectReason, "over-music");
});

test("an isolated real interjection after a pause is not over-music — its flank has silence", () => {
  const words = [{ start: 14, end: 14.4, text: "Okay." }];
  const marked = markSuspectWords(words, {
    silences: [{ start: 11, end: 13.5 }, { start: 15, end: 18 }], duration: 30, rms: [],
  });
  assert.equal(marked[0].suspect, undefined);
});

test("words with a speech neighbor inside the island radius are never over-music", () => {
  // Real voice-over on a music bed: the words protect each other.
  const words = [
    { start: 12.8, end: 13.2, text: "real" },
    { start: 14.0, end: 14.5, text: "voice" },
  ];
  const marked = markSuspectWords(words, { silences: [], duration: 30, rms: [] });
  assert.equal(marked[0].suspect, undefined);
  assert.equal(marked[1].suspect, undefined);
});

test("cutTiming ignores suspects — a fabrication cannot corrupt lastWordEnd", () => {
  const marked = markSuspectWords(OUTRO_WORDS, {
    silences: OUTRO_SILENCES, rms: OUTRO_RMS, duration: 30,
  });
  const t = cutTiming(marked, [{ start: 10.7, end: 30 }], { start: 8, end: 20 });
  assert.equal(t.wordsInRange, 1);
  assert.equal(t.lastWordEnd, 10.4); // "done.", not the fabricated "watching." at 16.6
  assert.equal(t.nextWordStart, null); // nothing real follows
  assert.equal(t.nextText, null);
});

test("sentence bounds ignore suspects", () => {
  const marked = markSuspectWords(OUTRO_WORDS, {
    silences: OUTRO_SILENCES, rms: OUTRO_RMS, duration: 30,
  });
  const sentences = sentenceSpans(marked, [{ start: 10.7, end: 30 }]);
  assert.equal(sentences.length, 1);
  assert.equal(sentences[0].text, "done.");
  assert.deepEqual(sentenceEnds(marked, [{ start: 10.7, end: 30 }]), [10.4]);
});

test("nonSpeechSpans: a fabricated word cannot hide the music sting it sits on", () => {
  // Audible 0–4 and 6–10; the suspect at 6–6.5 must not carve the sting in two.
  const spans = nonSpeechSpans(
    [{ start: 4, end: 6 }],
    [
      { start: 0, end: 3.5, text: "hello there" },
      { start: 6, end: 6.5, text: "you", suspect: true, suspectReason: "over-music" },
    ],
    { start: 0, end: 10 }
  );
  assert.deepEqual(spans, [
    { start: 3.5, end: 4, duration: 0.5 },
    { start: 6, end: 10, duration: 4 },
  ]);
});

test("fillerSpans skips suspects — a fabricated 'um' is not a removable range", () => {
  const words = [
    { start: 0, end: 0.3, text: "Um,", suspect: true, suspectReason: "in-silence" },
    { start: 1, end: 1.3, text: "hi" },
  ];
  assert.deepEqual(fillerSpans(words), []);
});

test("stretchedEndings: an utterance end written across measured silence is drift", () => {
  // The real q3 failure: "…we embraced each other." truly ends at 404.88,
  // but whisper wrote 'other.' ending at 413.00 while silencedetect measured
  // silence from 408.34 — a 4.66s stretch. The next take starts right after.
  const words = [
    { start: 409.45, end: 410.83, text: "embraced" },
    { start: 410.83, end: 411.53, text: "each" },
    { start: 411.53, end: 413.0, text: "other." },
    { start: 413.0, end: 413.37, text: "Alright," },
  ];
  const silences = [{ start: 408.34, end: 413.2 }];
  const hits = stretchedEndings(words, silences);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].text, "other.");
  assert.equal(hits[0].stretch, 4.66);
  assert.equal(hits[0].silenceStart, 408.34);
});

test("stretchedEndings: healthy endings and mid-utterance words stay quiet", () => {
  // A clean ending: the word ends AT the silence onset (normal smear < 0.75s).
  const clean = [
    { start: 3.0, end: 3.6, text: "done." },
    { start: 8.0, end: 8.4, text: "Next" },
  ];
  assert.deepEqual(stretchedEndings(clean, [{ start: 3.7, end: 8.0 }]), []);
  // Smear under the threshold: still quiet.
  assert.deepEqual(stretchedEndings(clean, [{ start: 3.1, end: 8.0 }]), []);
  // A mid-utterance word (no gap, no terminal punctuation) never fires even
  // when a silence span technically covers its end.
  const mid = [
    { start: 3.0, end: 4.6, text: "very" },
    { start: 4.7, end: 5.0, text: "long" },
  ];
  assert.deepEqual(stretchedEndings(mid, [{ start: 3.2, end: 4.65 }]), []);
});

test("stretchedEndings: EOF-open silence and the last word of the file", () => {
  const words = [{ start: 10.0, end: 14.0, text: "goodbye." }];
  // Silence runs to EOF (end: null): duration closes it.
  const hits = stretchedEndings(words, [{ start: 11.0, end: null }], { duration: 20 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].stretch, 3);
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
