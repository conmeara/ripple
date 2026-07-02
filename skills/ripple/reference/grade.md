# /ripple grade — color grading as config

Grading is generated config applied at render time, never a destructive step.
The user picks with their eyes; you never ship a grade nobody compared.

## Flow

1. **Check color first.** `ripple grade` refuses HDR sources — SDR presets on
   HDR footage break color. For HDR projects, grading means either delivering
   SDR (explicit tone-map, see `finish`) or leaving grade alone.
2. **Generate variants on the SAME frame**: `ripple grade <file>` (pick a
   representative frame with `--at`; a face in typical lighting beats a title
   card). Presets: neutral, warm, cool, punchy, film, bw.
3. **Read the contact sheet yourself, then show the user.** Left→right order
   matches the `order` field in the output. Describe what each does in plain
   language ("warm lifts skin tones, film flattens the blacks slightly").
4. **Record the pick**: `ripple grade <file> --choose warm --manifest
   edit.json`. The grade rides the manifest — `ripple cut --profile final`
   applies it in the single final encode. Draft renders stay ungraded (fast,
   and grading drafts hides cut problems).
5. **Verify on output**: after the final render, extract one graded frame and
   compare against the chosen still. A grade that shifted in the pipeline is
   a bug, not a vibe.

## Custom looks

The presets are starting points. For a described look ("teal and orange",
"like a Wes Anderson film"), write the ffmpeg filter chain yourself, set it
directly as `manifest.grade = { name, filter }`, and still do the same-frame
comparison before rendering. Never iterate a grade by re-rendering the full
video — iterate on stills.
