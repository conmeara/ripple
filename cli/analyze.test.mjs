import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { driftSummary, loadAnalysis, optionsCompatible, referenceSilences, speechSpans } from "./analyze.mjs";
import { TRANSCRIPTION_CACHE_VERSION, resolveModel, whisperWordCapable } from "./transcribe.mjs";
import { fileStamp, findTool, readJsonOrNull, run, writeJsonAtomic } from "./util.mjs";

// Missing ffmpeg must SKIP the fixture-driven tests, never abort the whole
// test process mid-run (requireTool exits 2 and masks unrelated results).
const ffmpeg = findTool(["ffmpeg"]);

test("referenceSilences picks the stored threshold closest to -40dB", () => {
  const spans40 = [{ start: 1, end: 2 }];
  const spans50 = [{ start: 1.2, end: 1.8 }];
  assert.equal(referenceSilences({ silences: { "-35dB": [], "-40dB": spans40, "-45dB": [] } }), spans40);
  // Custom thresholds without -40: nearest wins, never a silent empty [].
  assert.equal(referenceSilences({ silences: { "-30dB": [], "-48dB": spans50 } }), spans50);
  assert.deepEqual(referenceSilences({ silences: {} }), []);
  assert.deepEqual(referenceSilences(null), []);
});

test("speechSpans complements silences and handles EOF-open spans", () => {
  assert.deepEqual(
    speechSpans([{ start: 2, end: 4 }, { start: 9, end: null }], 10),
    [{ start: 0, end: 2 }, { start: 4, end: 9 }]
  );
  assert.deepEqual(speechSpans([], 5), [{ start: 0, end: 5 }]);
});

test("driftSummary keeps chunked verification focused on severe late stretch", () => {
  const words = [
    { start: 28, end: 31.2, text: "early?" },
    { start: 70, end: 72.5, text: "normal." },
    // New speech resumes at EOF after a long finite pause: not an 8s stretch.
    { start: 99.7, end: 100, text: "next" },
  ];
  const silences = [
    { start: 29, end: 31.2 },
    { start: 70.4, end: 72.5 },
    { start: 92, end: 99.8 },
  ];
  const clean = driftSummary(words, silences, { duration: 100, timingMode: "chunked" });
  assert.equal(clean.suspected, false);
  assert.equal(clean.lateSevereEndings, 0);
  assert.ok(clean.samples.every((sample) => sample.text !== "next"));

  const failed = driftSummary(
    [...words, { start: 80, end: 85, text: "late." }],
    [...silences, { start: 81, end: 85 }],
    { duration: 100, timingMode: "chunked" }
  );
  assert.equal(failed.suspected, true);
  assert.equal(failed.lateSevereEndings, 1);
});

test("loadAnalysis cache: survives a move (content-keyed), rebuilds on a version bump", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-analyze-"));
  const outDir = join(dir, "analysis");
  mkdirSync(outDir);
  // 1s tone + 2s of digital silence: a real silence map without needing
  // any speech in the fixture.
  const src = join(dir, "clip.wav");
  const gen = run(ffmpeg, [
    "-hide_banner", "-y", "-v", "error",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1:sample_rate=16000",
    "-af", "apad=pad_dur=2", "-t", "3", src,
  ]);
  assert.equal(gen.status, 0, gen.stderr);

  // This test covers index caching, not whisper. Plant a versioned empty
  // transcript so machines with Metal-enabled whisper do not allocate a
  // model (and occasionally exhaust its buffer) just to analyze a tone.
  const modelPath = resolveModel(null);
  if (modelPath && whisperWordCapable().ok) {
    const stem = `${basename(src, extname(src))}_${fileStamp(src)}`;
    writeJsonAtomic(join(outDir, `${stem}.words.json`), {
      file: src,
      model: basename(modelPath),
      prompt: null,
      lang: "en",
      ripple: {
        transcriptionCacheVersion: TRANSCRIPTION_CACHE_VERSION,
        mode: "single",
        model: basename(modelPath),
        prompt: null,
        lang: "en",
      },
      words: [],
    });
    writeJsonAtomic(join(outDir, `${stem}.turns.json`), { file: src, model: "planted", turns: [] });
  }

  const first = loadAnalysis(src, { outDir });
  assert.equal(first.cached, false);
  assert.equal(first.index.version, 7);
  assert.ok(first.index.duration > 2.9 && first.index.duration < 3.1);
  assert.ok(Object.keys(first.index.silences).length);

  // Same bytes, new folder: the minutes of analysis must survive the move.
  mkdirSync(join(dir, "footage"));
  const moved = join(dir, "footage", "clip.wav");
  renameSync(src, moved);
  const second = loadAnalysis(moved, { outDir });
  assert.equal(second.cached, true);
  assert.equal(second.path, first.path);
  assert.equal(readJsonOrNull(second.path).file, moved); // recorded path refreshed

  // A stale INDEX_VERSION is a rebuild, never a reuse.
  const idx = readJsonOrNull(second.path);
  idx.version -= 1;
  writeJsonAtomic(second.path, idx);
  const third = loadAnalysis(moved, { outDir });
  assert.equal(third.cached, false);
});

