import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assemblyTimeline, clipName, expectedLeadingSilence } from "./cut.mjs";
import { resolveManifestPath } from "./status.mjs";
import {
  detectHdr, fail, ffprobeJson, output, parseArgs, parseLoudnorm, parseSilence, readJsonOrNull, requireTool, round3, run, silenceEdges,
} from "./util.mjs";

const DEFAULT_LEAK_PATTERNS = ["next question", "take [0-9]"];

// Every check id IS a registry rule id (cli/rules.mjs, reference/rules.md);
// `rule` carries it explicitly so findings join across candidates/lint/qa.
function check(id, ok, detail) {
  return { id, rule: id, ok: Boolean(ok), detail };
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

// Whisper txt hard-wraps lines, so an expected ending can straddle a newline
// ("just a\n bonus") — match whitespace-normalized or a real ending fails on
// wherever the wrap happened to land this run.
export function missingEndings(text, scenes) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");
  const hay = norm(text);
  return scenes.filter((s) => !hay.includes(norm(s.expectEnding)));
}

export async function main(argv) {
  const args = parseArgs(argv, {
    manifest: "string", "clips-dir": "string", "expect-clips": "number",
    transcript: "string", transcribe: "boolean",
    "max-tail-silence": "number", "max-leading-silence": "number",
    "no-snapshot": "boolean", report: "boolean", out: "string", title: "string",
  });

  // --report renders the HTML QA report (cut list, QA trend, evidence
  // strips) from the manifest and the artifacts already on disk — the page
  // is a QA artifact, so it lives here.
  if (args.report) {
    const { main: renderReport } = await import("./review.mjs");
    await renderReport([
      ...(args.manifest ? ["--manifest", args.manifest] : []),
      ...(args.out ? ["--out", args.out] : []),
      ...(args.title ? ["--title", args.title] : []),
    ]);
    return;
  }

  const file = args._[0];
  if (!file) fail("Usage: ripple qa <file> [--manifest edit.json] [--clips-dir clips] [--expect-clips N] [--transcript path] [--max-tail-silence 1.0] [--max-leading-silence 0.5]\n       ripple qa --report [--manifest edit.json] [--out qa/review.html] [--title \"...\"]   (HTML QA report)", 2);
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
    (manifestPath && existsSync(join(dirname(resolve(manifestPath)), "clips"))
      ? join(dirname(resolve(manifestPath)), "clips")
      : undefined);
  const expected = args["expect-clips"] ?? manifest?.scenes?.length;
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
      const ffprobe = requireTool(["ffprobe"], "Install ffmpeg (brew install ffmpeg).");
      // Clips older than the manifest measure a PREVIOUS cut — say so, or
      // per-scene numbers (tails, loudness, gainDb advice) mislead.
      const manifestMtime = manifestPath && existsSync(manifestPath) ? statSync(manifestPath).mtimeMs : 0;
      const staleClips = manifest.scenes.filter((s) => {
        const p = join(clipsDir, clipName(s));
        return existsSync(p) && manifestMtime && statSync(p).mtimeMs < manifestMtime;
      }).length;
      const staleNote = staleClips ? ` — ${staleClips} clip(s) predate the manifest; re-run ripple cut before trusting per-scene numbers` : "";
      for (const scene of manifest.scenes) {
        const clipPath = join(clipsDir, clipName(scene));
        if (!existsSync(clipPath)) continue;
        // Unreadable clips are clip-decode's finding — skip, don't abort QA.
        const probeRes = run(ffprobe, ["-hide_banner", "-v", "error", "-show_format", "-print_format", "json", clipPath]);
        let clipDur = 0;
        if (probeRes.status === 0) {
          try { clipDur = Number(JSON.parse(probeRes.stdout).format?.duration ?? 0); } catch { /* skip */ }
        }
        if (!(clipDur > 0)) continue;
        const res = run(ffmpeg, [
          "-hide_banner", "-nostats", "-i", clipPath,
          "-vn", "-map", "0:a:0", "-af", "silencedetect=noise=-40dB:d=0.25", "-f", "null", "-",
        ]);
        const e = silenceEdges(parseSilence(res.stderr), clipDur);
        rows.push(`${scene.slug} ${e.tail}s`);
        if (e.tail > maxTail) tailFails.push(`${scene.slug}: ${e.tail}s tail (max ${maxTail}s)`);
      }
      if (rows.length) {
        checks.push(check("scene-tails", tailFails.length === 0,
          (tailFails.length ? tailFails.join("; ") : `all scene tails within ${maxTail}s (${rows.join(", ")})`) + staleNote));
      }

      // Dialogue loudness consistency: one scene 6dB quieter than its
      // neighbor is the defect a mixing panel exists to prevent. Clips are
      // bed-free by design, so this measures dialogue, not the mix.
      const loud = [];
      for (const scene of manifest.scenes) {
        const clipPath = join(clipsDir, clipName(scene));
        if (!existsSync(clipPath)) continue;
        const ln = run(ffmpeg, [
          "-hide_banner", "-nostats", "-i", clipPath,
          "-vn", "-map", "0:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-",
        ]);
        const m = parseLoudnorm(ln.stderr);
        if (m && Number.isFinite(m.input_i)) loud.push({ slug: scene.slug, lufs: m.input_i });
      }
      if (loud.length >= 2) {
        const vals = loud.map((l) => l.lufs);
        const spread = round3(Math.max(...vals) - Math.min(...vals));
        const maxSpread = manifest?.qa?.maxLoudnessSpread ?? 3;
        checks.push(check("dialogue-loudness", spread <= maxSpread,
          `${spread} LU spread across scenes (max ${maxSpread} — fix with scene.gainDb): ` +
            loud.map((l) => `${l.slug} ${l.lufs}`).join(", ") + staleNote));
      }
    }
  }

  // 4. Leading/tail silence of the final. An opening title card plays
  // intentional silence — the gate allows for it instead of failing red on
  // every card-led cut (which just teaches everyone to ignore red QA).
  const silenceRes = run(ffmpeg, [
    "-hide_banner", "-nostats", "-i", file,
    "-vn", "-map", "0:a:0", "-af", "silencedetect=noise=-40dB:d=0.25", "-f", "null", "-",
  ]);
  const edges = silenceEdges(parseSilence(silenceRes.stderr), duration);
  const bedNote = manifest?.music ? " — music bed present: edges reflect the mix, not dialogue" : "";
  const cardLead = manifest?.scenes ? expectedLeadingSilence(manifest.scenes) : 0;
  const leadDetail = cardLead > 0
    ? `${edges.leading}s (${cardLead}s intentional opening card + max ${maxLeading}s)${bedNote}`
    : `${edges.leading}s (max ${maxLeading}s)${bedNote}`;
  checks.push(check("leading-silence", edges.leading <= cardLead + maxLeading, leadDetail));
  checks.push(check("tail-silence", edges.tail <= maxTail, `${edges.tail}s (max ${maxTail}s)${bedNote}`));

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

  if (plan === "run") {
    let transcriptPath = args.transcript;
    if (!transcriptPath || !existsSync(transcriptPath)) {
      const t = transcribeFile(file, { outDir: join(process.cwd(), "qa") });
      transcriptPath = t.files.txt;
    }
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
  } else {
    checks.push({ id: "content-gates", rule: "content-gates", ok: true, skipped: true,
      detail: "no transcript and no content expectations in the manifest — content gates not run (excluded from totals)" });
  }

  const counted = checks.filter((c) => !c.skipped);
  const passed = counted.filter((c) => c.ok).length;
  const ok = passed === counted.length;

  // Snapshot + trend.
  let trend = null;
  if (!args["no-snapshot"]) {
    const qaDir = join(process.cwd(), ".ripple", "qa");
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
    writeFileSync(
      join(qaDir, `qa-${Date.now()}.json`),
      JSON.stringify({ file, timestamp: new Date().toISOString(), passed, total: counted.length, checks }, null, 2)
    );
  }

  output({
    ok, file,
    // Which manifest explained the gates — auto-discovery must be visible.
    ...(manifestPath ? { manifest: manifestPath } : {}),
    passed: `${passed}/${counted.length}`, checks, trend,
    ...(ok ? { hint: "delivery gates passed" } : {}),
  });
  if (!ok) process.exit(1);
}
