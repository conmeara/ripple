import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildConcatFilter, buildEncodeArgs, buildSceneVf, clipName, setparamsFilter, validateManifest,
} from "./cut.mjs";

function sceneFixture(overrides = {}) {
  return { id: 1, slug: "intro", source: "src.mp4", start: 1, end: 5, status: "locked", ...overrides };
}

test("validateManifest accepts a well-formed manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-test-"));
  writeFileSync(join(dir, "src.mp4"), "stub");
  const errors = validateManifest({ version: 1, scenes: [sceneFixture()] }, dir);
  assert.deepEqual(errors, []);
});

test("validateManifest catches bad bounds, missing sources, dupes, and orphan jcuts", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-test-"));
  writeFileSync(join(dir, "src.mp4"), "stub");
  const errors = validateManifest(
    {
      version: 1,
      scenes: [
        sceneFixture({ start: 5, end: 5 }),
        sceneFixture({ id: 2, source: "missing.mp4" }),
        sceneFixture({ id: 3, slug: "intro" }),
        sceneFixture({ id: 4, slug: "jc", jcut: 1.5 }),
      ],
    },
    dir
  );
  assert.ok(errors.some((e) => e.includes("start/end invalid")));
  assert.ok(errors.some((e) => e.includes("source not found")));
  assert.ok(errors.some((e) => e.includes("duplicate slug")));
  assert.ok(errors.some((e) => e.includes("jcut requires a card")));
});

test("buildEncodeArgs picks hardware HEVC for HDR when available", () => {
  const enc = buildEncodeArgs({
    profile: "final",
    color: { mode: "hdr", transfer: "arib-std-b67" },
    encoders: { hevc_videotoolbox: true, libx265: true, libx264: true },
  });
  assert.ok(enc.video.includes("hevc_videotoolbox"));
  assert.ok(enc.video.includes("arib-std-b67"));
  assert.equal(enc.pixFmt, "p010le");
  assert.equal(enc.warning, null);
});

test("buildEncodeArgs warns loudly when HDR has no 10-bit encoder", () => {
  const enc = buildEncodeArgs({
    profile: "final",
    color: { mode: "hdr", transfer: "smpte2084" },
    encoders: { hevc_videotoolbox: false, libx265: false, libx264: true },
  });
  assert.ok(enc.video.includes("libx264"));
  assert.match(enc.warning, /do NOT ship/);
});

test("buildEncodeArgs draft profile trades quality for speed", () => {
  const enc = buildEncodeArgs({ profile: "draft", color: { mode: "sdr" }, encoders: { libx264: true } });
  assert.ok(enc.video.includes("28"));
  assert.ok(enc.video.includes("veryfast"));
  assert.ok(enc.audio.includes("128k"));
});

test("setparams only applies to HDR", () => {
  assert.equal(setparamsFilter({ mode: "sdr" }), "");
  assert.match(setparamsFilter({ mode: "hdr", transfer: "arib-std-b67" }), /setparams=.*arib-std-b67/);
});

test("buildSceneVf composes scale, fps, grade, and format in order", () => {
  const vf = buildSceneVf({
    color: { mode: "sdr" },
    gradeFilter: "eq=saturation=1.2",
    width: 1920, height: 1080, fps: "24000/1001", pixFmt: "yuv420p",
  });
  assert.ok(vf.startsWith("setpts=PTS-STARTPTS"));
  assert.ok(vf.indexOf("scale=1920:1080") < vf.indexOf("fps=24000/1001"));
  assert.ok(vf.indexOf("fps=") < vf.indexOf("eq=saturation"));
  assert.ok(vf.indexOf("eq=saturation") < vf.indexOf("format=yuv420p"));
});

test("buildConcatFilter normalizes every input and concats once", () => {
  const filter = buildConcatFilter(3, {
    width: 1280, height: 720, fps: "30", pixFmt: "yuv420p", color: { mode: "sdr" },
  });
  assert.equal((filter.match(/concat=n=3:v=1:a=1/g) ?? []).length, 1);
  assert.equal((filter.match(/\[\d+:v\]/g) ?? []).length, 3);
  assert.equal((filter.match(/channel_layouts=stereo/g) ?? []).length, 3);
  assert.ok(filter.endsWith("[v][a]"));
});

test("clipName is stable and ordered", () => {
  assert.equal(clipName({ id: 3, slug: "first_kiss" }), "03_first_kiss.mp4");
});