// The one production call site of markSuspectWords is loadAnalysis: every
// consumer test hand-plants suspect flags, so without this pin a one-line
// merge-conflict revert to plain snapWords would ship unmarked fabrications
// into search/captions/lastWordEnd with the whole suite green. Whisper
// itself never runs here — transcribeWords reads its content-keyed
// <stem>.words.json cache, which the test plants — but the marking branch
// only executes when whisper COULD run, hence the gate.
const whisperReady = Boolean(ffmpeg && whisperWordCapable().ok && resolveModel(null));

test("loadAnalysis marks whisper fabrications suspect in the emerged index", { skip: !whisperReady }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-analyze-"));
  const outDir = join(dir, "analysis");
  mkdirSync(outDir);
  // Tone 0–1s, dead silence 1–8s, tone 8–10s: a CLOSED mid-file silence.
  const src = join(dir, "talk.wav");
  const gen = run(ffmpeg, [
    "-hide_banner", "-y", "-v", "error",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1:sample_rate=16000",
    "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono:d=7",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=16000",
    "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1",
    src,
  ]);
  assert.equal(gen.status, 0, gen.stderr);

  const stem = `${basename(src, extname(src))}_${fileStamp(src)}`;
  // Plant the whisper word cache: one real word per tone, plus a fabricated
  // "Thanks for watching." stranded in the measured silence.
  writeJsonAtomic(join(outDir, `${stem}.words.json`), {
    file: src, model: basename(resolveModel(null)), prompt: null, lang: "en",
    ripple: {
      transcriptionCacheVersion: TRANSCRIPTION_CACHE_VERSION,
      mode: "single",
      model: basename(resolveModel(null)),
      prompt: null,
      lang: "en",
    },
    words: [
      { start: 0.2, end: 0.8, text: "Testing." },
      { start: 3.0, end: 3.4, text: "Thanks" },
      { start: 3.4, end: 3.8, text: "for" },
      { start: 3.8, end: 4.5, text: "watching." },
      { start: 8.2, end: 8.8, text: "More." },
    ],
  });
  // Plant an empty turns cache so a tdrz-capable machine skips its pass.
  writeJsonAtomic(join(outDir, `${stem}.turns.json`), { file: src, model: "planted", turns: [] });

  const { index } = loadAnalysis(src, { outDir });
  assert.ok(index.words, "index should carry the planted words");
  const byText = (t) => index.words.find((w) => w.text === t);
  for (const t of ["Thanks", "for", "watching."]) {
    assert.equal(byText(t)?.suspect, true, `${t} should be suspect`);
    assert.equal(byText(t)?.suspectReason, "in-silence");
  }
  assert.equal(byText("Testing.").suspect, undefined);
  assert.equal(byText("More.").suspect, undefined);
  // And the fabrication never reaches the derived layers.
  assert.ok(!index.sentences.some((s) => /Thanks for watching/.test(s.text)));
  assert.deepEqual(index.sentenceEnds.filter((e) => e > 3 && e < 8), []);
});

test("optionsCompatible: explicit options must match; unset options accept the cache", () => {
  const cached = { options: { thresholds: ["-35dB", "-40dB", "-45dB"], prompt: "Georgie", lang: null } };
  assert.ok(optionsCompatible(cached, {})); // caller doesn't care
  assert.ok(optionsCompatible(cached, { prompt: "Georgie" }));
  assert.ok(!optionsCompatible(cached, { prompt: "different hints" }));
  assert.ok(!optionsCompatible(cached, { thresholds: ["-30dB", "-50dB"] }));
  assert.ok(optionsCompatible(cached, { thresholds: ["-35dB", "-40dB", "-45dB"], prompt: undefined }));
  // Legacy cache without options: any explicit request misses.
  assert.ok(!optionsCompatible({}, { prompt: "x" }));
  assert.ok(optionsCompatible({}, {}));
});
