# /ripple select — choosing the best takes

Take selection must be explainable: candidate takes, the chosen take, and the
reason, all recorded in edit.json. "It seemed best" is not reasoning.

## Takes spread across files

`ripple select fileA.mp4 fileB.mp4 ...` transcribes each (cached), clusters
files covering the same content, and scores each take on recency (later takes
usually improve), filler density, and whether it ends on a complete sentence.
Treat scores as a shortlist, not a verdict — confirm the recommended take with
`ripple candidates` before locking it.

## Takes inside one long recording

The groom-video case: one 13-minute file, several attempts per question.
The CLI can't cluster these — you can, from the transcript:

1. Read the word-level transcript JSON from `ripple transcribe`.
2. Repeated attempts show up as near-duplicate phrasings; the last attempt is
   usually the keeper, but verify — sometimes an early take is the complete
   one and the retry trails off.
3. Log every candidate range in the scene's `candidates` array with a short
   note ("take 2, stumbles at the end"), then run `candidates` on the winner.

## What to record

```json
{
  "slug": "married_life",
  "take": "take 2 of 2",
  "candidates": [{ "start": 731.0, "end": 748.2, "note": "take 1 — trails off" }],
  "reasoning": "take 2: no fillers, ends on 'excited for the adventure', confirmed by candidates"
}
```

If the user overrides a recommendation, that's signal — note what they valued
(energy over cleanliness? brevity?) in VIDEO.md's Steering log.
