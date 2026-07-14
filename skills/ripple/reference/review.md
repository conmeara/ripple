# /ripple review — make the edit inspectable

Two audiences: the human (artifacts they can eyeball) and you (deterministic
checks + an independent second reader).

## Human review artifacts

Generate into `qa/` after any render worth showing:

1. **Scene table** (in your message): slug, in/out, duration, transcript
   ending, tail silence, status. This is the primary review surface.
2. **Frame sheets** of the full edit (`ripple frame-sheet outputs/final.mp4`)
   and tail strips of any scene you're unsure about.
3. Tell the user exactly what to look for, scene by scene — "Q8 got a new
   ending, check ~3:40" beats "here's the video".

## Deterministic QA

`ripple qa <final> --manifest edit.json` — decode, color metadata, clip
count, silence bounds, leak grep. It snapshots results to `.ripple/qa/` so
quality trends across runs; report the trend when it exists ("3 runs: 8/10 →
9/10 → 10/10 checks passing").

## Independent QA reviewer (narrow prompts only)

Broad prompts ("check the video") pass artifacts that specific prompts catch.
Give a fresh read-only reviewer a checklist naming known failure modes. Use
the bundled `qa-reviewer` agent when the host exposes it. Otherwise start a
subagent with `<ripple-plugin-root>/agents/qa-reviewer.md` as its contract; if
subagents are unavailable, follow that contract in the current agent and say
that the pass was not independent.

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
