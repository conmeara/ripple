import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assessTailSilence, audioTimelineDuration, conservativeSilenceEdges, finalTailAudioExemption, intentionalRegions, measuredSilenceEdges, missingEndings,
  parseBlackdetect, parseFreezedetect, tailAudioExemption, trailingRmsSilence, unexplainedSpans, writeQaSnapshotAtomic,
} from "./qa.mjs";
import { findTool } from "./util.mjs";

const QA = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "qa.mjs")).href;
const ffmpeg = findTool(["ffmpeg"]);

test("QA snapshots are published atomically without leaving temporary files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-atomic-"));
  const snapshotPath = join(dir, "qa-100.json");
  const snapshot = { status: "pass", ok: true, verified: true, checks: [] };
  writeQaSnapshotAtomic(snapshotPath, snapshot);
  assert.deepEqual(JSON.parse(readFileSync(snapshotPath, "utf8")), snapshot);
  assert.deepEqual(readdirSync(dir), ["qa-100.json"]);
});

test("missingEndings matches across whisper's hard line wraps", () => {
  const text = "finish on the final\n frame.\n";
  assert.deepEqual(missingEndings(text, [{ slug: "answer", expectEnding: "the final frame" }]), []);
  assert.deepEqual(
    missingEndings(text, [{ slug: "answer", expectEnding: "take two" }]).map((s) => s.slug),
    ["answer"]
  );
  assert.deepEqual(missingEndings("FINAL   FRAME", [{ slug: "m", expectEnding: "final frame" }]), []);
});

test("audio edge measurement closes open silence on audio EOF, not longer video EOF", () => {
  const probe = {
    streams: [
      { codec_type: "video", duration: "6.170" },
      { codec_type: "audio", duration: "6.000" },
    ],
    format: { duration: "6.170" },
  };
  assert.equal(audioTimelineDuration(probe), 6);
  assert.deepEqual(measuredSilenceEdges("silence_start: 4.0", probe), { leading: 0, tail: 2 });
  assert.equal(audioTimelineDuration({ streams: [{ codec_type: "video", duration: "6" }] }), null);
});

test("multi-threshold silence uses the conservative edge when soft speech is audible", () => {
  assert.deepEqual(conservativeSilenceEdges([
    { leading: 0.4, tail: 1.8 },
    { leading: 0.2, tail: 1.2 },
    { leading: 0, tail: 0 },
  ]), { leading: 0, tail: 0 });
});

test("RMS edge analysis catches sustained room tone despite brief sample peaks", () => {
  const frames = [
    { time: 0, db: -25 },
    { time: 0.02, db: -30 },
    { time: 0.04, db: -54 },
    { time: 0.06, db: -53 },
    { time: 0.08, db: -55 },
  ];
  assert.equal(trailingRmsSilence(frames, 0.1, -48), 0.06);
  // Soft sound right at EOF remains active and yields no safe tail.
  assert.equal(trailingRmsSilence([...frames, { time: 0.1, db: -44 }], 0.12, -48), 0);
});

test("zero-tail dialogue fails unless a narrow manifest exemption names the boundary audio", () => {
  assert.equal(assessTailSilence({ tail: 0, maxTail: 1 }).ok, false);
  assert.match(assessTailSilence({ tail: 0, maxTail: 1 }).detail, /audio reaches the cut boundary/);
  const allowed = assessTailSilence({ tail: 0, maxTail: 1, exemption: "manifest qa.allowAudioAtEnd=true" });
  assert.equal(allowed.ok, true);
  assert.match(allowed.detail, /explicitly allowed/);
  // allowAudioAtEnd means sound may reach OUT; it never excuses dead air.
  assert.equal(assessTailSilence({ tail: 2.5, maxTail: 1, exemption: "manifest qa.allowAudioAtEnd=true" }).ok, false);
  assert.equal(assessTailSilence({ tail: 0.4, maxTail: 1 }).ok, true);
});

test("tail exemptions are structural and auditable; a J-cut never excuses an unsafe OUT", () => {
  assert.equal(tailAudioExemption({ manifest: { qa: { allowAudioAtEnd: true } } }), "manifest qa.allowAudioAtEnd=true");
  assert.equal(tailAudioExemption({ manifest: { music: { source: "bed.wav" } } }), "manifest music bed (bed.wav)");
  assert.equal(tailAudioExemption({ scene: { slug: "a", qa: { allowAudioAtEnd: true } } }), "scene.qa.allowAudioAtEnd=true (a)");
  assert.equal(tailAudioExemption({ scene: { slug: "a", lcut: 0.8 } }), "scene.lcut=0.8s");
  assert.equal(tailAudioExemption({ scene: { slug: "a", jcut: 1 } }), null);
});

