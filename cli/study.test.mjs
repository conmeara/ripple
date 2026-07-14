import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  computeStyleProfile, cuttingRhythm, energyProfile, fetchReference, gradeFingerprint, isUrl,
  pacingProfile, parseSignalstats, proposedVideoMd, quantile, silenceUsage, studyCacheKey, tailBehavior,
} from "./study.mjs";
import { findTool } from "./util.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "ripple-study-"));

// A missing ffmpeg must SKIP the fixture-driven tests (the house pattern:
// findTool + { skip: !ffmpeg }), never blow up module import and take the
// pure-function tests down with it.
const ffmpeg = findTool(["ffmpeg"]);

// Real fixtures, no network: lavfi color segments make real scene changes,
// solid warm/cool frames make a known grade lean.
function makeFixture(name, args) {
  const out = join(scratch, name);
  const res = spawnSync(ffmpeg, ["-hide_banner", "-v", "error", "-y", ...args, out], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  return out;
}

// Video-only on purpose: no audio stream means loadAnalysis skips whisper
// entirely, so the end-to-end tests are deterministic on any machine.
const warmFixture = ffmpeg ? makeFixture("warm.mp4", [
  "-f", "lavfi", "-i", "color=c=0xC06030:s=320x180:d=2:r=6",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
]) : null;
const coolFixture = ffmpeg ? makeFixture("cool.mp4", [
  "-f", "lavfi", "-i", "color=c=0x3060C0:s=320x180:d=2:r=6",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
]) : null;
// Three 10s segments (black/white/black): hard cuts at 10s and 20s. Segments
// must be long — sceneChangesFromMotion thresholds at mean+6σ of the whole
// track, and on a short track the spikes inflate their own threshold.
const scenesFixture = ffmpeg ? makeFixture("scenes.mp4", [
  "-f", "lavfi", "-i", "color=c=black:s=320x180:d=10:r=6",
  "-f", "lavfi", "-i", "color=c=white:s=320x180:d=10:r=6",
  "-f", "lavfi", "-i", "color=c=black:s=320x180:d=10:r=6",
  "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
]) : null;

// Subprocess runner: main() calls process.exit, and the yt-dlp shim needs a
// controlled PATH/HOME — both demand a child process, not an import.
const runner = join(scratch, "runner.mjs");
writeFileSync(runner,
  `import { main } from ${JSON.stringify(pathToFileURL(join(ROOT, "cli", "study.mjs")).href)};\n` +
  "await main(process.argv.slice(2));\n");

function runStudy(args, env = {}) {
  const res = spawnSync(process.execPath, [runner, ...args], {
    encoding: "utf8",
    cwd: scratch,
    env: { ...process.env, ...env },
  });
  let json = null;
  try {
    json = JSON.parse(res.stdout);
  } catch { /* asserted by callers */ }
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

test("isUrl detects schemes, not sites", () => {
  assert.ok(isUrl("https://www.youtube.com/watch?v=abc"));
  assert.ok(isUrl("https://youtu.be/abc"));
  assert.ok(isUrl("https://vimeo.com/12345"));
  assert.ok(isUrl("rtmp://host/live"));
  assert.ok(!isUrl("reference.mp4"));
  assert.ok(!isUrl("/abs/path/reference.mp4"));
  assert.ok(!isUrl("footage/take:2.mp4"));
});

test("quantile interpolates and survives single-element lists", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([4, 1, 3, 2], 0.25), 1.75); // sorts a copy
  assert.equal(quantile([7], 0.9), 7);
  assert.equal(quantile([], 0.5), null);
});

test("cuttingRhythm: shot stats, cuts/min, and the flat case", () => {
  const r = cuttingRhythm([10, 20], 30);
  assert.equal(r.shotCount, 3);
  assert.equal(r.medianShot, 10);
  assert.equal(r.p25Shot, 10);
  assert.equal(r.variance, 0);
  assert.equal(r.cutsPerMin, 4);
  assert.deepEqual(r.curve, [0, 8, 8, 0]);
  assert.equal(r.accelerates, false); // 2 cuts can't claim a shape
  assert.equal(cuttingRhythm(null, 30), null);
  assert.equal(cuttingRhythm([], 30), null);
});

