import assert from "node:assert/strict";
import { test } from "node:test";
import { detectHdr, parseArgs, parseSilence, round3, silenceEdges } from "./util.mjs";
import { contentGatePlan } from "./qa.mjs";

test("content gates run whenever a transcript is available or obtainable", () => {
  assert.equal(contentGatePlan({ hasTranscript: true, transcribeRequested: false, whisperReady: false, expectsContent: true }), "run");
  assert.equal(contentGatePlan({ hasTranscript: false, transcribeRequested: true, whisperReady: true, expectsContent: false }), "run");
});

test("content gates fail loudly instead of skipping when verification is expected", () => {
  // --transcribe asked for but whisper can't run: never silently degrade.
  assert.equal(contentGatePlan({ hasTranscript: false, transcribeRequested: true, whisperReady: false, expectsContent: false }), "fail-missing-whisper");
  // Manifest expects endings/leak checks but no transcript: unverified content must not pass.
  assert.equal(contentGatePlan({ hasTranscript: false, transcribeRequested: false, whisperReady: true, expectsContent: true }), "fail-unverified");
});

test("content gates skip (excluded from totals) only when nothing expects them", () => {
  assert.equal(contentGatePlan({ hasTranscript: false, transcribeRequested: false, whisperReady: true, expectsContent: false }), "skip");
});

test("parseSilence extracts spans from ffmpeg stderr", () => {
  const stderr = [
    "[silencedetect @ 0x600] silence_start: 0",
    "[silencedetect @ 0x600] silence_end: 0.5 | silence_duration: 0.5",
    "some unrelated line",
    "[silencedetect @ 0x600] silence_start: 4.1",
  ].join("\n");
  const spans = parseSilence(stderr);
  assert.equal(spans.length, 2);
  assert.deepEqual(spans[0], { start: 0, end: 0.5, duration: 0.5 });
  assert.deepEqual(spans[1], { start: 4.1, end: null, duration: null });
});

test("silenceEdges reports leading and open-ended tail silence", () => {
  const spans = parseSilence(
    [
      "silence_start: 0",
      "silence_end: 0.4 | silence_duration: 0.4",
      "silence_start: 4.0",
    ].join("\n")
  );
  const edges = silenceEdges(spans, 6);
  assert.equal(edges.leading, 0.4);
  assert.equal(edges.tail, 2); // 4.0 → EOF at 6s
});

test("silenceEdges reports zero when clip has no edge silence", () => {
  const spans = parseSilence("silence_start: 2.0\nsilence_end: 2.6 | silence_duration: 0.6");
  assert.deepEqual(silenceEdges(spans, 6), { leading: 0, tail: 0 });
});

test("detectHdr flags HLG BT.2020 sources", () => {
  const hdr = detectHdr({
    color_primaries: "bt2020",
    color_transfer: "arib-std-b67",
    color_space: "bt2020nc",
    pix_fmt: "yuv420p10le",
  });
  assert.equal(hdr.hdr, true);
  assert.equal(hdr.kind, "HLG");
});

test("detectHdr flags PQ and passes SDR through", () => {
  assert.equal(detectHdr({ color_transfer: "smpte2084" }).kind, "PQ");
  const sdr = detectHdr({ color_primaries: "bt709", color_transfer: "bt709", color_space: "bt709" });
  assert.equal(sdr.hdr, false);
  assert.equal(sdr.kind, "SDR");
  assert.equal(detectHdr(undefined).hdr, false);
});

test("parseArgs handles positionals, typed flags, and booleans", () => {
  const args = parseArgs(
    ["clip.mp4", "--start", "1.5", "--label", "q5", "--force"],
    { start: "number", label: "string", force: "boolean" }
  );
  assert.deepEqual(args, { _: ["clip.mp4"], start: 1.5, label: "q5", force: true });
});

test("round3 rounds to milliseconds", () => {
  assert.equal(round3(2.0136666), 2.014);
});
