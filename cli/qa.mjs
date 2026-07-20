import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { assemblyTimeline, clipName, expectedLeadingSilence } from "./cut.mjs";
import { resolveManifestPath } from "./status.mjs";
import {
  detectHdr, fail, ffprobeJson, output, parseArgs, parseLoudnorm, parseSilence, readJsonOrNull, requireTool, round3, run, silenceEdges,
} from "./util.mjs";

const DEFAULT_LEAK_PATTERNS = ["next question", "take [0-9]"];
const SILENCE_THRESHOLDS_DB = [-35, -40, -45];

function check(id, ok, detail) {
  const passed = Boolean(ok);
  return { id, ok: passed, status: passed ? "pass" : "fail", verified: true, detail };
}

function notVerifiedCheck(id, detail) {
  return { id, ok: null, status: "not-verified", verified: false, skipped: true, detail };
}

// Silence detection runs on the audio stream, whose EOF may be a few frames
// earlier than the video/container EOF. Comparing detector timestamps to the
// format duration made real trailing silence look like `0s` (the case-40
// false green). Always close silence spans on the timeline they were measured
// against.
export function audioTimelineDuration(probe) {
  const audio = (probe?.streams ?? []).find((s) => s.codec_type === "audio");
  if (!audio) return null;
  const streamDuration = Number(audio.duration);
  if (streamDuration > 0) return streamDuration;
  const formatDuration = Number(probe?.format?.duration);
  return formatDuration > 0 ? formatDuration : null;
}

export function measuredSilenceEdges(stderr, probe) {
  const duration = audioTimelineDuration(probe);
  return duration ? silenceEdges(parseSilence(stderr), duration) : null;
}

export function conservativeSilenceEdges(measurements) {
  return {
    leading: round3(Math.min(...measurements.map((m) => m.leading))),
    tail: round3(Math.min(...measurements.map((m) => m.tail))),
  };
}

export function trailingRmsSilence(frames, duration, thresholdDb = -48) {
  if (!frames.length || !(duration > 0)) return 0;
  const deltas = frames.slice(1).map((f, i) => f.time - frames[i].time).filter((n) => n > 0 && n < 1);
  const frameDuration = deltas.length ? deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : 0;
  const lastActive = frames.findLast((f) => f.db > thresholdDb);
  const activeEnd = lastActive ? lastActive.time + frameDuration : 0;
  return round3(Math.max(0, duration - activeEnd));
}

function detectRmsTail(ffmpeg, file, probe, thresholdDb = -48) {
  const duration = audioTimelineDuration(probe);
  const res = run(ffmpeg, [
    "-hide_banner", "-nostats", "-i", file, "-vn", "-map", "0:a:0",
    "-af", "asetpts=N/SR/TB,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
    "-f", "null", "-",
  ]);
  if (res.status !== 0) return { ok: false, error: `RMS edge analysis failed: ${res.stderr.trim().slice(-180)}` };
  const frames = [];
  let time = null;
  for (const line of res.stderr.split("\n")) {
    const pts = line.match(/pts_time:([\d.]+)/);
    if (pts) time = Number(pts[1]);
    const rms = line.match(/lavfi\.astats\.Overall\.RMS_level=(-?inf|-?[\d.]+)/i);
    if (rms && time !== null) {
      frames.push({ time, db: rms[1].toLowerCase() === "-inf" ? -Infinity : Number(rms[1]) });
    }
  }
  if (!frames.length) return { ok: false, error: "RMS edge analysis returned no audio frames" };
  return { ok: true, tail: trailingRmsSilence(frames, duration, thresholdDb), thresholdDb };
}

function detectSilenceEdges(ffmpeg, file, probe) {
  const measurements = [];
  for (const noiseDb of SILENCE_THRESHOLDS_DB) {
    const res = run(ffmpeg, [
      "-hide_banner", "-nostats", "-i", file,
      "-vn", "-map", "0:a:0", "-af", `silencedetect=noise=${noiseDb}dB:d=0.25`, "-f", "null", "-",
    ]);
    if (res.status !== 0) {
      return { ok: false, error: `silencedetect ${noiseDb}dB failed: ${res.stderr.trim().slice(-180)}` };
    }
    const edges = measuredSilenceEdges(res.stderr, probe);
    measurements.push({ noiseDb, ...edges });
  }
  const rms = detectRmsTail(ffmpeg, file, probe);
  if (!rms.ok) return rms;
  const edges = conservativeSilenceEdges(measurements);
  // silencedetect is peak-sensitive; encoded room tone can briefly cross
  // -45dB even while the whole end window sits around -54dB. RMS catches that
  // sustained dead tail. Taking the longer tail is conservative: quiet speech
  // can trigger review, but it can never be mislabeled as a safe boundary.
  edges.tail = round3(Math.max(edges.tail, rms.tail));
  const evidence = measurements.map((m) => `${m.noiseDb}dB: lead ${m.leading}s / tail ${m.tail}s`).join(", ") +
    `, RMS ${rms.thresholdDb}dB: tail ${rms.tail}s`;
  return { ok: true, edges, measurements, rms, evidence };
}