test("cuttingRhythm detects acceleration from the quarter curve", () => {
  const cuts = [5, 20, 46, 48, 50, 52, 54, 56, 58, 59];
  const r = cuttingRhythm(cuts, 60);
  assert.deepEqual(r.curve, [4, 4, 0, 32]);
  assert.equal(r.accelerates, true);
});

test("a single-take cold open never fakes acceleration when the ending is also quiet", () => {
  // 9 cuts, all in the second quarter of a 480s reference: curve[0] is 0,
  // so `curve[3] >= curve[0] * 1.3` was trivially true and VIDEO.md got an
  // "accelerates toward the end" receipt for an edit whose cutting rate
  // falls to zero.
  const cuts = [125, 130, 135, 140, 145, 150, 155, 160, 165];
  const r = cuttingRhythm(cuts, 480);
  assert.deepEqual(r.curve, [0, 4.5, 0, 0]);
  assert.equal(r.accelerates, false);
  // A cold open followed by a genuinely accelerating back half still reads.
  const hot = cuttingRhythm([130, 200, 400, 410, 420, 430, 440, 450, 460, 470], 480);
  assert.equal(hot.accelerates, true);
});

test("studyCacheKey: distinct raw ids never share a cache dir", () => {
  // yt-dlp's generic direct-link id is the URL basename: "My Clip.mp4" and
  // "My_Clip.mp4" are different references, but the bare sanitizer collapsed
  // both to My_Clip — the second study silently measured the first video
  // and --force evicted its download.
  assert.notEqual(studyCacheKey("My Clip"), studyCacheKey("My_Clip"));
  assert.notEqual(studyCacheKey("a:b"), studyCacheKey("a/b"));
  assert.notEqual(studyCacheKey("a:b"), studyCacheKey("a b"));
  // Already-clean ids (every YouTube id) keep their exact dir: cache hits
  // across releases survive.
  assert.equal(studyCacheKey("vid123"), "vid123");
  assert.equal(studyCacheKey("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  // Whatever comes in, the key stays filesystem-safe.
  for (const raw of ["My Clip", "a:b", "a/b", "ünïcode id"]) {
    assert.match(studyCacheKey(raw), /^[A-Za-z0-9._-]+$/, raw);
  }
});

test("pacingProfile summarizes wps and skips null-wps sentences", () => {
  const p = pacingProfile([
    { wps: 2 }, { wps: 3 }, { wps: 4 }, { wps: null },
  ]);
  assert.equal(p.sentences, 3);
  assert.equal(p.medianWps, 3);
  assert.equal(p.minWps, 2);
  assert.equal(p.maxWps, 4);
  assert.equal(pacingProfile(null), null);
  assert.equal(pacingProfile([{ wps: null }]), null);
});

test("tailBehavior measures the gap between sentence ends and the next cut", () => {
  const sentences = [
    { start: 0, end: 5 },
    { start: 8, end: 12 },
    { start: 15, end: 20 }, // nearest cut is 4s away: outside the window
    { start: 26, end: 30 },
  ];
  const cuts = [5.8, 12.7, 24, 31];
  const t = tailBehavior(sentences, cuts);
  assert.equal(t.samples, 3); // 0.8, 0.7, 1.0
  assert.equal(t.p50, 0.8);
  assert.equal(t.inferredTail, 0.8);
  assert.equal(tailBehavior(null, cuts), null);
  assert.equal(tailBehavior(sentences, []), null);
});

test("tailBehavior excludes cuts that land after the next sentence starts", () => {
  // Speech flows across the cut at 5.8 — a B-roll change, not a tail.
  const t = tailBehavior(
    [{ start: 0, end: 5 }, { start: 5.5, end: 9 }],
    [5.8]
  );
  assert.equal(t, null);
});

test("tailBehavior clamps timing slop to a zero gap, not a negative one", () => {
  const t = tailBehavior([{ start: 0, end: 5 }], [4.9]);
  assert.equal(t.samples, 1);
  assert.equal(t.p50, 0);
  assert.equal(t.inferredTail, 0);
});

test("silenceUsage reads speech ratio and holds off the index shape", () => {
  const s = silenceUsage({
    hasAudio: true,
    duration: 10,
    speech: [{ start: 0, end: 8 }],
    silences: { "-40dB": [{ start: 8, end: null }, { start: 3, end: 3.4 }] },
  });
  assert.equal(s.speechRatio, 0.8);
  assert.equal(s.silenceRatio, 0.2);
  assert.equal(s.longestHold, 2); // open-ended span runs to EOF
  assert.equal(s.holdsOver1s, 1);
  assert.equal(silenceUsage({ hasAudio: false, duration: 10 }), null);
});

test("energyProfile classifies spread and drops digital silence", () => {
  const flat = Array.from({ length: 10 }, (_, i) => ({ t: i, db: -25 + (i % 2) * 0.4 }));
  assert.equal(energyProfile(flat).character, "flat");
  const dynamic = Array.from({ length: 10 }, (_, i) => ({ t: i, db: i % 2 ? -15 : -40 }));
  const e = energyProfile(dynamic);
  assert.equal(e.character, "dynamic");
  assert.ok(e.spreadDb > 12, `spread ${e.spreadDb}`);
  const withSilence = [...flat, { t: 99, db: -120 }, { t: 100, db: -120 }];
  assert.equal(energyProfile(withSilence).windows, 10); // -120 excluded
  assert.equal(energyProfile([{ t: 0, db: -20 }]), null); // too few windows
});

test("parseSignalstats reads the metadata frame", () => {
  const stats = parseSignalstats([
    "frame:0    pts:0       pts_time:0",
    "lavfi.signalstats.YAVG=118.53",
    "lavfi.signalstats.UAVG=120.2",
    "lavfi.signalstats.VAVG=133.9",
    "lavfi.signalstats.SATAVG=45.1",
    "lavfi.signalstats.YLOW=20",
    "lavfi.signalstats.YHIGH=230",
  ].join("\n"));
  assert.equal(stats.YAVG, 118.53);
  assert.equal(stats.VAVG, 133.9);
  assert.equal(stats.YHIGH, 230);
});

test("gradeFingerprint reads a warm lean off warm frames", { skip: !ffmpeg }, () => {
  const g = gradeFingerprint(warmFixture, 2, { samples: 4 });
  assert.equal(g.frames, 4);
  assert.equal(g.lean, "warm");
  assert.ok(g.warmth > 4, `warmth ${g.warmth}`);
  assert.ok(g.brightness > 40 && g.brightness < 220, `brightness ${g.brightness}`);
});

test("gradeFingerprint reads a cool lean off cool frames", { skip: !ffmpeg }, () => {
  const g = gradeFingerprint(coolFixture, 2, { samples: 4 });
  assert.equal(g.lean, "cool");
  assert.ok(g.warmth < -4, `warmth ${g.warmth}`);
});

test("computeStyleProfile wires the index fields to each measurement", () => {
  const index = {
    duration: 30,
    hasAudio: true,
    speech: [{ start: 0, end: 24 }],
    silences: { "-40dB": [{ start: 24, end: 27 }] },
    sentences: [
      { start: 0, end: 9.5, wps: 2.5 },
      { start: 11, end: 19.2, wps: 3.1 },
      { start: 21, end: 24, wps: 2.8 },
    ],
    sceneChanges: [10.3, 20.0],
    rms: { windowSec: 0.5, values: Array.from({ length: 8 }, (_, i) => ({ t: i, db: i % 2 ? -18 : -36 })) },
  };
  const p = computeStyleProfile(index);
  assert.equal(p.cuttingRhythm.medianShot, 10);
  assert.equal(p.tail.samples, 2); // 9.5→10.3 (0.8) and 19.2→20.0 (0.8)
  assert.equal(p.tail.inferredTail, 0.8);
  assert.equal(p.pacing.medianWps, 2.8);
  assert.equal(p.silence.speechRatio, 0.8);
  assert.equal(p.energy.character, "dynamic");
});

test("proposedVideoMd carries the measurement receipt on every value", () => {
  const md = proposedVideoMd({
    tail: { inferredTail: 0.8, p25: 0.55, p50: 0.79, p75: 1.02, samples: 41 },
    pacing: { sentences: 57, medianWps: 2.9, p25Wps: 2.4, p75Wps: 3.4, minWps: 1, maxWps: 5 },
    cuttingRhythm: { cuts: 40, shotCount: 41, medianShot: 3.2, p25Shot: 1.9, p75Shot: 5.6, variance: 4.1, cutsPerMin: 18.4, curve: [12, 16, 20, 26], accelerates: true },
    silence: { speechRatio: 0.84, silenceRatio: 0.16, longestHold: 2.7, holdsOver1s: 6 },
    energy: { windows: 200, medianDb: -27.3, p10Db: -35, p90Db: -20.8, spreadDb: 14.2, character: "dynamic" },
    grade: { frames: 12, brightness: 142, saturation: 62, uMean: 124, vMean: 130.2, warmth: 6.2, lean: "warm", contrastSpread: 118 },
  }, { sourceName: "ref.mp4" });
  assert.match(md, /Tail after final words: 0\.8s — measured p50 0\.79s across 41 cut-adjacent sentence ends/);
  assert.match(md, /median 2\.9 wps across 57 sentences/);
  assert.match(md, /median 3\.2s .* at 18\.4 cuts\/min — accelerates/);
  assert.match(md, /warm \(V−U \+6\.2\)/);
  assert.match(md, /measured from ref\.mp4/);
});

test("proposedVideoMd says 'unmeasured' instead of inventing a tail", () => {
  const md = proposedVideoMd({ tail: null, pacing: null, cuttingRhythm: null, silence: null, energy: null, grade: null });
  assert.match(md, /Tail after final words: unmeasured/);
  assert.match(md, /no hard cuts detected/);
  assert.ok(!/undefined|NaN/.test(md));
});

test("end-to-end on a local fixture: real scene changes → shot stats", { skip: !ffmpeg }, () => {
  const home = join(scratch, "home-local");
  mkdirSync(home, { recursive: true });
  const { status, json, stderr } = runStudy([scenesFixture], { HOME: home });
  assert.equal(status, 0, stderr);
  assert.equal(json.ok, true);
  assert.equal(json.source.kind, "file");
  const rhythm = json.styleProfile.cuttingRhythm;
  assert.equal(rhythm.shotCount, 3);
  assert.ok(Math.abs(rhythm.medianShot - 10) < 0.5, `medianShot ${rhythm.medianShot}`);
  assert.ok(Math.abs(rhythm.cutsPerMin - 4) < 0.3, `cutsPerMin ${rhythm.cutsPerMin}`);
  // Video-only source: every audio-derived measurement is honestly null.
  assert.equal(json.styleProfile.tail, null);
  assert.equal(json.styleProfile.pacing, null);
  assert.equal(json.styleProfile.silence, null);
  assert.ok(json.styleProfile.grade);
  assert.match(json.proposedVideoMd, /Tail after final words: unmeasured/);
  assert.ok(existsSync(json.index));
});

test("study on a missing local file is a usage error", () => {
  const { status, json } = runStudy([join(scratch, "nope.mp4")]);
  assert.equal(status, 2);
  assert.equal(json.ok, false);
  assert.match(json.error.message, /not found/i);
});

// --- URL path: yt-dlp stubbed by a PATH shim; zero network ---

const shimDir = join(scratch, "shim");
mkdirSync(shimDir, { recursive: true });
const shimLog = join(scratch, "ytdlp.log");
writeFileSync(join(shimDir, "yt-dlp"), [
  "#!/bin/sh",
  'echo "$@" >> "$YTDLP_LOG"',
  'case "$*" in *"--skip-download"*) echo "vid123"; exit 0;; esac',
  'out=""; prev=""',
  'for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done',
  "out=$(printf '%s' \"$out\" | sed -e 's/%(id)s/vid123/' -e 's/%(ext)s/mp4/')",
  'cp "$YTDLP_FIXTURE" "$out"',
].join("\n") + "\n");
chmodSync(join(shimDir, "yt-dlp"), 0o755);

const urlHome = join(scratch, "home-url");
mkdirSync(urlHome, { recursive: true });
const URL_ENV = {
  HOME: urlHome,
  PATH: `${shimDir}:${process.env.PATH}`,
  YTDLP_LOG: shimLog,
  YTDLP_FIXTURE: warmFixture,
};
const downloads = () =>
  readFileSync(shimLog, "utf8").split("\n").filter((l) => l.includes("--merge-output-format")).length;

test("URL study downloads once, caches, and --force refetches", { skip: !ffmpeg }, () => {
  const url = "https://www.youtube.com/watch?v=vid123";

  const first = runStudy([url], URL_ENV);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.json.source.kind, "url");
  assert.equal(first.json.source.videoId, "vid123");
  assert.equal(first.json.source.downloadCached, false);
  assert.ok(first.json.file.startsWith(join(urlHome, ".ripple", "study", "vid123")));
  assert.equal(downloads(), 1);
  // The downloaded reference went through the real pipeline.
  assert.equal(first.json.styleProfile.grade.lean, "warm");
  assert.match(first.json.proposedVideoMd, /Temperature: warm/);

  const second = runStudy([url], URL_ENV);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.json.source.downloadCached, true);
  assert.equal(downloads(), 1); // cache hit: metadata probe only, no re-download

  const forced = runStudy([url, "--force"], URL_ENV);
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(forced.json.source.downloadCached, false);
  assert.equal(downloads(), 2);
});