test("the final OUT inherits only the last scene's narrow tail exemption", () => {
  assert.equal(finalTailAudioExemption({
    scenes: [{ slug: "first", qa: { allowAudioAtEnd: true } }, { slug: "last" }],
  }), null);
  assert.equal(finalTailAudioExemption({
    scenes: [{ slug: "first" }, { slug: "last", qa: { allowAudioAtEnd: true } }],
  }), "scene.qa.allowAudioAtEnd=true (last)");
  assert.equal(finalTailAudioExemption({ scenes: [{ slug: "last", lcut: 0.6 }] }), "scene.lcut=0.6s");
  assert.equal(finalTailAudioExemption({ scenes: [], qa: { allowAudioAtEnd: true } }), "manifest qa.allowAudioAtEnd=true");
});

test("parseBlackdetect extracts spans from ffmpeg stderr", () => {
  const stderr = [
    "[blackdetect @ 0x600] black_start:0.8 black_end:1.2 black_duration:0.4",
    "frame= 20 fps=0.0 unrelated",
    "[blackdetect @ 0x600] black_start:3 black_end:3.067 black_duration:0.067",
  ].join("\n");
  assert.deepEqual(parseBlackdetect(stderr), [
    { start: 0.8, end: 1.2, duration: 0.4 },
    { start: 3, end: 3.067, duration: 0.067 },
  ]);
  assert.deepEqual(parseBlackdetect("nothing"), []);
});

test("parseFreezedetect pairs the three metadata lines; EOF freeze keeps end null", () => {
  const stderr = [
    "[freezedetect @ 0x600] lavfi.freezedetect.freeze_start: 1.0",
    "[freezedetect @ 0x600] lavfi.freezedetect.freeze_duration: 2.5",
    "[freezedetect @ 0x600] lavfi.freezedetect.freeze_end: 3.5",
    "[freezedetect @ 0x600] lavfi.freezedetect.freeze_start: 8.2",
  ].join("\n");
  assert.deepEqual(parseFreezedetect(stderr), [
    { start: 1.0, end: 3.5, duration: 2.5 },
    { start: 8.2, end: null, duration: null },
  ]);
});

test("intentionalRegions: cards always, transition overlaps only for blacks", () => {
  const scenes = [
    { slug: "a", source: "s.mov", start: 0, end: 5 },
    { slug: "b", source: "s.mov", start: 10, end: 15, card: "Q2?", cardDuration: 2.5 },
    { slug: "c", source: "s.mov", start: 20, end: 24, transition: { type: "fadeblack", duration: 1 } },
  ];
  const black = intentionalRegions(scenes);
  assert.deepEqual(black.map((r) => [r.start, r.end]), [[5, 7.5], [11.5, 12.5]]);
  assert.match(black[1].why, /fadeblack into c/);
  const freeze = intentionalRegions(scenes, { transitions: false });
  assert.deepEqual(freeze.map((r) => r.why), ["card b"]);
});

test("unexplainedSpans: inside passes (±pad), bleeding past a region is the 2-frame-blink failure", () => {
  const regions = [{ start: 5, end: 7.5 }];
  // Fully inside, and inside within pad slop: explained.
  assert.deepEqual(unexplainedSpans([{ start: 5.1, end: 7.4 }, { start: 4.9, end: 7.6 }], regions), []);
  // A black flash at a join far from any card: flagged.
  assert.equal(unexplainedSpans([{ start: 12.0, end: 12.07 }], regions).length, 1);
  // Starts under the card but bleeds into the scene: flagged.
  assert.equal(unexplainedSpans([{ start: 7.0, end: 8.4 }], regions).length, 1);
  // Open-ended span closes at duration.
  assert.equal(unexplainedSpans([{ start: 6.0, end: null }], regions, { duration: 20 }).length, 1);
  assert.deepEqual(unexplainedSpans([{ start: 6.0, end: null }], [{ start: 5, end: 20 }], { duration: 20 }), []);
});

