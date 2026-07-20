import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { attachFilterCapabilities, filterCapabilitiesFromText, probeFilters } from "./probe.mjs";

test("filter capability parsing exposes grading, text, and libass support", () => {
  const capabilities = filterCapabilitiesFromText(`
 TS. zscale            V->V       Apply resizing, colorspace and bit depth conversion.
 T.C drawtext          V->V       Draw text on top of video frames using libfreetype library.
 ... subtitles         V->V       Render text subtitles onto input video using the libass library.
 ... ass               V->V       Render ASS subtitles onto input video using the libass library.
 ... loudnorm          A->A       EBU R128 loudness normalization
`);

  assert.equal(capabilities.zscale, true);
  assert.equal(capabilities.drawtext, true);
  assert.equal(capabilities.subtitles, true);
  assert.equal(capabilities.ass, true);
  assert.equal(capabilities.libass, true);
  assert.equal(capabilities.libplacebo, false);
  assert.equal("note" in capabilities, false);
});

test("libass requires both subtitle filters and missing drawtext is explicit", () => {
  const capabilities = filterCapabilitiesFromText(" ... subtitles         V->V       Render subtitles\n");
  assert.equal(capabilities.subtitles, true);
  assert.equal(capabilities.ass, false);
  assert.equal(capabilities.libass, false);
  assert.match(capabilities.note, /drawtext unavailable/);
});

test("filter capability failures stay explicit", () => {
  assert.deepEqual(probeFilters({ findToolFn: () => null }), { error: "ffmpeg not found on PATH" });
  assert.deepEqual(probeFilters({
    findToolFn: () => "ffmpeg",
    runFn: () => ({ status: 1, stderr: "broken build" }),
  }), { error: "broken build" });
  assert.deepEqual(
    attachFilterCapabilities({ ok: true, file: "clip.mp4" }, { error: "broken build" }),
    {
      ok: false,
      file: "clip.mp4",
      ffmpegFilters: { error: "broken build" },
      error: "ffmpeg capability probe failed: broken build",
    }
  );
});

test("probe --filters exits nonzero when capability evidence is unavailable", () => {
  const res = spawnSync(process.execPath, [resolve("cli/index.mjs"), "probe", "--filters"], {
    encoding: "utf8",
    env: { ...process.env, PATH: "" },
  });
  assert.equal(res.status, 1, res.stderr);
  const json = JSON.parse(res.stdout);
  assert.equal(json.ok, false);
  assert.match(json.ffmpegFilters.error, /ffmpeg not found/);
});
