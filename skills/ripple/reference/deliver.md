# deliver — color, assembly, QA, and terminal

The finishing playbook: get color right, assemble safely, grade with taught
ffmpeg recipes, gate the result deterministically, and choose the terminal —
a rendered file or an NLE handoff. Which terminal is a scenario decision, not a
fallback.

## Color policy (release blocker, not a style choice)

**Never silently convert color.** HDR in means HDR out unless VIDEO.md or the user
chose SDR — accidental conversion is the release blocker that created this policy
(HDR = HEVC Main 10 / bt2020 primaries / arib-std-b67 HLG or smpte2084 PQ).

`ripple cut` emits the correct tags itself, including on generated segments like
title cards. Two agent-actionable steps remain:

- **Converting to SDR** is a decision: make it explicit to the user, tone-map
  deliberately (the HDR→SDR chain below), and show a comparison still first.
- **Verify the FINAL file** with `ripple probe` — a correct pipeline with one
  untagged segment ships a broken video.

Only when hand-encoding outside `cut` do the raw tags matter: `hvc1` plus
`-color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc` (PQ
equivalents for smpte2084), and `setparams=...` to force generated segments to
match.

## Grading — taught ffmpeg recipes, not a command

Grading is generated config applied at render time, never a destructive step.
`ripple cut` reads the look from `manifest.grade` and bakes it into the single
final encode; draft renders stay ungraded (grading a draft hides cut problems).
Iterate the filter chain **on one representative frame** — a face in typical
lighting, not a title card — comparing alternatives side by side before the user
picks with their eyes, never by re-rendering the whole video. Record the decision
as `manifest.grade = { name, filter }` and in VIDEO.md.

Core stock-ffmpeg primitives to reach for:

- **Warm/cool** — `colortemperature=temperature=<kelvin>` (add `pl=1` to preserve
  lightness). Lower Kelvin warms, higher cools.
- **Skin-safe saturation** — the underused gem `vibrance=intensity=0.4:rbal=0.7`
  boosts saturation while protecting skin tones. Prefer it to a flat
  `eq=saturation` bump on anything with faces.
- **Curves** — named presets plus `curves=...:interp=pchip` to avoid the spline
  overshoot the default interpolation introduces in the highlights.
- **Teal-orange split** — `colorbalance` on shadows/highlights (`pl=1`); the
  closest thing to a Resolve hue-vs-sat qualifier is
  `huesaturation=...:colors=g+c+b:lightness=1`.
- **Exposure** — `exposure` (stops-based) reads cleaner than `eq=brightness`.

### The haldclut round-trip (any grade → reusable LUT)

Extract a frame stacked with an identity HaldCLUT, grade that PNG anywhere (in
ffmpeg or an image tool), then apply it back with the `haldclut` filter. It turns
any one-frame grade into a reusable LUT — the ideal agent workflow, because the
expensive step is a single still. Verify per-file licensing before bundling any
vendored LUT collection.

