import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assemblyDuration, assemblyTimeline, buildAssemblyFilter, buildConcatFilter, buildEncodeArgs, buildMusicFilter, buildSceneVf, clipName, directJoins, geometryChain, jumpCutFinding, jumpCutReading, microFadeChain, MICRO_FADE, offBeatFinding, segmentBoundaries,
  expectedLeadingSilence, setparamsFilter, validateManifest,
} from "./cut.mjs";
import { RULE_INDEX } from "./rules.mjs";

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

test("validateManifest checks the music bed", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-test-"));
  writeFileSync(join(dir, "src.mp4"), "stub");
  writeFileSync(join(dir, "bed.mp3"), "stub");

  const ok = validateManifest(
    { version: 1, scenes: [sceneFixture()], music: { source: "bed.mp3", gainDb: -16 } },
    dir
  );
  assert.deepEqual(ok, []);

  const errors = validateManifest(
    { version: 1, scenes: [sceneFixture()], music: { source: "missing.mp3", gainDb: "loud" } },
    dir
  );
  assert.ok(errors.some((e) => e.includes("music: source not found")));
  assert.ok(errors.some((e) => e.includes("gainDb must be a number")));

  const noSource = validateManifest({ version: 1, scenes: [sceneFixture()], music: {} }, dir);
  assert.ok(noSource.some((e) => e.includes("music: missing source")));
});

test("assemblyDuration mirrors segment math: cards added, jcut heads subtracted", () => {
  // scene 1: plain 4s body; scene 2: 2.5s card + 10s body with a 1s j-cut head under the card
  const scenes = [
    sceneFixture({ start: 0, end: 4 }),
    sceneFixture({ id: 2, slug: "q2", start: 10, end: 20, card: "Q2?", jcut: 1 }),
  ];
  assert.equal(assemblyDuration(scenes), 4 + 2.5 + 10 - 1);
  // cardFile without card: card duration counts, but jcut is ignored (as in main())
  assert.equal(assemblyDuration([sceneFixture({ start: 0, end: 4, cardFile: "c.png", jcut: 1 })]), 6.5);
});

test("buildMusicFilter gains, fades, ducks under dialogue, and mixes without renormalizing", () => {
  const filter = buildMusicFilter(
    { source: "bed.mp3", gainDb: -16, duck: { threshold: 0.05, ratio: 10 }, fadeIn: 0.5, fadeOut: 2, loudnessTarget: -14 },
    { inputIndex: 5, total: 60 }
  );
  assert.ok(filter.startsWith("[5:a]"));
  assert.ok(filter.includes("volume=-16dB"));
  assert.ok(filter.includes("afade=t=in:d=0.5"));
  assert.ok(filter.includes("afade=t=out:st=58:d=2"));
  assert.ok(filter.includes("sidechaincompress=threshold=0.05:ratio=10"));
  assert.ok(filter.includes("[a]asplit=2[dlg][sc]"));
  assert.ok(filter.includes("amix=inputs=2:duration=first:normalize=0"));
  assert.ok(filter.includes("loudnorm=I=-14"));
  assert.ok(filter.endsWith("[amix]"));
});

test("buildMusicFilter defaults are sane and omit loudnorm without a target", () => {
  const filter = buildMusicFilter({ source: "bed.mp3" }, { inputIndex: 2, total: 30 });
  assert.ok(filter.includes("volume=-18dB"));
  assert.ok(filter.includes("sidechaincompress=threshold=0.03:ratio=8"));
  assert.ok(filter.includes("afade=t=in:d=1"));
  assert.ok(filter.includes("afade=t=out:st=28:d=2"));
  assert.ok(!filter.includes("loudnorm"));
});

test("expectedLeadingSilence: card silence minus J-cut head, else 0", () => {
  assert.equal(expectedLeadingSilence([{ slug: "a", start: 0, end: 5 }]), 0);
  assert.equal(expectedLeadingSilence([{ slug: "a", card: "Q1", start: 0, end: 5 }]), 2.5);
  assert.equal(expectedLeadingSilence([{ slug: "a", card: "Q1", cardDuration: 4, start: 0, end: 5 }]), 4);
  assert.equal(expectedLeadingSilence([{ slug: "a", card: "Q1", cardDuration: 4, jcut: 1.5, start: 0, end: 5 }]), 2.5);
  // cardFile without card: jcut is ignored by the renderer, so full duration.
  assert.equal(expectedLeadingSilence([{ slug: "a", cardFile: "x.png", cardDuration: 3, jcut: 1, start: 0, end: 5 }]), 3);
  assert.equal(expectedLeadingSilence([]), 0);
  assert.equal(expectedLeadingSilence(undefined), 0);
});