test("unexplainedSpans: a blink wholly outside a region never rides the pad to a pass", () => {
  // The origin defect at its most likely address: a 2-frame black gap right
  // AFTER the card ends (an assembly gap at the join). It sits inside the
  // ±pad halo but touches no region — that's a defect, not card slop.
  const card = [{ start: 9, end: 11.5 }];
  assert.equal(unexplainedSpans([{ start: 11.55, end: 11.63 }], card).length, 1);
  // ...and the mirror image before the card's fade-in.
  assert.equal(unexplainedSpans([{ start: 8.85, end: 8.95 }], card).length, 1);
  // A span that touches the region and overhangs within pad still passes
  // (the accepted fade-rounding slop).
  assert.deepEqual(unexplainedSpans([{ start: 11.4, end: 11.6 }], card), []);
});

// ---------- end-to-end on synthesized fixtures ----------

function synth(dir, name, inputs, filter) {
  const out = join(dir, name);
  const args = ["-hide_banner", "-v", "error", "-y"];
  for (const i of inputs) args.push("-f", "lavfi", "-i", i);
  if (filter) args.push("-filter_complex", filter);
  args.push("-pix_fmt", "yuv420p", out);
  const res = spawnSync(ffmpeg, args, { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  return out;
}

function synthAvWithTail(dir, name, { tone = 1, silence = 0, videoPad = 0 }) {
  const out = join(dir, name);
  const audioDuration = tone + silence;
  const res = spawnSync(ffmpeg, [
    "-hide_banner", "-v", "error", "-y",
    "-f", "lavfi", "-i", `testsrc=s=64x36:r=10:d=${audioDuration + videoPad}`,
    "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${tone}`,
    ...(silence > 0 ? ["-f", "lavfi", "-i", `anullsrc=r=48000:cl=mono:d=${silence}`] : []),
    ...(silence > 0
      ? ["-filter_complex", "[1:a][2:a]concat=n=2:v=0:a=1[a]", "-map", "0:v:0", "-map", "[a]"]
      : ["-map", "0:v:0", "-map", "1:a:0"]),
    "-c:a", "aac", "-pix_fmt", "yuv420p", out,
  ], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  return out;
}

// qa's exit code + envelope are the contract: drive main() in a child.
function runQa(args, cwd) {
  const res = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `const m = await import(${JSON.stringify(QA)}); await m.main(${JSON.stringify(args)});`],
    { encoding: "utf8", cwd }
  );
  return { status: res.status, json: JSON.parse(res.stdout), stderr: res.stderr };
}

const gate = (json, id) => json.checks.find((c) => c.id === id);

// Every concat input is normalized to one pix_fmt first — lavfi sources
// disagree and concat refuses mixed formats.
const norm3 = "[0]format=yuv420p[a];[1]format=yuv420p[b];[2]format=yuv420p[c];[a][b][c]concat=n=3:v=1:a=0";

test("a black flash at a join fails black-frames with a stable check id", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "flash.mp4",
    ["testsrc=s=64x36:r=10:d=2", "color=c=black:s=64x36:r=10:d=0.4", "testsrc2=s=64x36:r=10:d=2"],
    norm3);
  const { status, json } = runQa([file, "--no-snapshot"], dir);
  assert.equal(status, 1);
  const black = gate(json, "black-frames");
  assert.equal(black.ok, false);
  assert.equal(black.id, "black-frames");
  assert.match(black.detail, /unexplained black/);
  assert.equal(gate(json, "freeze-frames").ok, true);
});

test("a mid-scene freeze fails freeze-frames; a whole-file still is intentional", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const frozen = synth(dir, "frozen.mp4",
    ["testsrc=s=64x36:r=10:d=1", "color=c=gray:s=64x36:r=10:d=3", "testsrc=s=64x36:r=10:d=1"],
    norm3);
  const bad = runQa([frozen, "--no-snapshot"], dir);
  assert.equal(bad.status, 1);
  assert.equal(gate(bad.json, "freeze-frames").ok, false);
  assert.match(gate(bad.json, "freeze-frames").detail, /picture frozen/);

  const still = synth(dir, "still.mp4", ["color=c=gray:s=64x36:r=10:d=3"]);
  const ok = runQa([still, "--no-snapshot"], dir);
  assert.equal(gate(ok.json, "freeze-frames").ok, true);
});

