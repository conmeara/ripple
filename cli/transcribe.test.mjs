import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRANSCRIPTION_CACHE_VERSION,
  mergeChunkJson,
  planVadChunks,
  transcriptionCacheMatches,
} from "./transcribe.mjs";

test("planVadChunks leaves short sources on the existing single-pass path", () => {
  assert.deepEqual(planVadChunks(59.999, [{ start: 20, end: 21 }]), {
    mode: "single",
    chunks: [{ start: 0, end: 59.999, boundary: "eof" }],
  });
});

test("planVadChunks prefers silence and hard-splits only windows without it", () => {
  const { mode, chunks } = planVadChunks(75, [
    { start: 27, end: 29 },
    { start: 55, end: 57 },
  ]);
  assert.equal(mode, "chunked");
  assert.deepEqual(chunks, [
    { start: 0, end: 27.05, boundary: "silence" },
    { start: 27.05, end: 55.05, boundary: "silence" },
    { start: 55.05, end: 75, boundary: "eof" },
  ]);
  for (let i = 0; i < chunks.length; i++) {
    assert.ok(chunks[i].end - chunks[i].start <= 30);
    if (i) assert.equal(chunks[i].start, chunks[i - 1].end, "chunks must neither overlap nor leave gaps");
  }

  assert.deepEqual(planVadChunks(65, []).chunks, [
    { start: 0, end: 30, boundary: "hard" },
    { start: 30, end: 60, boundary: "hard" },
    { start: 60, end: 65, boundary: "eof" },
  ]);

  assert.deepEqual(planVadChunks(65, [{ start: 54, end: 56 }]).chunks, [
    { start: 0, end: 30, boundary: "hard" },
    { start: 30, end: 54.05, boundary: "silence" },
    { start: 54.05, end: 65, boundary: "eof" },
  ]);
});

test("mergeChunkJson offsets each edge segment exactly once", () => {
  const merged = mergeChunkJson([
    {
      chunk: { start: 0, end: 28 },
      raw: {
        model: { type: "base" },
        transcription: [
          { offsets: { from: 27000, to: 28000 }, text: " before" },
          { offsets: { from: 28000, to: 30000 }, text: " padded duplicate" },
        ],
      },
    },
    {
      chunk: { start: 28, end: 56 },
      raw: {
        transcription: [
          { offsets: { from: 0, to: 900 }, text: " after" },
        ],
      },
    },
  ]);
  assert.deepEqual(merged.transcription.map((segment) => ({ offsets: segment.offsets, text: segment.text })), [
    { offsets: { from: 27000, to: 28000 }, text: " before" },
    { offsets: { from: 28000, to: 28900 }, text: " after" },
  ]);
  assert.equal(merged.transcription[1].timestamps.from, "00:00:28,000");
});

test("transcription cache version and mode separate old, single, and chunked results", () => {
  const requested = { mode: "chunked", model: "/models/ggml-base.en.bin", prompt: undefined, lang: "en" };
  assert.equal(transcriptionCacheMatches({ model: "legacy", words: [] }, requested), false);
  assert.equal(transcriptionCacheMatches({
    ripple: {
      transcriptionCacheVersion: TRANSCRIPTION_CACHE_VERSION,
      mode: "single",
      model: "ggml-base.en.bin",
      prompt: null,
      lang: "en",
    },
  }, requested), false);
  assert.equal(transcriptionCacheMatches({
    ripple: {
      transcriptionCacheVersion: TRANSCRIPTION_CACHE_VERSION,
      mode: "chunked",
      model: "ggml-base.en.bin",
      prompt: null,
      lang: "en",
    },
  }, requested), true);
});
