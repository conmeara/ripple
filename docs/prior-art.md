# Prior art

What already exists, what we adopt, what we learn from, what we ignore — and
why. Every new ripple feature checks this file first (see
[scenarios.md](scenarios.md): pair named → prior-art check → ablation eval →
ship). Researched 2026-07-17.

Verdicts: **ADOPT** = use it (dependency or optional detected binary) ·
**LEARN** = steal the technique, not the dependency · **IGNORE** = reason
recorded so we don't re-litigate.

## Summary

| Project / area | Verdict | The one thing that matters |
|---|---|---|
| WhisperX | **ADOPT** (optional via `uvx`) + **LEARN** | VAD pre-chunking makes long-source drift structurally impossible; wav2vec2 forced alignment ≈ tens of ms |
| auto-editor | LEARN | Margin-as-hysteresis, asymmetric lead/trail margins, mincut/minclip minimum durations |
| videogrep | LEARN | Sentence-safe cuts by default, word-exact on request; n-gram discovery |
| stable-ts | IGNORE | Archived May 2026; reinterprets Whisper attention so it can't fix encoder-level drift |
| PySceneDetect | LEARN | AdaptiveDetector's rolling-ratio test (spike vs neighborhood) kills pan/handheld false positives |
| aubio (`aubiotrack`) | ADOPT (optional binary) | Lightest real beat grid; frozen DSP, brew-installable, zero Python |
| librosa / essentia / madmom | IGNORE (as deps) | Scientific-Python or C++ stacks for what a tiny binary does |
| ffmpeg grading recipes | ADOPT (as playbook) | `colortemperature`, `vibrance` (skin-safe sat), `curves interp=pchip`, haldclut round-trip workflow |
| HaldCLUT/LUT collections | ADOPT (link, verify license before vendoring) | YahiaAngelo/Film-Luts is MIT — cleanest vendorable set |
| HDR→SDR tonemapping | ADOPT (canonical chain) | `tonemap=hable:desat=0`; probe for zscale/libplacebo — not all builds have them |
| OpenTimelineIO | KEEP current strategy | Resolve native since 18.5; **Premiere OTIO is still beta-only** — FCP7 XML stays the Premiere path |
| video-use (browser-use) | LEARN (closest competitor) | Packed transcript + decision-point composites; 30ms cut fades; per-boundary self-review |
| OpenMontage | IGNORE (product) / LEARN (QA ideas) | Generation-first provider menu (AGPL); but its named-failure-mode scoring and decision audit trail are good |
| FunClip / ClipsAI / ButterCut | LEARN | Clip-by-selecting-transcript-text; speaker-aware reframe; "agent edits, NLE finishes" validation |
| Edit-quality evals | LEARN | Boundary-level metrics exist (SyncNet, adjacent-frame embedding distance); nobody scores editorial quality — open ground |

## Transcription alignment (the drift problem)

**WhisperX** (23.1k★, v3.8.6 May 2026, active) fixes long-source timestamp
drift *at the source*, two ways: pyannote-VAD segments audio into ≤~30s
chunks before Whisper sees them (each chunk anchored to a known absolute
offset — drift cannot accumulate), then discards Whisper's word timings
entirely and forced-aligns the text with a wav2vec2 phoneme model (word
boundaries to tens of ms). Install weight is real (~2GB PyTorch + per-language
alignment model), so:

- **Do now (LEARN)**: port VAD-style pre-chunking into the whisper-cpp
  pipeline — pre-segment with measured silence, transcribe windows,
  offset-add. Converts our drift *detection* (INDEX_DRIFT, driftCheck) into
  drift *prevention*. The detection stays as the verification layer.
- **Offer (ADOPT)**: `--aligner whisperx` via `uvx whisperx` as an optional
  detected precision backend (same pattern as whisper-cpp itself), or
  auto-suggest when drift is detected.
- **stable-ts** is archived (May 2026) and works by reinterpreting Whisper's
  cross-attention — bounded by what the encoder got wrong. Ignore.

## Silence/word-driven cutting

**auto-editor** (4.6k★, very active, now written in Nim — shell-out or
recipe-book only). Still fundamentally "cut at silence edges," but with three
guards `candidates` should replicate:

1. **Margin as hysteresis** — `--margin 0.2s` relabels quiet spans near
   speech as speech rather than padding clips; asymmetric `0.3s,1.5s`
   (lead-in, trail-out) encodes "more air after a phrase than before" — the
   editorially correct default.
2. **`--smooth MINCUT,MINCLIP`** (0.2s/0.1s) — a silence shorter than MINCUT
   never becomes a cut; a kept clip shorter than MINCLIP is absorbed. The
   no-stutter-cuts, no-micro-clips guard.
3. **Boolean multi-signal edit expressions** — `(or audio:0.04 motion:0.02)`
   keeps visually-active-but-silent footage; motion as a cut veto.

**videogrep** (3.5k★, dormant): the two-tier contract — sentence-safe cuts by
default, word-exact fragments on request — plus `--ngrams` transcript
discovery. Vosk backend is its weak half; nothing to depend on.

## Scene detection

**PySceneDetect** (5k★, active): don't take the OpenCV/Python dep; port the
idea. Its AdaptiveDetector scores a cut as a *local spike relative to a
rolling window* (`adaptive_threshold=3.0`, `window_width=2`, min scene 15
frames) rather than a global threshold — which is exactly what suppresses
false positives during pans and handheld motion, ffmpeg scdet's known
weakness. A pure-JS post-pass over the scene scores analyze already extracts.