// A natural dialogue cut needs some measured room tone after the last sound,
// but not an excessive dead tail. Audio right up to OUT is allowed only when
// a machine-readable manifest field explains it. The exemption never excuses
// too much silence.
export function assessTailSilence({ tail, maxTail, exemption = null }) {
  if (tail > maxTail) {
    return { ok: false, detail: `${tail}s trailing silence (max ${maxTail}s)` };
  }
  if (tail <= 0 && !exemption) {
    return {
      ok: false,
      detail: `0s trailing silence — audio reaches the cut boundary; set an explicit allowAudioAtEnd only when that overlap is intentional`,
    };
  }
  if (tail <= 0) {
    return { ok: true, detail: `0s trailing silence; boundary audio explicitly allowed by ${exemption}` };
  }
  return { ok: true, detail: `${tail}s trailing silence (max ${maxTail}s)` };
}

export function tailAudioExemption({ manifest, scene } = {}) {
  if (scene) {
    if (scene.qa?.allowAudioAtEnd === true) return `scene.qa.allowAudioAtEnd=true (${scene.slug})`;
    if (scene.lcut > 0) return `scene.lcut=${scene.lcut}s`;
    return null;
  }
  if (manifest?.qa?.allowAudioAtEnd === true) return "manifest qa.allowAudioAtEnd=true";
  if (manifest?.music) return `manifest music bed (${manifest.music.source ?? "declared"})`;
  return null;
}

// The final OUT is the last scene's OUT. Preserve that scene's deliberately
// narrow boundary exemption before falling back to final-wide manifest policy.
export function finalTailAudioExemption(manifest) {
  const lastScene = manifest?.scenes?.at(-1);
  return tailAudioExemption({ scene: lastScene }) ?? tailAudioExemption({ manifest });
}

// Parse ffmpeg blackdetect stderr into [{start, end, duration}].
export function parseBlackdetect(stderr) {
  const out = [];
  for (const line of stderr.split("\n")) {
    const m = line.match(/black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)\s+black_duration:\s*([\d.]+)/);
    if (m) out.push({ start: Number(m[1]), end: Number(m[2]), duration: Number(m[3]) });
  }
  return out;
}

// Parse ffmpeg freezedetect stderr (three metadata lines per event; end may
// be missing when the freeze runs to EOF) into [{start, end, duration}].
export function parseFreezedetect(stderr) {
  const out = [];
  let current = null;
  for (const line of stderr.split("\n")) {
    const start = line.match(/freeze_start:\s*(-?[\d.]+)/);
    if (start) {
      current = { start: Number(start[1]), end: null, duration: null };
      out.push(current);
      continue;
    }
    const dur = line.match(/freeze_duration:\s*([\d.]+)/);
    if (dur && current) {
      current.duration = Number(dur[1]);
      continue;
    }
    const end = line.match(/freeze_end:\s*(-?[\d.]+)/);
    if (end && current) {
      current.end = Number(end[1]);
      current = null;
    }
  }
  return out;
}

// The blacks/freezes a manifest EXPLAINS: card segments (static by design,
// fading from/to black) and — for blacks — transition overlaps (fadeblack
// passes through black; a dissolve can graze it on dark footage).
export function intentionalRegions(scenes, { transitions = true } = {}) {
  const regions = [];
  for (const seg of assemblyTimeline(scenes)) {
    if (seg.kind === "card") regions.push({ start: seg.outStart, end: seg.outEnd, why: `card ${seg.slug}` });
    if (transitions && seg.transitionIn) {
      regions.push({
        start: seg.outStart,
        end: round3(seg.outStart + seg.transitionIn.duration),
        why: `${seg.transitionIn.type} into ${seg.slug}`,
      });
    }
  }
  return regions;
}

