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

`ripple cut <manifest> --profile final` implements the rules above; heed its
`warnings` array — it says when it had to degrade.

## Delivery gates

`ripple qa <final> --manifest edit.json` must pass:
full decode clean; color metadata matches policy; expected clip count; leading
/tail silence in bounds; transcript of the final contains every scene's
ending phrase and zero prompt leakage. Draft profile is for iteration; the
final export is always a fresh single encode from source via the manifest —
never a re-encode of a draft.