test("moving footage with no blacks passes both gates", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synthAvWithTail(dir, "clean.mp4", { tone: 1, silence: 0.4 });
  const { status, json } = runQa([file, "--no-snapshot"], dir);
  assert.equal(status, 1, JSON.stringify(json.checks));
  assert.equal(gate(json, "black-frames").ok, true);
  assert.equal(gate(json, "freeze-frames").ok, true);
  assert.equal(json.status, "not-verified");
  assert.equal(json.ok, null);
  assert.equal(json.verified, false);
  assert.deepEqual(json.notVerified, ["content-gates"]);
  assert.match(json.hint, /NOT verified/);
});

test("manifest scenes without rendered clips stay explicitly not verified", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const manifestPath = join(dir, "edit.json");
  const transcriptPath = join(dir, "final.txt");
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "answer", source: "src.mp4", start: 0, end: 1, status: "locked" }],
  }));
  const file = synthAvWithTail(dir, "final.mp4", { tone: 1, silence: 0.4 });
  writeFileSync(transcriptPath, "A clean synthetic answer.");

  const { status, json } = runQa([
    file, "--manifest", manifestPath, "--transcript", transcriptPath, "--no-snapshot",
  ], dir);

  assert.equal(status, 1, JSON.stringify(json.checks));
  assert.equal(json.status, "not-verified");
  assert.equal(json.ok, null);
  assert.equal(json.verified, false);
  assert.deepEqual(json.notVerified, ["clip-count", "clip-decode", "scene-tails"]);
  assert.equal(gate(json, "content-gates"), undefined);
  assert.equal(gate(json, "scene-tails").status, "not-verified");
  assert.match(gate(json, "scene-tails").detail, /clips.*missing.*run ripple cut/i);
});

test("a final older than its manifest cannot produce a verified pass", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synthAvWithTail(dir, "final.mp4", { tone: 1, silence: 0.4 });
  const manifestPath = join(dir, "edit.json");
  const transcriptPath = join(dir, "final.txt");
  writeFileSync(manifestPath, JSON.stringify({ version: 1, scenes: [] }));
  writeFileSync(transcriptPath, "A clean synthetic answer.");
  const now = Date.now() / 1000;
  utimesSync(file, now - 20, now - 20);
  utimesSync(manifestPath, now - 10, now - 10);

  const { status, json } = runQa([
    file, "--manifest", manifestPath, "--transcript", transcriptPath, "--no-snapshot",
  ], dir);

  assert.equal(status, 1, JSON.stringify(json.checks));
  assert.equal(json.status, "not-verified");
  assert.equal(json.ok, null);
  assert.equal(json.verified, false);
  assert.deepEqual(json.notVerified, ["render-freshness"]);
  assert.equal(gate(json, "render-freshness").status, "not-verified");
  assert.match(gate(json, "render-freshness").detail, /output predates.*re-run ripple cut/i);
});

test("dialogue-loudness remains visible when only some expected clips are measurable", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const clipsDir = join(dir, "clips");
  mkdirSync(clipsDir);
  const manifestPath = join(dir, "edit.json");
  const transcriptPath = join(dir, "final.txt");
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    scenes: [
      { id: 1, slug: "a", source: "src.mp4", start: 0, end: 1, status: "locked" },
      { id: 2, slug: "b", source: "src.mp4", start: 1, end: 2, status: "locked" },
    ],
  }));
  writeFileSync(transcriptPath, "Two clean synthetic answers.");
  synthAvWithTail(clipsDir, "01_a.mp4", { tone: 1, silence: 0.4 });
  synth(clipsDir, "02_b.mp4", ["testsrc=s=64x36:r=10:d=1"]);
  const file = synthAvWithTail(dir, "final.mp4", { tone: 1, silence: 0.4 });

  const { status, json } = runQa([
    file, "--manifest", manifestPath, "--transcript", transcriptPath, "--no-snapshot",
  ], dir);

  assert.equal(status, 1, JSON.stringify(json.checks));
  assert.equal(gate(json, "clip-count").ok, true);
  const loudness = gate(json, "dialogue-loudness");
  assert.ok(loudness, "dialogue-loudness must not disappear when evidence is partial");
  assert.equal(loudness.status, "not-verified");
  assert.equal(loudness.ok, null);
  assert.match(loudness.detail, /measured 1\/2 expected scene clips/);
  assert.match(loudness.detail, /b: no measurable dialogue loudness/);
  assert.ok(json.notVerified.includes("dialogue-loudness"));
});