// Detected spans the regions can't explain: a span is explained only when it
// actually TOUCHES a region and sits fully inside it within ±pad (the pad
// absorbs detector/timeline rounding). Both halves matter: a span partly
// inside still counts — a black that starts under a card and bleeds into the
// scene IS the 2-frame-blink failure mode — and a blink-sized black sitting
// wholly OUTSIDE a region (an assembly gap right at a card join) must not
// ride the pad to a pass. Accepted miss: a bleed shorter than the pad that
// merges with a card's own fade-to-black reads as one span that touches the
// region — indistinguishable from fade rounding without frame data.
// `end: null` (ran to EOF) closes at duration.
export function unexplainedSpans(spans, regions, { pad = 0.25, duration } = {}) {
  return spans.filter((s) => {
    const end = s.end ?? duration ?? s.start;
    return !regions.some((r) =>
      s.start < r.end && end > r.start &&
      s.start >= r.start - pad && end <= r.end + pad);
  });
}

// Content gates must never silently pass. Decide what to do about the
// transcript-backed checks (prompt-leak, scene endings):
//   run                  — transcript available, verify for real
//   fail-missing-whisper — user asked for --transcribe but whisper can't run
//   fail-unverified      — the manifest EXPECTS content checks but there is no transcript
//   skip                 — nothing expects content checks; report as skipped, excluded from totals
export function contentGatePlan({ hasTranscript, transcribeRequested, whisperReady, expectsContent }) {
  if (hasTranscript) return "run";
  if (transcribeRequested && whisperReady) return "run";
  if (transcribeRequested && !whisperReady) return "fail-missing-whisper";
  if (expectsContent) return "fail-unverified";
  return "skip";
}

// Whisper txt hard-wraps lines, so an expected ending can straddle a newline.
// Match whitespace-normalized or a real ending fails wherever the wrap lands.
export function missingEndings(text, scenes) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");
  const hay = norm(text);
  return scenes.filter((s) => !hay.includes(norm(s.expectEnding)));
}

