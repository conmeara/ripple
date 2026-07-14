# /ripple finish — color, assembly, and delivery

## Color policy (release blocker, not a style choice)

1. `ripple probe` the source. HDR = HEVC Main 10 / bt2020 primaries /
   arib-std-b67 (HLG) or smpte2084 (PQ) transfer.
2. If HDR and policy is `preserve`: encode HEVC Main 10, tag `hvc1` (Apple
   compatibility), carry `-color_primaries bt2020 -color_trc arib-std-b67
   -colorspace bt2020nc` (or the PQ equivalents), and force generated
   segments (title cards!) to the same tags via
   `setparams=range=tv:color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc`.
3. If converting to SDR: make it explicit to the user, tone-map deliberately,
   and show a comparison still before rendering the whole thing.
4. Verify the FINAL file's color metadata with `ripple probe` — a correct
   pipeline with one untagged segment ships a broken video.

## Title cards

Check `ripple probe --filters` for `drawtext` before depending on it — many
ffmpeg builds lack it. Fallback order: HyperFrames/Remotion composition
(best typography), ImageMagick PNG → `-loop 1` video segment (reliable),
drawtext (only if present). Cards must carry the delivery color tags.

## Assembly (concat safety)

- Homogeneous, identically-encoded segments: stream-copy concat is fine.
- Mixed segments (cards + camera footage, HEVC joins): decode and re-encode
  through the `concat` filter into ONE clean final encode. Slower, bigger,
  reliable. HEVC stream-copy concat produces packet-level errors at joins.
- J-cuts: trim the body segment's video while letting its audio start under
  the preceding card, inside the concat filtergraph.
- Music bed: `manifest.music` is mixed only at assembly — gained
  (`gainDb`, default −18), ducked under dialogue via `sidechaincompress`,
  faded, and loudness-normalized to `loudnessTarget`. Clips and segments
  stay bed-free by design.

- Transitions: `scene.transition {type: dissolve|fadeblack, duration}` on
  the incoming scene — rendered as a real xfade/acrossfade overlap (the
  assembly shortens by each duration). Must be shorter than both adjacent
  segments; the manifest validator enforces it.
- L-cuts: `scene.lcut` trails that scene's audio under the FOLLOWING card
  (mirror of jcut). Picture leaves early; per-scene clips stay full-bounds.
- Dialogue levels: `qa`'s dialogue-loudness gate flags scenes off the pack;
  fix with `scene.gainDb`, never by re-mastering the mix.

`ripple cut <manifest> --profile final` implements the rules above; heed its
`warnings` array — it says when it had to degrade. It snapshots the manifest
to `.ripple/history` before every render (`ripple snapshot --list`,
`ripple compare` to measure a change against any saved version).

## Delivery extras

- Captions: `ripple captions edit.json --style subtitle` (readability-bound
  SRT + styled ASS) or `--style social` (karaoke word highlight). Sidecars
  always; burn-in needs a libass ffmpeg (`RIPPLE_FFMPEG`).
- Reframes: `ripple cut --preset vertical|square` delivers the same cut
  reframed (fit `crop`); set `output.crop {x,y,w,h}` after READING a full
  frame when center-crop misses the subject. Preset renders never clobber
  the primary output.

## Delivery gates

`ripple qa <final> --manifest edit.json` must pass:
full decode clean; color metadata matches policy; expected clip count; leading
/tail silence in bounds; integrated loudness within ±1 LU of
`music.loudnessTarget` when a bed is set; transcript of the final contains
every scene's ending phrase and zero prompt leakage; no black frames or
frozen picture the manifest doesn't explain (declared cards and
dissolve/fadeblack overlaps are expected — everything else fails). Each
check carries its registry rule id (`reference/rules.md`), the same name
`candidates` and `lint` use for the failure. Draft profile is for iteration; the
final export is always a fresh single encode from source via the manifest —
never a re-encode of a draft.