test("scene-tail and loudness evidence stay not verified when clips predate the manifest", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const clipsDir = join(dir, "clips");
  mkdirSync(clipsDir);
  const manifestPath = join(dir, "edit.json");
  const transcriptPath = join(dir, "final.txt");
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    scenes: [
      { id: 1, slug: "a", source: "src.mp4", start: 0, end: 1, status: "locked" },
      { id: 2, slug: "b", source: "src.mp4", start: 1, end: 2, status: "locked" },
    ],
  }));
  const clipA = synthAvWithTail(clipsDir, "01_a.mp4", { tone: 1, silence: 0.4 });
  const clipB = synthAvWithTail(clipsDir, "02_b.mp4", { tone: 1, silence: 0.4 });
  const file = synthAvWithTail(dir, "final.mp4", { tone: 1, silence: 0.4 });
  writeFileSync(transcriptPath, "Two clean synthetic answers.");
  const now = Date.now() / 1000;
  utimesSync(clipA, now - 20, now - 20);
  utimesSync(clipB, now - 20, now - 20);
  utimesSync(manifestPath, now - 10, now - 10);
  utimesSync(file, now, now);

  const { status, json } = runQa([
    file, "--manifest", manifestPath, "--transcript", transcriptPath, "--no-snapshot",
  ], dir);

  assert.equal(status, 1, JSON.stringify(json.checks));
  assert.equal(json.status, "not-verified");
  assert.equal(gate(json, "render-freshness").status, "pass");
  assert.equal(gate(json, "scene-tails").status, "not-verified");
  assert.equal(gate(json, "dialogue-loudness").status, "not-verified");
  assert.match(gate(json, "scene-tails").detail, /2 expected scene clip\(s\) predate the manifest/);
  assert.deepEqual(json.notVerified, ["scene-tails", "dialogue-loudness"]);
});

test("case-40 regression: a silent audio tail ending before video EOF is measured and fails", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  // Mirrors the shipped false green: AAC audio ends ~170ms before video;
  // silencedetect closes at audio EOF, so format/video duration used to turn
  // a multi-second tail into 0s.
  const file = synthAvWithTail(dir, "dead-tail.mp4", { tone: 1, silence: 2.6, videoPad: 0.17 });
  const { status, json } = runQa([file, "--max-tail-silence", "1", "--no-snapshot"], dir);
  assert.equal(status, 1);
  const tail = gate(json, "tail-silence");
  assert.equal(tail.ok, false);
  assert.match(tail.detail, /2\.[45-7]\d*s trailing silence/);
  assert.doesNotMatch(tail.detail, /^0s/);
});

test("a dialogue delivery with a dropped final audio stream cannot pass", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const clipsDir = join(dir, "clips");
  mkdirSync(clipsDir);
  const manifestPath = join(dir, "edit.json");
  const transcriptPath = join(dir, "final.txt");
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "answer", source: "src.mp4", start: 0, end: 1.4, status: "locked", expectEnding: "complete answer" }],
  }));
  synthAvWithTail(clipsDir, "01_answer.mp4", { tone: 1, silence: 0.4 });
  const file = synth(dir, "final.mp4", ["testsrc=s=64x36:r=10:d=1.4"]);
  writeFileSync(transcriptPath, "This is the complete answer.");

  const { status, json } = runQa([
    file, "--manifest", manifestPath, "--transcript", transcriptPath, "--no-snapshot",
  ], dir);
  assert.equal(status, 1);
  assert.equal(json.status, "fail");
  assert.equal(gate(json, "leading-silence").status, "fail");
  assert.equal(gate(json, "tail-silence").status, "fail");
  assert.match(gate(json, "tail-silence").detail, /audio may have been dropped/);
});

test("an explicitly approved silent video can pass the no-audio gate", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const manifestPath = join(dir, "edit.json");
  writeFileSync(manifestPath, JSON.stringify({ version: 1, scenes: [], qa: { allowNoAudio: true } }));
  const file = synth(dir, "silent-final.mp4", ["testsrc=s=64x36:r=10:d=1.4"]);
  const { status, json } = runQa([
    file, "--manifest", manifestPath, "--no-snapshot",
  ], dir);
  assert.equal(status, 0, JSON.stringify(json.checks));
  assert.equal(json.status, "pass");
  assert.match(gate(json, "tail-silence").detail, /qa\.allowNoAudio=true/);
});