## Beats

Ladder: ffmpeg energy-flux onset heuristic (zero-dep floor, onsets not a
grid) → **`aubiotrack`** when the binary is present (`brew install aubio`;
last release 2019 but frozen DSP doesn't rot; treat like whisper-cpp) →
document librosa via `uvx` as escalation. essentia/madmom: accuracy not worth
the install weight for music-bed grids.

## Color (feeds the deliver playbook)

- Core stock-ffmpeg primitives to teach: `colortemperature` (Kelvin warm/cool
  with `pl` preserve-lightness), `curves` (named presets +
  `interp=pchip` to avoid spline overshoot), `colorbalance` (teal-orange
  shadow/highlight split, `pl=1`), `exposure` (stops-based, cleaner than
  eq=brightness), and the underused gem **`vibrance`** —
  `vibrance=intensity=0.4:rbal=0.7` boosts saturation while protecting skin;
  `huesaturation ... colors=g+c+b:lightness=1` is the closest thing to a
  Resolve hue-vs-sat qualifier.
- **The haldclut round-trip workflow** (gabor.heja.hu): extract a frame
  stacked with an identity HaldCLUT, grade the PNG anywhere, apply it back
  with `haldclut` — turns any one-frame grade into a reusable LUT. Perfect
  agent workflow; teach it.
- LUT collections: **YahiaAngelo/Film-Luts (MIT)** is the cleanest vendorable
  set; RawTherapee Film Simulation collection is the biggest but verify
  per-file licensing before vendoring (link, don't bundle, until checked).
  #1 documented pitfall: applying a Rec.709 LUT to log footage without
  conversion.
- **HDR→SDR**: canonical chain `zscale=t=linear:npl=100,format=gbrpf32le,`
  `zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`
  — with `desat=0` (the default desat=2 causes the notorious washed-out
  look) and `npl` read from mastering metadata when possible (175–250
  typical). Prefer `libplacebo=tonemapping=bt.2390` when built in.
  **Not all ffmpeg builds have zscale** (verified locally) — doctor/playbook
  must probe filter availability and fall back.

## Timeline interchange

Current dual-format handoff is exactly right; keep it. Resolve imports OTIO
natively since 18.5. **Premiere's OTIO support is beta-only** (Adobe, Feb
2025: "not there yet"; known round-trip losses) — FCP7 XML remains the
Premiere path. The .otio JSON schema is stable; packaging churned (v0.17
moved EDL/FCP7 adapters to `OpenTimelineIO-Plugins` — irrelevant to us since
we emit formats ourselves, which the ecosystem confirms is the right call:
there is no official otio↔ffmpeg bridge; ripple's cut/render path *is* that
bridge). `otiotool` is useful for debugging handoffs.

## The agentic-editing landscape (positioning)

- **video-use** (browser-use, 17k★, MIT) — the closest competitor and the
  best-designed one. "The LLM never watches the video. It reads it": one
  cloud transcription call packed into ~12KB markdown + on-demand
  filmstrip/waveform composites only at decision points. Three ideas to
  absorb: **30ms audio fades at every cut** as an always-on default in
  `cut`; per-boundary preview self-review before showing the user; named
  ffmpeg looks per segment (validates killing the grade command for taught
  recipes). Its structural weakness: cloud-only transcription (ElevenLabs).
  **Ripple's differentiation: local-first perception + verified endpoints +
  deterministic gates + NLE handoff.**
- **OpenMontage** (~39.5k★, AGPL) — generation-first provider menu; the
  opposite product. But LEARN its QA shape: named-failure-mode scoring
  ("slideshow risk"), pre-compose blocking gates, post-render frame checks,
  and a decision audit trail. Ripple's rules registry is the same idea; the
  audit trail is worth considering for edit.json.
- **FunClip** (Alibaba): clip-by-selecting-transcript-text as the primitive.
  **ClipsAI**: speaker-tracking auto-reframe to 9:16. **ButterCut**
  (PolyForm-NC): same "agent edits, NLE finishes" thesis as handoff.
  A crowded category of Claude-Code video skills exists; none combine
  verified endpoints + deterministic QA + NLE handoff.

## Edit-quality evals (feeds the eval harness)

Nobody benchmarks *editorial* quality — published benchmarks target
generative editing. Borrowable deterministic mechanics:

- **Cut-point-vs-word-boundary distance** — we already have the data; nearly
  free and nobody else publishes it. Our open ground.
- **Adjacent-frame embedding distance at boundaries** — detects accidental
  jump cuts inside supposedly-continuous segments (invert the "temporal
  consistency" metric from EditBoard/VC-Bench).
- **Audio RMS window at each cut** — catches pops; video-use's 30ms fades
  make it pass by construction.
- **SyncNet** (frame offset + confidence; |offset|≤5 frames ∧ conf≥1) — the
  only credible automated lip-sync check; heavy, eval-only, never a qa gate.
- VLM-judge-with-fixed-rubric (IVEBench shape) is what qa-reviewer already
  does informally; keep it narrow and checklist-driven.

Pacing priors (shot-length distributions), cut-on-silence correctness, and
dead-air gates are unpublished territory ripple already leads on.