// A report can read snapshots while another process is finishing QA. Publish
// each snapshot with a same-directory rename so readers see either the old
// complete set or the new complete JSON, never a partially written final file.
export function writeQaSnapshotAtomic(snapshotPath, snapshot) {
  const payload = JSON.stringify(snapshot, null, 2);
  const temporaryPath = join(
    dirname(snapshotPath),
    `.${basename(snapshotPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    writeFileSync(temporaryPath, payload, { encoding: "utf8", flag: "wx" });
    renameSync(temporaryPath, snapshotPath);
  } catch (error) {
    try { unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

export async function main(argv) {
  const args = parseArgs(argv, {
    manifest: "string", "clips-dir": "string", "expect-clips": "number",
    transcript: "string", transcribe: "boolean",
    "max-tail-silence": "number", "max-leading-silence": "number",
    "no-snapshot": "boolean", report: "boolean", file: "string", out: "string", title: "string",
  });

  // --report renders the HTML QA report (cut list, QA trend, evidence
  // strips) from the manifest and the artifacts already on disk — the page
  // is a QA artifact, so it lives here.
  if (args.report) {
    const { main: renderReport } = await import("./review.mjs");
    await renderReport([
      ...(args.manifest ? ["--manifest", args.manifest] : []),
      ...(args.file ?? args._[0] ? ["--file", args.file ?? args._[0]] : []),
      ...(args.out ? ["--out", args.out] : []),
      ...(args.title ? ["--title", args.title] : []),
    ]);
    return;
  }

  const file = args._[0];
  if (!file) fail("Usage: ripple qa <file> [--manifest edit.json] [--clips-dir clips] [--expect-clips N] [--transcript path] [--max-tail-silence 1.0] [--max-leading-silence 0.5]\n       ripple qa --report [--manifest edit.json] [--file final.mp4] [--out qa/review.html] [--title \"...\"]   (HTML QA report)", 2);
  if (!existsSync(file)) fail(`File not found: ${file}`, 2);

  const ffmpeg = requireTool(["ffmpeg"], "Install ffmpeg (brew install ffmpeg).");
  const checks = [];

  // --manifest wins; otherwise discover the project manifest the way status
  // and the context gate do (edit.json, then work/edit.json). The docs say
  // just "run ripple qa" — a defect-free card-bearing final must not fail
  // black/freeze-frames because the caller didn't repeat the manifest path
  // (every card trips both detectors by design; only the manifest explains
  // them). A discovered-but-unreadable manifest degrades to none; an
  // explicit path stays a hard usage error.
  let manifest = null;
  let manifestPath = args.manifest ?? null;
  if (manifestPath) {
    if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`, 2);
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } else {
    manifestPath = resolveManifestPath(process.cwd());
    if (manifestPath) manifest = readJsonOrNull(manifestPath);
    if (!manifest) manifestPath = null;
  }
  const maxTail = args["max-tail-silence"] ?? manifest?.qa?.maxTailSilence ?? 1.0;
  const maxLeading = args["max-leading-silence"] ?? manifest?.qa?.maxLeadingSilence ?? 0.5;

  // A clean decode of yesterday's render is not evidence for today's edit.
  // Keep this tri-state: stale evidence is neither a verified pass nor proof
  // that the current manifest would render incorrectly.
  if (manifestPath) {
    const renderMtime = statSync(file).mtimeMs;
    const manifestMtime = statSync(manifestPath).mtimeMs;
    if (renderMtime < manifestMtime) {
      checks.push(notVerifiedCheck("render-freshness",
        `output predates ${manifestPath} — re-run ripple cut, then QA the rebuilt final`));
    } else {
      checks.push(check("render-freshness", true, "output is at least as recent as the manifest"));
    }
  }

  // 1. Full decode.
  const decode = run(ffmpeg, ["-hide_banner", "-v", "error", "-i", file, "-f", "null", "-"]);
  const decodeErrors = decode.stderr.trim();
  checks.push(check("decode", decode.status === 0 && !decodeErrors, decodeErrors ? decodeErrors.slice(0, 500) : "clean full decode"));

  // 2. Probe + color policy.
  const probe = ffprobeJson(file);
  const video = (probe.streams ?? []).find((s) => s.codec_type === "video");
  const color = detectHdr(video);
  const duration = Number(probe.format?.duration ?? 0);
  checks.push(check("probe", Boolean(video) && duration > 0, {
    duration: round3(duration),
    codec: video?.codec_name,
    profile: video?.profile,
    resolution: video ? `${video.width}x${video.height}` : null,
    color,
  }));
  const policy = manifest?.color?.policy;
  if (policy === "preserve" && manifest?.color?.source) {
    const sourceWasHdr =
      manifest.color.source.color_primaries === "bt2020" ||
      manifest.color.source.color_transfer === "arib-std-b67" ||
      manifest.color.source.color_transfer === "smpte2084";
    if (sourceWasHdr) {
      checks.push(check("color-policy", color.hdr,
        color.hdr ? `HDR preserved (${color.kind})` : `RELEASE BLOCKER: source was HDR but output is ${color.kind} — accidental SDR conversion`));
    }
  } else if (policy === "sdr") {
    checks.push(check("color-policy", !color.hdr,
      color.hdr ? "policy is sdr but output carries HDR metadata" : "SDR delivery as specified"));
  }

  // 2b. Black/freeze frames — one extra decode covers both detectors. A
  // 2-frame black blink at a scene join and a picture frozen while the audio
  // keeps talking are the two defects every audio gate is deaf to (a real
  // session shipped the blink; the gates were listening, not looking).
  // Blacks/freezes the manifest explains — cards, dissolve/fadeblack
  // overlaps — are expected; everything else fails. Without a manifest only
  // the file's own edges are excused (a fade-in/out on a bare final is a
  // style call, not a defect).
  const bfRes = run(ffmpeg, [
    "-hide_banner", "-nostats", "-i", file,
    "-vf", "blackdetect=d=0.05:pix_th=0.10,freezedetect=n=-60dB:d=2",
    "-an", "-f", "null", "-",
  ]);
  if (bfRes.status !== 0) {
    // An old ffmpeg without the filters must fail visibly, never skip.
    checks.push(check("black-frames", false, `blackdetect/freezedetect pass failed: ${bfRes.stderr.trim().slice(-300)}`));
    checks.push(check("freeze-frames", false, "see black-frames — the detection pass itself failed"));
  } else {
    const spanText = (spans) => spans.map((s) => `${round3(s.start)}–${round3(s.end ?? duration)}s`).join(", ");
    const edgeRegions = [
      { start: 0, end: 1, why: "opening fade" },
      { start: Math.max(0, duration - 1), end: duration, why: "closing fade" },
    ];
    const blacks = parseBlackdetect(bfRes.stderr);
    const badBlacks = unexplainedSpans(blacks, manifest?.scenes ? intentionalRegions(manifest.scenes) : edgeRegions, { duration });
    checks.push(check("black-frames", badBlacks.length === 0,
      badBlacks.length
        ? `unexplained black at ${spanText(badBlacks)} — a black flash at a join means a gap in the assembly; only cards and dissolve/fade overlaps may go black`
        : blacks.length ? `${blacks.length} black region(s), all inside cards/transitions` : "no black frames"));
    const freezes = parseFreezedetect(bfRes.stderr);
    // A final that is ONE still (a rendered card qa'd standalone) is
    // intentional by construction — a mid-scene freeze is not.
    const wholeFileStill = !manifest?.scenes && freezes.length === 1 &&
      freezes[0].start <= 0.5 && (freezes[0].end ?? duration) >= duration - 0.5;
    const badFreezes = wholeFileStill
      ? []
      : unexplainedSpans(freezes, manifest?.scenes ? intentionalRegions(manifest.scenes, { transitions: false }) : [], { duration });
    checks.push(check("freeze-frames", badFreezes.length === 0,
      badFreezes.length
        ? `picture frozen at ${spanText(badFreezes)} — motion stopped while the timeline ran; only manifest stills/cards are static by design`
        : freezes.length ? `${freezes.length} static region(s), all intentional` : "no frozen frames"));
  }

  // 3. Clip inventory + decode. The clips dir defaults to the manifest's
  // sibling clips/ (where cut renders them) — the per-scene gates must not
  // silently vanish just because --clips-dir wasn't spelled out.
  const clipsDir = args["clips-dir"] ??
    (manifestPath ? join(dirname(resolve(manifestPath)), "clips") : undefined);
  const expected = args["expect-clips"] ?? manifest?.scenes?.length;
  const expectsClipEvidence = expected !== undefined && expected > 0;
  if (clipsDir && existsSync(clipsDir)) {
    const clips = readdirSync(clipsDir).filter((f) => /\.(mp4|mov|webm)$/i.test(f)).sort();
    if (expected !== undefined) {
      checks.push(check("clip-count", clips.length === expected, `${clips.length}/${expected} clips in ${clipsDir}`));
    }
    let badClips = [];
    for (const clip of clips) {
      const res = run(ffmpeg, ["-hide_banner", "-v", "error", "-i", join(clipsDir, clip), "-f", "null", "-"]);
      if (res.status !== 0 || res.stderr.trim()) badClips.push(clip);
    }
    checks.push(check("clip-decode", badClips.length === 0, badClips.length ? `decode errors: ${badClips.join(", ")}` : `all ${clips.length} clips decode cleanly`));

    // Per-scene edge silence. The final file's outer edges structurally
    // cannot see a 3s dead tail INSIDE scene 6 — the per-scene clips can.
    // (A real session shipped two >2s interior tails past the global gates.)
    if (manifest?.scenes?.length) {
      const rows = [];
      const tailFails = [];
      // Clips older than the manifest measure a PREVIOUS cut — say so, or
      // per-scene numbers (tails, loudness, gainDb advice) mislead.
      const manifestMtime = manifestPath && existsSync(manifestPath) ? statSync(manifestPath).mtimeMs : 0;
      const staleClips = manifest.scenes.map((s) => {
        const p = join(clipsDir, clipName(s));
        return existsSync(p) && manifestMtime && statSync(p).mtimeMs < manifestMtime ? clipName(s) : null;
      }).filter(Boolean);
      const staleDetail = staleClips.length
        ? `${staleClips.length} expected scene clip(s) predate the manifest (${staleClips.join(", ")}) — re-run ripple cut before reviewing scene evidence`
        : "";
      for (const scene of manifest.scenes) {
        const clipPath = join(clipsDir, clipName(scene));
        if (!existsSync(clipPath)) {
          rows.push(`${scene.slug}: clip missing`);
          tailFails.push(`${scene.slug}: expected clip missing (${clipName(scene)})`);
          continue;
        }
        // Unreadable clips are clip-decode's finding — skip, don't abort QA.
        const probeRes = run(requireTool(["ffprobe"], "Install ffmpeg (brew install ffmpeg)."), [
          "-hide_banner", "-v", "error", "-show_format", "-show_streams", "-print_format", "json", clipPath,
        ]);
        let clipProbe = null;
        if (probeRes.status === 0) {
          try { clipProbe = JSON.parse(probeRes.stdout); } catch { /* handled below */ }
        }
        const clipAudioDuration = audioTimelineDuration(clipProbe);
        if (!clipAudioDuration) {
          rows.push(`${scene.slug}: no audio stream`);
          tailFails.push(`${scene.slug}: no measurable audio stream`);
          continue;
        }
        const detection = detectSilenceEdges(ffmpeg, clipPath, clipProbe);
        if (!detection.ok) {
          rows.push(`${scene.slug}: silence detection failed`);
          tailFails.push(`${scene.slug}: ${detection.error}`);
          continue;
        }
        const e = detection.edges;
        const exemption = tailAudioExemption({ manifest, scene });
        const assessment = assessTailSilence({ tail: e.tail, maxTail, exemption });
        rows.push(`${scene.slug} ${e.tail}s [${detection.evidence}]${exemption && e.tail <= 0 ? ` (exempt: ${exemption})` : ""}`);
        if (!assessment.ok) tailFails.push(`${scene.slug}: ${assessment.detail}`);
      }
      if (staleClips.length) {
        checks.push(notVerifiedCheck("scene-tails", staleDetail));
      } else {
        checks.push(check("scene-tails", tailFails.length === 0,
          tailFails.length ? tailFails.join("; ") : `all scene tails within ${maxTail}s (${rows.join(", ")})`));
      }

      // Dialogue loudness consistency: one scene 6dB quieter than its
      // neighbor is the defect a mixing panel exists to prevent. Clips are
      // bed-free by design, so this measures dialogue, not the mix.
      const loud = [];
      const unmeasured = [];
      for (const scene of manifest.scenes) {
        const clipPath = join(clipsDir, clipName(scene));
        if (!existsSync(clipPath)) {
          unmeasured.push(`${scene.slug}: clip missing`);
          continue;
        }
        const ln = run(ffmpeg, [
          "-hide_banner", "-nostats", "-i", clipPath,
          "-vn", "-map", "0:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-",
        ]);
        const m = parseLoudnorm(ln.stderr);
        if (m && Number.isFinite(m.input_i)) loud.push({ slug: scene.slug, lufs: m.input_i });
        else unmeasured.push(`${scene.slug}: no measurable dialogue loudness`);
      }
      if (manifest.scenes.length >= 2 && staleClips.length) {
        checks.push(notVerifiedCheck("dialogue-loudness", staleDetail));
      } else if (manifest.scenes.length >= 2 && loud.length === manifest.scenes.length) {
        const vals = loud.map((l) => l.lufs);
        const spread = round3(Math.max(...vals) - Math.min(...vals));
        const maxSpread = manifest?.qa?.maxLoudnessSpread ?? 3;
        checks.push(check("dialogue-loudness", spread <= maxSpread,
          `${spread} LU spread across scenes (max ${maxSpread} — fix with scene.gainDb): ` +
            loud.map((l) => `${l.slug} ${l.lufs}`).join(", ")));
      } else if (manifest.scenes.length >= 2) {
        checks.push(notVerifiedCheck("dialogue-loudness",
          `measured ${loud.length}/${manifest.scenes.length} expected scene clips — ${unmeasured.join("; ") || "insufficient comparable dialogue"}`));
      }
    }
  } else if (expectsClipEvidence) {
    const where = clipsDir ?? "a clips directory";
    const detail = `expected ${expected} scene clip(s), but ${where} is missing — run ripple cut with clip rendering, then re-run QA`;
    checks.push(notVerifiedCheck("clip-count", detail));
    checks.push(notVerifiedCheck("clip-decode", `clip decode evidence unavailable: ${detail}`));
    if (manifest?.scenes?.length) {
      checks.push(notVerifiedCheck("scene-tails", `per-scene tail evidence unavailable: ${detail}`));
      if (manifest.scenes.length >= 2) {
        checks.push(notVerifiedCheck("dialogue-loudness", `dialogue consistency evidence unavailable: ${detail}`));
      }
    }
  }

  // 4. Leading/tail silence of the final. An opening title card plays
  // intentional silence — the gate allows for it instead of failing red on
  // every card-led cut (which just teaches everyone to ignore red QA).
  const finalAudioDuration = audioTimelineDuration(probe);
  if (!finalAudioDuration) {
    const allowed = manifest?.qa?.allowNoAudio === true;
    const detail = allowed
      ? "no audio stream; explicitly allowed by manifest qa.allowNoAudio=true"
      : "no audio stream — delivery audio may have been dropped; set qa.allowNoAudio=true only for an intentional, reviewed silent video";
    checks.push(check("leading-silence", allowed, detail));
    checks.push(check("tail-silence", allowed, detail));
  } else {
    const detection = detectSilenceEdges(ffmpeg, file, probe);
    const edges = detection.edges;
    const bedNote = manifest?.music ? " — music bed present: edges reflect the mix, not dialogue" : "";
    const cardLead = manifest?.scenes ? expectedLeadingSilence(manifest.scenes) : 0;
    if (!detection.ok) {
      checks.push(check("leading-silence", false, detection.error));
      checks.push(check("tail-silence", false, detection.error));
    } else {
      const leadDetail = cardLead > 0
        ? `${edges.leading}s (${cardLead}s intentional opening card + max ${maxLeading}s)${bedNote}`
        : `${edges.leading}s (max ${maxLeading}s)${bedNote}`;
      checks.push(check("leading-silence", edges.leading <= cardLead + maxLeading,
        `${leadDetail} — thresholds: ${detection.evidence}`));
      const tailAssessment = assessTailSilence({ tail: edges.tail, maxTail, exemption: finalTailAudioExemption(manifest) });
      checks.push(check("tail-silence", tailAssessment.ok,
        `${tailAssessment.detail}${bedNote} — thresholds: ${detection.evidence}`));
    }
  }

  // 4b. Loudness. A bed masks dialogue-edge silence (noted above), so the
  // gate that actually catches a bed mixed too hot — or a final mastered off
  // target — is integrated loudness against manifest.music.loudnessTarget.
  const loudnessTarget = manifest?.music?.loudnessTarget;
  if (loudnessTarget !== undefined) {
    const ln = run(ffmpeg, [
      "-hide_banner", "-nostats", "-i", file,
      "-vn", "-af", `loudnorm=I=${loudnessTarget}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-",
    ]);
    const measured = parseLoudnorm(ln.stderr);
    checks.push(check("loudness",
      measured ? Math.abs(measured.input_i - loudnessTarget) <= 1.0 : false,
      measured
        ? `${measured.input_i} LUFS integrated (target ${loudnessTarget} ±1)`
        : "loudness measurement failed — no loudnorm stats in ffmpeg output"));
  }

  // 5. Transcript content gates — these must fail loudly, never skip silently,
  // whenever the manifest or the caller expects them.
  const { findTool } = await import("./util.mjs");
  const { resolveModel, transcribeFile } = await import("./transcribe.mjs");
  const expectsContent =
    Boolean(manifest?.qa?.leakPatterns?.length) ||
    (manifest?.scenes ?? []).some((s) => s.expectEnding);
  const whisperReady = Boolean(findTool(["whisper-cli", "whisper-cpp", "main"]) && resolveModel(null));
  const plan = contentGatePlan({
    hasTranscript: Boolean(args.transcript && existsSync(args.transcript)),
    transcribeRequested: Boolean(args.transcribe),
    whisperReady,
    expectsContent,
  });
  let contentEvidence = null;

  if (plan === "run") {
    let transcriptPath = args.transcript;
    let transcriptMethod = "provided";
    if (!transcriptPath || !existsSync(transcriptPath)) {
      const t = transcribeFile(file, { outDir: join(process.cwd(), "qa") });
      transcriptPath = t.files.txt;
      transcriptMethod = "ripple-transcribe";
    }
    const resolvedTranscript = resolve(transcriptPath);
    const transcriptMtime = statSync(resolvedTranscript).mtimeMs;
    const renderMtime = statSync(file).mtimeMs;
    const fresh = transcriptMethod === "ripple-transcribe" || transcriptMtime >= renderMtime;
    contentEvidence = {
      method: transcriptMethod,
      transcript: resolvedTranscript,
      transcriptMtime: new Date(transcriptMtime).toISOString(),
      render: resolve(file),
    };
    checks.push(check("transcript-freshness", fresh,
      transcriptMethod === "ripple-transcribe"
        ? `transcript generated or content-cache-resolved from the rendered file: ${resolvedTranscript}`
        : fresh
          ? `provided transcript is at least as recent as the render: ${resolvedTranscript}`
          : `provided transcript predates the render and may describe an older/different file: ${resolvedTranscript}`));
    const text = readFileSync(transcriptPath, "utf8");
    const leakPatterns = manifest?.qa?.leakPatterns ?? DEFAULT_LEAK_PATTERNS;
    // Manifest patterns are agent-written and arrive in other dialects —
    // "(?i)question number" (Python inline flag) once crashed the whole QA
    // run. Strip the redundant (?i) (the "i" flag is always applied); a
    // pattern JS still can't compile fails the gate loudly instead of
    // killing the process — an unverifiable leak check must never pass.
    const invalid = [];
    const leaks = leakPatterns.filter((p) => {
      const source = String(p).replace(/^\(\?i\)/, "");
      try {
        return new RegExp(source, "i").test(text);
      } catch {
        invalid.push(String(p));
        return false;
      }
    });
    checks.push(check("prompt-leak", leaks.length === 0 && invalid.length === 0,
      invalid.length
        ? `unusable leak pattern(s): ${invalid.join(" | ")} — fix manifest qa.leakPatterns (JS regex syntax)`
        : leaks.length ? `leaked: ${leaks.join(" | ")}` : "no prompt/take leakage"));
    const endings = (manifest?.scenes ?? []).filter((s) => s.expectEnding);
    if (endings.length) {
      const missing = missingEndings(text, endings);
      checks.push(check("scene-endings", missing.length === 0,
        missing.length ? `missing endings: ${missing.map((s) => s.slug).join(", ")}` : `all ${endings.length} expected endings present`));
    }
  } else if (plan === "fail-missing-whisper") {
    checks.push(check("content-gates", false,
      "--transcribe requested but whisper-cpp or its model is unavailable — run `ripple doctor` for setup"));
  } else if (plan === "fail-unverified") {
    checks.push(check("content-gates", false,
      "manifest defines expected endings/leak patterns but no transcript was provided — " +
        "re-run with --transcribe (or --transcript <path>); a delivery must not pass with unverified content"));
  } else if (!finalAudioDuration && manifest?.qa?.allowNoAudio === true) {
    checks.push(check("content-gates", true,
      "no audio stream and qa.allowNoAudio=true — spoken-content gates are not applicable"));
  } else {
    checks.push(notVerifiedCheck("content-gates",
      "no transcript and no content expectations in the manifest — content gates not run (excluded from totals)"));
  }

  const counted = checks.filter((c) => c.status !== "not-verified");
  const passed = counted.filter((c) => c.status === "pass").length;
  const failed = counted.filter((c) => c.status === "fail");
  const unverified = checks.filter((c) => c.status === "not-verified");
  const status = failed.length ? "fail" : unverified.length ? "not-verified" : "pass";
  const ok = status === "pass" ? true : status === "fail" ? false : null;
  const verified = status === "pass";

  // Snapshot + trend.
  let trend = null;
  if (!args["no-snapshot"]) {
    // Keep QA evidence with the manifest it verifies. Root-level fallback is
    // handled by status/review for snapshots produced before this contract.
    const qaDir = join(manifestPath ? dirname(resolve(manifestPath)) : process.cwd(), ".ripple", "qa");
    mkdirSync(qaDir, { recursive: true });
    const previous = readdirSync(qaDir).filter((f) => f.startsWith("qa-")).sort().slice(-4);
    trend = previous.map((f) => {
      try {
        const snap = JSON.parse(readFileSync(join(qaDir, f), "utf8"));
        return `${snap.passed}/${snap.total}`;
      } catch {
        return "?";
      }
    });
    trend.push(`${passed}/${counted.length} (this run)`);
    writeQaSnapshotAtomic(
      join(qaDir, `qa-${Date.now()}.json`),
      {
        file: resolve(file),
        ...(manifestPath ? { manifest: resolve(manifestPath) } : {}),
        ...(contentEvidence ? { contentEvidence } : {}),
        timestamp: new Date().toISOString(), ok, status, verified,
        passed, total: counted.length, checks,
      }
    );
  }

  output({
    ok, status, verified, file,
    // Which manifest explained the gates — auto-discovery must be visible.
    ...(manifestPath ? { manifest: manifestPath } : {}),
    ...(contentEvidence ? { contentEvidence } : {}),
    passed: `${passed}/${counted.length}`, notVerified: unverified.map((c) => c.id), checks, trend,
    ...(status === "pass"
      ? { hint: "delivery gates passed" }
      : status === "not-verified"
        ? { hint: "delivery NOT verified: required evidence is missing; see notVerified checks, then add the needed clip or transcript artifacts" }
        : {}),
  });
  // Shell success means verified delivery. JSON preserves the distinction
  // between a measured failure and missing evidence, but neither is green.
  if (status !== "pass") process.exit(1);
}