test("explicit final allowAudioAtEnd is visible evidence and can verify an intentional hard boundary", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const manifestPath = join(dir, "edit.json");
  const transcriptPath = join(dir, "final.txt");
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    scenes: [],
    qa: { allowAudioAtEnd: true },
  }));
  const file = synthAvWithTail(dir, "intentional-boundary.mp4", { tone: 2 });
  writeFileSync(transcriptPath, "clean synthetic dialogue");
  const { status, json } = runQa([
    file, "--manifest", manifestPath, "--transcript", transcriptPath,
  ], dir);
  assert.equal(status, 0, JSON.stringify(json.checks));
  assert.equal(json.status, "pass");
  assert.equal(json.verified, true);
  const tail = gate(json, "tail-silence");
  assert.equal(tail.ok, true);
  assert.match(tail.detail, /manifest qa\.allowAudioAtEnd=true/);
  const snapshotName = readdirSync(join(dir, ".ripple", "qa")).find((name) => name.startsWith("qa-"));
  const snapshot = JSON.parse(readFileSync(join(dir, ".ripple", "qa", snapshotName), "utf8"));
  assert.equal(snapshot.file, resolve(file));
  assert.equal(snapshot.manifest, resolve(manifestPath));
  assert.equal(snapshot.contentEvidence.method, "provided");
  assert.equal(snapshot.contentEvidence.transcript, resolve(transcriptPath));
});

test("the last scene's allowAudioAtEnd verifies the final cut boundary", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const clipsDir = join(dir, "clips");
  mkdirSync(clipsDir);
  const manifestPath = join(dir, "edit.json");
  const transcriptPath = join(dir, "final.txt");
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    scenes: [{
      id: 1, slug: "outro", source: "src.mp4", start: 0, end: 2, status: "locked",
      qa: { allowAudioAtEnd: true },
    }],
  }));
  synthAvWithTail(clipsDir, "01_outro.mp4", { tone: 2 });
  const file = synthAvWithTail(dir, "final.mp4", { tone: 2 });
  writeFileSync(transcriptPath, "A clean synthetic outro.");

  const { status, json } = runQa([
    file, "--manifest", manifestPath, "--transcript", transcriptPath, "--no-snapshot",
  ], dir);

  assert.equal(status, 0, JSON.stringify(json.checks));
  assert.equal(json.status, "pass");
  assert.equal(gate(json, "scene-tails").status, "pass");
  assert.equal(gate(json, "tail-silence").status, "pass");
  assert.match(gate(json, "tail-silence").detail, /scene\.qa\.allowAudioAtEnd=true \(outro\)/);
});

test("work/edit.json keeps QA snapshots beside the resolved manifest", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-work-"));
  const work = join(dir, "work");
  mkdirSync(work);
  const manifestPath = join(work, "edit.json");
  const transcriptPath = join(work, "final.txt");
  writeFileSync(manifestPath, JSON.stringify({ version: 1, scenes: [], qa: { allowAudioAtEnd: true } }));
  const file = synthAvWithTail(work, "final.mp4", { tone: 1 });
  writeFileSync(transcriptPath, "clean synthetic dialogue");
  const { status } = runQa([file, "--manifest", manifestPath, "--transcript", transcriptPath], dir);
  assert.equal(status, 0);
  assert.equal(readdirSync(join(work, ".ripple", "qa")).length, 1);
  assert.equal(existsSync(join(dir, ".ripple", "qa")), false);
});

test("blacks and freezes the manifest explains (an opening card) pass", { skip: !ffmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  // 2.5s black static "card" then 2s of moving footage — exactly what the
  // assembly renders for scenes: [{card, cardDuration: 2.5}, body].
  const file = synth(dir, "carded.mp4",
    ["color=c=black:s=64x36:r=10:d=2.5", "testsrc=s=64x36:r=10:d=2"],
    "[0]format=yuv420p[a];[1]format=yuv420p[b];[a][b]concat=n=2:v=1:a=0");
  writeFileSync(join(dir, "edit.json"), JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "a", source: "src.mp4", start: 10, end: 12, status: "locked", card: "Q?", cardDuration: 2.5 }],
  }));
  const { status, json } = runQa([file, "--manifest", join(dir, "edit.json"), "--no-snapshot"], dir);
  assert.equal(gate(json, "black-frames").ok, true, gate(json, "black-frames").detail);
  assert.equal(gate(json, "freeze-frames").ok, true, gate(json, "freeze-frames").detail);
  assert.equal(status, 1, JSON.stringify(json.checks));
});