test("jumpCutReading bands: continuous / risk / clean change", () => {
  assert.equal(jumpCutReading(1.2), "continuous");
  assert.equal(jumpCutReading(7.5), "jump-cut risk");
  assert.equal(jumpCutReading(30), "clean change");
});

test("jump-cut and off-beat findings carry registered render-rule ids", () => {
  const f = jumpCutFinding({ slug: "a" }, { slug: "b" }, 7.5);
  assert.equal(f.rule, "jump-cut");
  assert.equal(f.join, "a→b");
  assert.match(f.detail, /possible jump cut at a→b \(frame diff 7.5/);
  // Continuous and clean-change joins produce nothing.
  assert.equal(jumpCutFinding({ slug: "a" }, { slug: "b" }, 1.2), null);
  assert.equal(jumpCutFinding({ slug: "a" }, { slug: "b" }, 30), null);

  const ob = offBeatFinding({ bpm: 120, offGrid: 3 });
  assert.equal(ob.rule, "off-beat");
  assert.match(ob.detail, /3 visual boundaries land off the music grid/);
  assert.equal(offBeatFinding({ bpm: 120, offGrid: 0 }), null);
  assert.equal(offBeatFinding(undefined), null);

  for (const id of ["jump-cut", "off-beat"]) {
    assert.equal(RULE_INDEX.get(id)?.phase, "render", id);
    assert.equal(RULE_INDEX.get(id)?.severity, "warn", id);
  }
});

test("directJoins skips joins hidden by a card or bridged by a transition", () => {
  const scenes = [
    sceneFixture({ id: 1, slug: "a" }),
    sceneFixture({ id: 2, slug: "b", card: "Q2" }),
    sceneFixture({ id: 3, slug: "c" }),
    sceneFixture({ id: 4, slug: "d", cardFile: "d.png" }),
    sceneFixture({ id: 5, slug: "e" }),
    // The welcome→registry regression: a fadeblack bridges this join, so its
    // two frames never sit adjacent — nothing to score for a jump cut.
    sceneFixture({ id: 6, slug: "f", transition: { type: "fadeblack", duration: 0.5 } }),
    sceneFixture({ id: 7, slug: "g" }),
  ];
  const joins = directJoins(scenes).map(([x, y]) => `${x.slug}→${y.slug}`);
  assert.deepEqual(joins, ["b→c", "d→e", "f→g"]); // f→g stays a scored direct join
});

test("assemblyTimeline: lcut trims the body and lands its tail under the next card", () => {
  const scenes = [
    { slug: "a", source: "s.mov", start: 10, end: 14, lcut: 1 },
    { slug: "b", source: "s.mov", start: 20, end: 24, card: "Q", cardDuration: 2.5, jcut: 0.5 },
  ];
  const tl = assemblyTimeline(scenes);
  assert.deepEqual(tl.map((s) => [s.kind, s.slug, s.outStart, s.outEnd]), [
    ["body", "a", 0, 3], // 4s scene minus 1s lcut
    ["card", "b", 3, 5.5],
    ["body", "b", 5.5, 9],
  ]);
  assert.equal(tl[0].sourceEnd, 13); // picture leaves 1s early
  const audio = tl[1].audio;
  assert.deepEqual(audio.map((a) => a.kind), ["lcut", "silence", "jcut"]);
  assert.deepEqual([audio[0].sourceStart, audio[0].sourceEnd, audio[0].outStart], [13, 14, 3]);
  assert.deepEqual([audio[2].sourceStart, audio[2].sourceEnd, audio[2].outStart], [20, 20.5, 5]);
});

test("assemblyTimeline: transitions overlap and shorten the assembly", () => {
  const scenes = [
    { slug: "a", source: "s.mov", start: 0, end: 5 },
    { slug: "b", source: "s.mov", start: 10, end: 15, transition: { type: "dissolve", duration: 1 } },
  ];
  const tl = assemblyTimeline(scenes);
  assert.equal(tl[1].outStart, 4); // starts under a's last second
  assert.equal(tl[1].outEnd, 9);
  assert.deepEqual(tl[1].transitionIn, { type: "dissolve", duration: 1 });
  assert.equal(assemblyDuration(scenes), 9); // 5 + 5 − 1
  const bounds = segmentBoundaries(scenes);
  assert.deepEqual(bounds, [{ t: 4.5, label: "b body", transition: "dissolve" }]); // midpoint
});

test("buildAssemblyFilter: no transitions delegates to plain concat", () => {
  const geo = { width: 1280, height: 720, fps: "30", pixFmt: "yuv420p", color: { mode: "sdr" } };
  const meta = [{ duration: 4 }, { duration: 5 }];
  assert.equal(buildAssemblyFilter(meta, geo), buildConcatFilter(2, geo));
});

test("buildAssemblyFilter: xfade offsets, planar chain, terminal format restore", () => {
  const geo = { width: 1280, height: 720, fps: "30", pixFmt: "p010le", color: { mode: "hdr", transfer: "arib-std-b67" } };
  const meta = [
    { duration: 4 },
    { duration: 5 }, // hard join
    { duration: 6, transitionIn: { type: "dissolve", duration: 1 } },
    { duration: 3, transitionIn: { type: "fadeblack", duration: 0.5 } },
  ];
  const f = buildAssemblyFilter(meta, geo);
  assert.match(f, /format=yuv420p10le\[v0\]/); // planar through the chain
  assert.match(f, /concat=n=2:v=1:a=1\[vc1\]\[ac1\]/); // hard join pairwise
  assert.match(f, /\[vc1\]fps=30\[vcf1\]/); // concat re-stamp
  assert.match(f, /xfade=transition=fade:duration=1:offset=8\[vx2\]/); // 4+5−1
  assert.match(f, /xfade=transition=fadeblack:duration=0.5:offset=13.5\[vx3\]/); // 9+6−1 −0.5
  assert.match(f, /acrossfade=d=1\[ax2\]/);
  assert.match(f, /format=p010le,setparams=[^[]*arib-std-b67[^[]*\[v\]/); // terminal restore
  assert.match(f, /anull\[a\]$/);
});

test("microFadeChain: 30ms fades both ends by default, appended to the audio chain", () => {
  assert.equal(MICRO_FADE, 0.03);
  // A comfortably long segment: full 30ms in and out, fade-out anchored at end−d.
  assert.equal(microFadeChain(4), ",afade=t=in:d=0.03,afade=t=out:st=3.97:d=0.03");
  // The chain drops onto the tail of an existing filter without its own comma trouble.
  assert.ok(`aresample=48000${microFadeChain(4)}`.startsWith("aresample=48000,afade=t=in"));
});

test("microFadeChain: J/L-cut sides suppress the touching fade to protect continuous audio", () => {
  // jcut>0 → body head continues the card's J-cut audio: fade OUT only.
  assert.equal(microFadeChain(6, { in: false }), ",afade=t=out:st=5.97:d=0.03");
  // lcut>0 → body tail continues under the next card: fade IN only.
  assert.equal(microFadeChain(6, { out: false }), ",afade=t=in:d=0.03");
  // Both suppressed (jcut>0 and lcut>0): no fade at all.
  assert.equal(microFadeChain(6, { in: false, out: false }), "");
});

test("microFadeChain: clamps to duration/4 for sub-120ms clips, off when disabled or zero", () => {
  // 80ms clip: 30ms won't fit twice, clamp to 20ms each side.
  assert.equal(microFadeChain(0.08), ",afade=t=in:d=0.02,afade=t=out:st=0.06:d=0.02");
  assert.equal(microFadeChain(4, { enabled: false }), "");
  assert.equal(microFadeChain(0), "");
});

test("geometryChain: pad default, crop reframe, source-pixel rect first", () => {
  assert.equal(
    geometryChain({ width: 1920, height: 1080 }),
    ",scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"
  );
  assert.equal(
    geometryChain({ width: 1080, height: 1920, fit: "crop" }),
    ",scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
  );
  assert.match(
    geometryChain({ width: 1080, height: 1920, fit: "crop", cropRect: { x: 854, y: 0, w: 426, h: 720 } }),
    /^,crop=426:720:854:0,scale=1080:1920/
  );
  assert.equal(geometryChain({}), "");
});

test("validateManifest: lcut and transition rules", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-test-"));
  writeFileSync(join(dir, "src.mp4"), "stub");
  const errs = (scenes) => validateManifest({ version: 1, scenes }, dir);

  // lcut without a following card
  assert.ok(errs([sceneFixture({ lcut: 1 }), sceneFixture({ id: 2, slug: "b" })])
    .some((e) => e.includes("lcut needs a following scene with a card")));
  // lcut + next jcut exceed the card
  assert.ok(errs([
    sceneFixture({ lcut: 2 }),
    sceneFixture({ id: 2, slug: "b", card: "Q", cardDuration: 2.5, jcut: 1 }),
  ]).some((e) => e.includes("exceed the next card")));
  // valid lcut passes
  assert.deepEqual(errs([
    sceneFixture({ start: 0, end: 10, lcut: 1 }),
    sceneFixture({ id: 2, slug: "b", card: "Q", cardDuration: 2.5, jcut: 1 }),
  ]), []);
  // transition on scene 1
  assert.ok(errs([sceneFixture({ transition: { type: "dissolve", duration: 0.5 } })])
    .some((e) => e.includes("needs a preceding scene")));
  // bad type
  assert.ok(errs([sceneFixture(), sceneFixture({ id: 2, slug: "b", transition: { type: "wipe", duration: 1 } })])
    .some((e) => e.includes('must be "dissolve" or "fadeblack"')));
  // too long for its neighbors (scenes are 4s each; 5s dissolve)
  assert.ok(errs([sceneFixture(), sceneFixture({ id: 2, slug: "b", transition: { type: "dissolve", duration: 5 } })])
    .some((e) => e.includes("shorter than both adjacent segments")));
  // valid transition passes
  assert.deepEqual(errs([sceneFixture(), sceneFixture({ id: 2, slug: "b", transition: { type: "dissolve", duration: 1 } })]), []);
});

test("validateManifest: output fit and crop rules", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-test-"));
  writeFileSync(join(dir, "src.mp4"), "stub");
  const base = { version: 1, scenes: [sceneFixture()] };
  assert.ok(validateManifest({ ...base, output: { fit: "stretch" } }, dir).some((e) => e.includes("output.fit")));
  assert.ok(validateManifest({ ...base, output: { crop: { x: 0, y: 0, w: 0, h: 10 } } }, dir).some((e) => e.includes("output.crop")));
  assert.deepEqual(validateManifest({ ...base, output: { fit: "crop", crop: { x: 10, y: 0, w: 400, h: 700 } } }, dir), []);
});

test("validateManifest: jcut type/range and cardDuration guards (review findings)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-test-"));
  writeFileSync(join(dir, "src.mp4"), "stub");
  const errs = (scene) => validateManifest({ version: 1, scenes: [scene] }, dir);
  assert.ok(errs(sceneFixture({ card: "Q", jcut: -1 })).some((e) => e.includes("non-negative")));
  assert.ok(errs(sceneFixture({ card: "Q", jcut: "1" })).some((e) => e.includes("non-negative")));
  assert.ok(errs(sceneFixture({ card: "Q", cardDuration: 2.5, jcut: 4 })).some((e) => e.includes("exceeds the card duration")));
  assert.ok(errs(sceneFixture({ card: "Q", cardDuration: "2.5" })).some((e) => e.includes("cardDuration must be a positive number")));
  assert.deepEqual(errs(sceneFixture({ card: "Q", cardDuration: 3, jcut: 1 })), []);
});

test("validateManifest: back-to-back transitions and lcut+transition conflicts", () => {
  const dir = mkdtempSync(join(tmpdir(), "ripple-test-"));
  writeFileSync(join(dir, "src.mp4"), "stub");
  // b is 2s squeezed by 1.9s in + 1.9s out.
  const squeeze = validateManifest({ version: 1, scenes: [
    sceneFixture({ start: 0, end: 10 }),
    sceneFixture({ id: 2, slug: "b", start: 20, end: 22, transition: { type: "dissolve", duration: 1.9 } }),
    sceneFixture({ id: 3, slug: "c", start: 30, end: 40, transition: { type: "dissolve", duration: 1.9 } }),
  ] }, dir);
  assert.ok(squeeze.some((e) => e.includes("consume the whole segment")));
  // lcut into a transitioned join is incoherent.
  const conflict = validateManifest({ version: 1, scenes: [
    sceneFixture({ start: 0, end: 10, lcut: 1 }),
    sceneFixture({ id: 2, slug: "b", card: "Q", start: 20, end: 30, transition: { type: "dissolve", duration: 1 } }),
  ] }, dir);
  assert.ok(conflict.some((e) => e.includes("cannot combine with the previous scene's lcut")));
});