test("URL study without yt-dlp fails fast with exit 2 and an install hint", () => {
  // A PATH that PROVABLY lacks yt-dlp: system dirs vary by distro (apt
  // installs yt-dlp to /usr/bin on Debian, which would turn this test into
  // a real network probe), so build a dir holding only `which`.
  const bareBin = join(scratch, "bare-bin");
  mkdirSync(bareBin, { recursive: true });
  const whichPath = spawnSync("which", ["which"], { encoding: "utf8" }).stdout.trim() || "/usr/bin/which";
  if (!existsSync(join(bareBin, "which"))) symlinkSync(whichPath, join(bareBin, "which"));
  const { status, json } = runStudy(
    ["https://www.youtube.com/watch?v=vid123"],
    { HOME: urlHome, PATH: bareBin }
  );
  assert.equal(status, 2);
  assert.equal(json.ok, false);
  assert.match(json.error.message, /yt-dlp not found/);
  assert.match(json.error.hint, /brew install yt-dlp/);
});

test("fetchReference is exported with cache semantics (direct call)", { skip: !ffmpeg }, () => {
  // Direct in-process call against the same shim PATH: node child_process
  // reads PATH from the env we set for THIS process, so scope it tightly.
  const oldPath = process.env.PATH;
  const oldHome = process.env.HOME;
  process.env.PATH = `${shimDir}:${oldPath}`;
  process.env.HOME = join(scratch, "home-direct");
  process.env.YTDLP_LOG = shimLog;
  process.env.YTDLP_FIXTURE = warmFixture;
  mkdirSync(process.env.HOME, { recursive: true });
  try {
    const fetched = fetchReference("https://youtu.be/vid123");
    assert.equal(fetched.id, "vid123");
    assert.equal(fetched.cached, false);
    assert.ok(existsSync(fetched.file));
    const again = fetchReference("https://youtu.be/vid123");
    assert.equal(again.cached, true);
    assert.equal(again.file, fetched.file);
  } finally {
    process.env.PATH = oldPath;
    process.env.HOME = oldHome;
  }
});