**The #1 documented pitfall: applying a Rec.709 LUT to log footage without
converting first.** A film LUT expects display-referred Rec.709; feed it log and
the image collapses. Convert to Rec.709 (or the LUT's expected space) before the
LUT, not after.

### HDR → SDR (only when policy says SDR)

Canonical chain, with `desat=0` (the default `desat=2` causes the notorious
washed-out look) and `npl` read from mastering metadata when available (175–250
typical):

```
zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p
```

Prefer `libplacebo=tonemapping=bt.2390` when the build has it. **Not every ffmpeg
build ships `zscale`** — probe filter availability first (`ripple probe
--filters`, or `ffmpeg -filters`) and fall back rather than emitting a chain the
binary can't run.

## Title cards

Check `ripple probe --filters` for `drawtext` before depending on it — many
builds lack it. Fallback order: HyperFrames/Remotion composition (best
typography), ImageMagick PNG → `-loop 1` video segment (reliable), drawtext (only
if present). Cards must carry the delivery color tags.

## Assembly (concat safety)

`ripple cut` implements concat safety (stream-copy only for homogeneous segments;
decode-and-re-encode through the `concat` filter for mixed/HEVC joins), the J/L-cut
and transition mechanics, and the music bed — heed its `warnings` array; it says
when it had to degrade. Two things stay the agent's call:

- **Fix a dialogue-level outlier with `scene.gainDb`** (qa's loudness gate flags
  it), never by re-mastering the mix.
- **The final export is always a fresh single encode from source** via the
  manifest — never a re-encode of a draft.

## Delivery extras

- Captions: `ripple captions` emits sidecars (SRT + styled ASS, or karaoke social
  style); burn-in needs a libass ffmpeg.
- Reframes: a vertical/square preset reframes the same cut; set `output.crop`
  after READING a full frame when center-crop misses the subject.

## Deterministic QA (the gate)

`ripple qa` after every render prints its own gate list, each check carrying the
registry rule id (`reference/rules.md`) that `candidates` and `lint` use for the
same failure — so a delivery failure joins the same-named finding from earlier. It
snapshots results, so report the quality trend when it exists ("3 runs: 8/10 →
9/10 → 10/10"). The gate is necessary but not sufficient — the two human-facing
halves below are what actually catch a bad ship.

### Human review artifacts

Generate into `qa/` after any render worth showing, and tell the user exactly
what to look for:

1. **Scene table** (in your message): slug, in/out, duration, transcript ending,
   tail silence, status. The primary review surface.
2. **Frame sheets** of the full edit and tail strips of any scene you're unsure
   about.
3. Scene-by-scene pointers — "Q8 got a new ending, check ~3:40" beats "here's the
   video".

`ripple qa --report` generates the shareable inspection page alongside the gates.

### Independent QA reviewer (narrow prompts only)

Broad prompts ("check the video") pass artifacts that specific prompts catch. Give
a fresh read-only reviewer a checklist naming known failure modes (invocation and
fallback ladder: SKILL.md's QA rule). The checklist is the craft — name each mode:

```
Verify the latest outputs only, without modifying files:
1. clips/05_cant_live_without.mp4 includes "coffee in the morning".
2. No clip contains the next question prompt.
3. outputs/final.mp4 keeps HEVC Main 10 HLG/BT.2020 and decodes cleanly.
4. Tails are ≤1.0s of silence.
Return concise findings. Do not edit files.
```

Independent QA is another signal — never a replacement for the deterministic
gates.

## The terminal is a scenario decision: render or hand off

Some projects finish as a watchable file; some finish as a timeline the user opens
in their own tool. For raw-clips-to-cut and demo/promo work the render is the
terminal. **For interview + b-roll and the complex end of scripted work, the NLE
handoff is a peer terminal, not a tail feature**: cut the
structure right — takes, endpoints, order — and hand the taste-heavy 20% to the
editor. Both is normal: a draft render to check the cut, plus a handoff.

`ripple handoff` converts edit.json into timeline files that reference the
ORIGINAL media at full quality.

- User mentions Premiere / Resolve / Final Cut / Avid, "rough cut", "I'll finish
  it myself", or a team review → hand off.
- User wants a watchable file → render the final.

### Which file for which editor

| Editor | File | Notes |
|---|---|---|
| DaVinci Resolve | `.otio` | Native since 18.5; markers carry name + comment |
| Premiere Pro | `.xml` (FCP7 XML) | The stable path; reasoning arrives as sequence markers (colors don't survive). Premiere's own OTIO import is beta — offer the .otio too |
| Avid | `.otio` | Media Composer imports OTIO since 2025.6 |
| Final Cut Pro | none yet | FCP only takes modern FCPXML. Offer the EDL, or route through Resolve. Say so honestly |
| Anything else | `.edl` | Single video track, no markers — the always-works fallback |

### Handoff rules

1. **Clean scene bounds.** J-cuts flatten to straight cuts with the intent noted
   in the scene's marker — editors rebuild J-cuts natively in seconds; a
   pre-baked overlap is a nuisance.
2. **Cards are the editor's to rebuild.** The handoff references ripple's rendered
   card segments so the timeline plays, but expect the editor to replace them with
   native titles.
3. **Media stays put.** Timelines reference absolute paths; if the project moves
   machines, the editor relinks — mention it.
4. **QA still applies.** Run `ripple qa` on the draft render before handing off; a
   handoff of a broken cut wastes an editor's session. Tell the user which scenes
   are `proposed` vs `locked` — the markers carry it.

### Driving an NLE directly

- **Resolve** is genuinely scriptable (official Python API; community MCP servers
  exist). If the user asks for automation *inside* Resolve, point them at a
  Resolve MCP server rather than simulating it; ripple's job ends at the timeline
  file.
- **Premiere / Final Cut** have no sanctioned automation surface for edits. Do
  not attempt UI scripting; hand off the file.