test("bare `ripple qa` discovers the project manifest — a carded final must not fail red", { skip: !ffmpeg }, () => {
  // The docs say just "run ripple qa": without discovery, freeze regions
  // were [] and black regions edges-only, so every mid-timeline card (a
  // static picture fading through black by design) hard-failed a
  // defect-free final unless the caller re-ran with --manifest.
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "carded.mp4",
    ["color=c=black:s=64x36:r=10:d=2.5", "testsrc=s=64x36:r=10:d=2"],
    "[0]format=yuv420p[a];[1]format=yuv420p[b];[a][b]concat=n=2:v=1:a=0");
  writeFileSync(join(dir, "edit.json"), JSON.stringify({
    version: 1,
    scenes: [{ id: 1, slug: "a", source: "src.mp4", start: 10, end: 12, status: "locked", card: "Q?", cardDuration: 2.5 }],
  }));
  const { status, json } = runQa([file, "--no-snapshot"], dir); // no --manifest
  // Discovery is visible (cwd realpath may differ from the tmpdir alias).
  assert.match(json.manifest, /edit\.json$/);
  assert.equal(gate(json, "black-frames").ok, true, gate(json, "black-frames").detail);
  assert.equal(gate(json, "freeze-frames").ok, true, gate(json, "freeze-frames").detail);
  assert.equal(status, 1, JSON.stringify(json.checks));
});

test("agent-dialect leak patterns: (?i) is stripped, an invalid pattern fails loudly, never crashes", { skip: !ffmpeg }, () => {
  // A real session wrote "(?i)question number" (Python inline flag) into
  // edit.json and `ripple qa --transcribe` died with an unhandled regex
  // SyntaxError instead of reporting the gate.
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "clean.mp4", ["testsrc=s=64x36:r=10:d=2"]);
  const transcript = join(dir, "final.txt");
  writeFileSync(transcript, "And that is the final point. Question Number Four. What should change next?");
  const manifest = (patterns) => {
    writeFileSync(join(dir, "edit.json"), JSON.stringify({ version: 1, scenes: [], qa: { leakPatterns: patterns } }));
    return join(dir, "edit.json");
  };

  // (?i) prefix: stripped, still matches case-insensitively → a real leak, reported not thrown.
  const leaked = runQa([file, "--manifest", manifest(["(?i)question number"]), "--transcript", transcript, "--no-snapshot"], dir);
  assert.equal(leaked.status, 1, leaked.stderr);
  assert.equal(gate(leaked.json, "prompt-leak").ok, false);
  assert.match(gate(leaked.json, "prompt-leak").detail, /leaked: \(\?i\)question number/);

  // A pattern JS can't compile at all: the gate fails loudly (unverifiable ≠ pass).
  const invalid = runQa([file, "--manifest", manifest(["(unclosed"]), "--transcript", transcript, "--no-snapshot"], dir);
  assert.equal(invalid.status, 1);
  assert.equal(gate(invalid.json, "prompt-leak").ok, false);
  assert.match(gate(invalid.json, "prompt-leak").detail, /unusable leak pattern/);

  // Clean patterns over clean text still pass.
  const clean = runQa([file, "--manifest", manifest(["next question", "take [0-9]"]), "--transcript", transcript, "--no-snapshot"], dir);
  assert.equal(gate(clean.json, "prompt-leak").ok, true, gate(clean.json, "prompt-leak").detail);
});

test("manifest-less edge blacks (a normal fade-in from black) pass black-frames", { skip: !ffmpeg }, () => {
  // The bare-file PASS path: without a manifest only the file's own edges
  // excuse blacks. Deleting edgeRegions would fail every final that opens
  // with a fade from black — exactly the red-fatigue failure the gate's
  // design comment warns against.
  const dir = mkdtempSync(join(tmpdir(), "ripple-qa-"));
  const file = synth(dir, "fadein.mp4",
    ["color=c=black:s=64x36:r=10:d=0.5", "testsrc=s=64x36:r=10:d=2"],
    "[0]format=yuv420p[a];[1]format=yuv420p[b];[a][b]concat=n=2:v=1:a=0");
  const { status, json } = runQa([file, "--no-snapshot"], dir);
  const black = gate(json, "black-frames");
  assert.equal(black.ok, true, black.detail);
  assert.match(black.detail, /black region/); // the black was seen AND excused
  assert.equal(status, 1, JSON.stringify(json.checks));
});
