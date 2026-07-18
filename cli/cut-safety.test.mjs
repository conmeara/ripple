import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { endpointFlags, lintManifest } from "./cut-safety.mjs";
import { fileStamp } from "./util.mjs";

// A project on disk: stub source, cached perception index, and edit.json.
// Words model a clean answer at 0–10 and a 3s dead tail at 15–25.
function project({ scenes, index } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ripple-safety-"));
  const src = join(dir, "src.mp4");
  writeFileSync(src, "stub");
  mkdirSync(join(dir, "work", "analysis"), { recursive: true });
  const words = [
    { start: 0.3, end: 0.6, text: "We" },
    { start: 0.7, end: 1.1, text: "met" },
    { start: 1.2, end: 9.2, text: "here." },
    { start: 15.2, end: 15.5, text: "I" },
    { start: 15.6, end: 22.0, text: "do." },
    { start: 26.5, end: 27.0, text: "What's" },
    { start: 27.1, end: 27.5, text: "next?" },
  ];
  const silences = {
    "-40dB": [
      { start: 9.2, end: 15.2 },
      { start: 22.0, end: 26.5 },
      { start: 27.5, end: null },
    ],
  };
  writeFileSync(
    join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
    JSON.stringify(index ?? { version: 4, file: src, duration: 30, hasAudio: true, words, silences })
  );
  writeFileSync(join(dir, "edit.json"), JSON.stringify({ version: 1, scenes }));
  return join(dir, "edit.json");
}

const CLEAN = { id: 1, slug: "met", source: "src.mp4", start: 0, end: 10, status: "locked" };
const DEAD_TAIL = { id: 2, slug: "vows", source: "src.mp4", start: 15, end: 25, status: "locked" };

test("endpoint flags retain their measured, stable envelope", () => {
  const timing = {
    wordsInRange: 5, firstWordStart: 11.2, leadGap: 1.2, straddleStart: "owns",
    lastWordEnd: 18, tailGap: 2.4, straddleEnd: "favorite",
    nextWordStart: 19, nextText: "What's next", nextAudioStart: 18.9,
  };
  const silence = { "-40dB": { leading: 0, tail: 0, spans: 1 } };
  const flags = endpointFlags(timing, silence, { maxTail: 1.0, maxLead: 0.5, end: 20 });
  assert.deepEqual(flags.map((f) => f.flag).sort(), [
    "DEAD_AIR_TAIL", "LATE_FIRST_WORD", "MID_WORD_IN", "MID_WORD_OUT",
    "NEXT_SPEECH_INSIDE", "SPEECH_AT_OUT",
  ]);
  for (const finding of flags) assert.deepEqual(Object.keys(finding), ["flag", "detail"]);
});

test("lintManifest passes a clean scene and blocks a dead tail", () => {
  const manifest = project({ scenes: [CLEAN, DEAD_TAIL] });
  const { findings, scenes } = lintManifest(manifest);
  assert.deepEqual(scenes, ["met", "vows"]);
  assert.ok(!findings.some((f) => f.scene === "met"));
  const tail = findings.find((f) => f.code === "DEAD_AIR_TAIL");
  assert.ok(tail, JSON.stringify(findings));
  assert.deepEqual(Object.keys(tail), ["code", "scene", "detail", "severity"]);
  assert.equal(tail.scene, "vows");
  assert.equal(tail.severity, "block");
  assert.match(tail.detail, /3s of nothing/);
});

test("lintManifest reports missing indexes and missing sources", () => {
  const manifest = project({ scenes: [CLEAN] });
  const withoutIndex = { ...CLEAN, slug: "ghost", source: "other.mp4" };
  writeFileSync(join(dirname(manifest), "other.mp4"), "stub");
  writeFileSync(manifest, JSON.stringify({ version: 1, scenes: [withoutIndex] }));
  let { findings } = lintManifest(manifest);
  assert.equal(findings[0].code, "NO_INDEX");
  assert.equal(findings[0].severity, "block");
  assert.match(findings[0].detail, /ripple analyze/);

  writeFileSync(manifest, JSON.stringify({ version: 1, scenes: [{ ...CLEAN, source: "gone.mp4" }] }));
  ({ findings } = lintManifest(manifest));
  assert.equal(findings[0].code, "NO_INDEX");
  assert.match(findings[0].detail, /source not found/);
});

test("a sub-0.25s tail sliver matches candidates and flags speech at OUT", () => {
  const manifest = project({
    scenes: [{ id: 1, slug: "tight", source: "src.mp4", start: 0.5, end: 10.0, status: "locked" }],
    index: {
      version: 4, duration: 30, hasAudio: true,
      words: [
        { start: 0.6, end: 1.0, text: "We" },
        { start: 1.1, end: 9.9, text: "met." },
      ],
      silences: { "-40dB": [{ start: 9.9, end: 25.0 }] },
    },
  });
  const speech = lintManifest(manifest).findings.find((f) => f.code === "SPEECH_AT_OUT");
  assert.ok(speech);
  assert.equal(speech.severity, "block");
});

test("work/edit.json resolves the analysis cache from any cwd", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-safety-"));
  const src = join(dir, "src.mp4");
  writeFileSync(src, "stub");
  mkdirSync(join(dir, "work", "analysis"), { recursive: true });
  writeFileSync(
    join(dir, "work", "analysis", `src_${fileStamp(src)}.analysis.json`),
    JSON.stringify({
      version: 4, file: src, duration: 30, hasAudio: true,
      words: [{ start: 0.3, end: 0.6, text: "We" }, { start: 0.7, end: 9.2, text: "met." }],
      silences: { "-40dB": [{ start: 9.2, end: 15.2 }] },
    })
  );
  const manifestPath = join(dir, "work", "edit.json");
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "met", source: "../src.mp4", start: 0, end: 10, status: "locked" }],
  }));
  const { findings } = lintManifest(manifestPath);
  assert.ok(!findings.some((f) => f.code === "NO_INDEX"), JSON.stringify(findings));
});

test("scene filtering and degraded indexes stay explicit", () => {
  const manifest = project({ scenes: [CLEAN, DEAD_TAIL] });
  const only = lintManifest(manifest, { scene: "met" });
  assert.deepEqual(only.scenes, ["met"]);
  assert.deepEqual(only.findings, []);

  const noWords = project({
    scenes: [CLEAN],
    index: {
      version: 4, duration: 30, hasAudio: true, words: null,
      wordsNote: "whisper-cpp unavailable",
      silences: { "-40dB": [{ start: 9.2, end: 15.2 }] },
    },
  });
  const timingWarning = lintManifest(noWords).findings.find((f) => f.code === "NO_WORD_TIMING");
  assert.equal(timingWarning.severity, "warn");

  const silent = project({
    scenes: [CLEAN],
    index: { version: 4, duration: 30, hasAudio: false, words: null, silences: {} },
  });
  assert.deepEqual(lintManifest(silent).findings, []);
});
