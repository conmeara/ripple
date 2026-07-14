import { round3 } from "./util.mjs";

// Word-level timing: the fusion layer between whisper words and
// silencedetect. Each signal is wrong alone — whisper stretches a word's
// end across trailing silence and clumps the words after a long pause at
// one timestamp; silencedetect hears exactly when audio stops but not what
// was said. Fused, they answer the editor's question: where does speech
// actually end, and what starts when it resumes.

// Normalize whisper-cpp `-ml 1 -sow -oj` JSON into [{start, end, text}].
// Drops empty entries and non-speech annotations ([coughing], (laughs), ♪).
export function parseWhisperWords(whisperJson) {
  const out = [];
  for (const seg of whisperJson?.transcription ?? []) {
    const text = (seg.text ?? "").trim();
    if (!text) continue;
    if (/^[[(].*[)\]]$/.test(text)) continue;
    if (text.includes("♪")) continue;
    const start = round3((seg.offsets?.from ?? 0) / 1000);
    const end = round3((seg.offsets?.to ?? 0) / 1000);
    out.push({ start, end, text });
  }
  return out;
}

// Whisper lets a word's end timestamp absorb the silence that follows it
// ("toilet." spanning 492.6–494.8 across 2s of dead air). Clamp each word's
// end to the start of any silence span that begins inside the word.
export function clampWordEnds(words, silences) {
  return words.map((w) => {
    let end = w.end;
    for (const s of silences) {
      if (s.start > w.start && s.start < end) end = s.start;
    }
    return end === w.end ? w : { ...w, end: round3(Math.max(end, w.start + 0.02)) };
  });
}

// Symmetric fusion: whisper also smears the START of speech that resumes
// after a long pause backward into the silence (observed: "What's your
// favorite?" placed 4.5s early, spread across a 6.8s silence). A word cannot
// start inside real silence — push it to where audio resumes. Words fully
// swallowed by a silence span collapse to zero width at the resume point
// (matching whisper's own clumping; their text still matters for nextText).
export function snapWordStarts(words, silences) {
  return words.map((w) => {
    const dur = w.end - w.start;
    for (const s of silences) {
      if (s.end === null || w.start <= s.start) continue;
      // Phantom test: is the word mostly (or, for zero-width clumps,
      // entirely) inside this silence span?
      const inside = dur === 0
        ? w.start > s.start && w.start < s.end
        : Math.max(0, Math.min(w.end, s.end) - Math.max(w.start, s.start)) / dur > 0.6;
      if (inside) return { ...w, start: round3(s.end), end: round3(Math.max(w.end, s.end)) };
    }
    return w;
  });
}

// Full word/silence fusion: starts snapped forward out of silence, ends
// clamped back to silence onset. Snapping can reorder words (a phantom
// jumps past its unsnapped neighbor), so re-sort — cutTiming's "next word"
// walk depends on array order.
export function snapWords(words, silences) {
  return clampWordEnds(snapWordStarts(words, silences), silences)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

// The words every timing number is allowed to see. Suspect words stay in
// the index (visible, flagged — perception that silently edits itself is
// worse), but one hallucinated word reaching lastWordEnd corrupts the
// endpoint law, so every consumer in this file filters here first.
export function realWords(words) {
  return words.filter((w) => !w.suspect);
}

// Whisper fabricates text over music beds and long silence ("Thanks for
// watching." written across an outro nobody spoke in). The measured audio
// can veto the transcript with zero new dependencies. Runs BEFORE snapWords
// on the raw whisper words (sorted by start): the raw placement IS the
// evidence — after snapping, a mid-file fabrication sits zero-width at the
// resume point, indistinguishable from real resumed speech, and the old
// after-the-snap ordering let "Thanks for watching." over 20s of measured
// mid-file dead air surface as a timestamped search hit.
//   in-silence — the word's entire [start,end] sits inside a silence span
//     at the strictest threshold AND no rms window over it shows energy
//     above the floor. Full containment on purpose (a quiet real word
//     OVERLAPS silence, it doesn't live inside it), and the no-energy gate
//     needs positive evidence — no rms samples, no verdict. Real resumed
//     speech that whisper smeared backward into the pause is exempted by
//     the chain test below, not by ordering.
//   over-music — the word is an island in continuous audible audio: no
//     reference-threshold silence and no other word within minIsland
//     seconds on EITHER side. Real speech has neighbors; a real pause has
//     silence. Known miss, accepted: a multi-word fabrication protects
//     itself (the words are each other's neighbors) — indistinguishable
//     from real voice-over without spectral analysis.
export function markSuspectWords(words, {
  silences = [], // strictest-threshold spans (the snap map)
  refSilences = silences, // reference (~-40dB) spans, for the music test
  rms = [], // [{t, db}] energy track; each sample covers [t, t+rmsWindow)
  rmsWindow = 0.5,
  duration = Infinity,
  floorDb = -45,
  minIsland = 2,
  resumeSlack = 0.35, // how close a smear chain must get to the resume point
} = {}) {
  const noEnergy = (start, end) => {
    const e = Math.max(end, start + 0.001);
    const samples = rms.filter((v) => v.t < e && v.t + rmsWindow > start);
    return samples.length > 0 && samples.every((v) => v.db <= floorDb);
  };
  // Smear exemption: whisper drags resumed speech backward across a pause as
  // a CONTIGUOUS chain of words that reaches the resume point ("What's your
  // favorite?" spread over a 6.8s silence, its last word crossing the
  // silence end). A chain that gets within resumeSlack of the silence end is
  // mis-timed real speech — snapWords will repair it. A chain stranded
  // mid-silence ("Thanks for watching." ending 13s before audio resumes) is
  // whisper writing fiction. Accepted miss: a fabrication that happens to
  // abut the resume point rides the exemption.
  const chainReaches = (i, sEnd) => {
    let end = words[i].end;
    for (let j = i + 1; j < words.length && end < sEnd - resumeSlack; j++) {
      if (words[j].start > end + resumeSlack) break;
      end = Math.max(end, words[j].end);
    }
    return end >= sEnd - resumeSlack;
  };
  // `w.start >= sEnd` excludes words seated exactly ON the resume point
  // (already-snapped input) — those carry real text (nextText) and sit on
  // real audio. But a span that runs to EOF has no resume (some ffmpeg
  // builds close it at the last sample instead of leaving end null): a word
  // seated on that boundary is fabrication all the same.
  const inSilence = (w, i) => silences.some((s) => {
    const sEnd = s.end ?? duration;
    const resumes = sEnd < duration - 0.05;
    if (!(w.start >= s.start && w.end <= sEnd)) return false;
    if (!resumes) return true;
    if (w.start >= sEnd) return false;
    return !chainReaches(i, sEnd);
  });
  const touchesRefSilence = (start, end) => refSilences.some((s) => {
    const sEnd = s.end ?? duration;
    return s.start < end && sEnd > start;
  });

  const marked = words.map((w, i) =>
    inSilence(w, i) && noEnergy(w.start, w.end)
      ? { ...w, suspect: true, suspectReason: "in-silence" }
      : w
  );

  // Speech evidence for the island test: every word not already vetoed by
  // measured silence. A zero-length flank (file edge) is as isolated as it
  // gets, so it passes trivially.
  const speech = marked.filter((w) => !w.suspect);
  const flankFree = (start, end) =>
    start >= end ||
    (!touchesRefSilence(start, end) &&
      !speech.some((o) => o.start < end && o.end > start));

  return marked.map((w) => {
    if (w.suspect || w.end <= w.start) return w;
    if (touchesRefSilence(w.start, w.end)) return w;
    const before = flankFree(Math.max(0, w.start - minIsland), w.start);
    const after = flankFree(w.end, Math.min(duration, w.end + minIsland));
    return before && after ? { ...w, suspect: true, suspectReason: "over-music" } : w;
  });
}

// The numbers an editor reads off the timeline before locking a cut range.
// `words` must be sorted by start and in the same time coordinates as
// start/end (source seconds); `silences` are [{start, end}] spans
// (end may be null for silence running to EOF).
export function cutTiming(words, silences, { start, end }) {
  const clamped = clampWordEnds(realWords(words), silences);
  const inRange = clamped.filter((w) => w.end > start && w.start < end);

  const first = inRange[0] ?? null;
  const straddleStart = first && first.start < start - 0.05 ? first.text : null;
  const leadGap = first ? round3(Math.max(0, first.start - start)) : null;

  // Last word that finishes inside the range; a word running past the end
  // means the cut lands mid-word.
  const ending = inRange.filter((w) => w.end <= end + 0.05);
  const lastWord = ending[ending.length - 1] ?? null;
  const lastWordEnd = lastWord ? lastWord.end : null;
  const tailGap = lastWord ? round3(end - lastWordEnd) : null;
  const straddler = inRange.find((w) => w.start < end && w.end > end + 0.05);
  const straddleEnd = straddler ? straddler.text : null;

  // What comes after the content: the next transcribed words (whisper) and
  // the moment audio actually resumes (silencedetect). Whisper's first-word
  // timestamp after a long pause is unreliable — report both.
  let nextWordStart = null;
  let nextText = null;
  if (lastWord) {
    const idx = clamped.indexOf(lastWord);
    const rest = clamped.slice(idx + 1);
    if (rest.length) {
      nextWordStart = rest[0].start;
      nextText = rest.slice(0, 6).map((w) => w.text).join(" ");
    }
  }
  let nextAudioStart = null;
  if (lastWordEnd !== null) {
    const gap = silences.find((s) => s.start >= lastWordEnd - 0.3 && (s.end ?? Infinity) > lastWordEnd);
    if (gap) nextAudioStart = gap.end === null ? null : round3(gap.end);
  }

  return {
    wordsInRange: inRange.length,
    firstWordStart: first ? first.start : null,
    leadGap,
    straddleStart,
    lastWordEnd,
    tailGap,
    straddleEnd,
    nextWordStart,
    nextText,
    nextAudioStart,
  };
}

// Subtract `holes` from each base span; returns the remaining sub-spans.
export function subtractSpans(base, holes) {
  let spans = base.map((s) => ({ ...s }));
  for (const hole of holes) {
    const next = [];
    for (const s of spans) {
      const hStart = hole.start ?? -Infinity;
      const hEnd = hole.end ?? Infinity;
      if (hEnd <= s.start || hStart >= s.end) {
        next.push(s);
        continue;
      }
      if (hStart > s.start) next.push({ start: s.start, end: round3(hStart) });
      if (hEnd < s.end) next.push({ start: round3(hEnd), end: s.end });
    }
    spans = next;
  }
  return spans;
}

// Audible-but-wordless regions: audio energy with no transcribed speech —
// laughs, claps, music stings, breaths. Prime cut-away material an agent
// can't hear any other way.
export function nonSpeechSpans(silences, words, { start, end, minDur = 0.35 }) {
  const window = [{ start, end }];
  const silenceHoles = silences.map((s) => ({ start: s.start, end: s.end ?? end }));
  const audible = subtractSpans(window, silenceHoles);
  // Suspects must not carve holes: a hallucinated word over a music sting
  // would otherwise hide the sting from the cut-away finder.
  const clamped = clampWordEnds(realWords(words), silences);
  const remainder = subtractSpans(audible, clamped);
  return remainder
    .filter((s) => s.end - s.start >= minDur)
    .map((s) => ({ start: round3(s.start), end: round3(s.end), duration: round3(s.end - s.start) }));
}

// Sentence-final word ends: where the text ends a sentence, or a real gap
// follows (the acoustic sentence boundary whisper's punctuation missed).
// These are the legal OUT-point lattice for cuts.
export function sentenceEnds(words, silences, { minGap = 0.4 } = {}) {
  const clamped = clampWordEnds(realWords(words), silences);
  const ends = [];
  for (let i = 0; i < clamped.length; i++) {
    const w = clamped[i];
    const next = clamped[i + 1];
    const punctuated = /[.!?]["')\]]?$/.test(w.text);
    const gapped = next ? next.start - w.end >= minGap : true;
    if (punctuated || gapped) ends.push(w.end);
  }
  return ends;
}

// Parse ffmpeg `metadata=print`/`ametadata=print` stdout into [{t, value}].
// Works for any per-frame metric (astats RMS_level, signalstats YDIF, …);
// -inf (digital silence) maps to -120.
export function parseMetadataTrack(stdout, key) {
  const values = [];
  let t = null;
  const re = new RegExp(`${key}=(-?[\\d.]+|-inf|inf)`);
  for (const line of stdout.split("\n")) {
    const pts = line.match(/pts_time:([\d.]+)/);
    if (pts) {
      t = Number(pts[1]);
      continue;
    }
    const m = line.match(re);
    if (m && t !== null) {
      values.push({ t: round3(t), value: m[1] === "-inf" ? -120 : m[1] === "inf" ? 120 : round3(Number(m[1])) });
      t = null;
    }
  }
  return values;
}

// Group words into sentences (punctuation or a ≥minGap pause ends one) with
// the numbers an editor reads: bounds, text, words-per-second. Slow, weighted
// delivery (low wps) earns a longer tail; rushed delivery cuts tighter.
export function sentenceSpans(words, silences, { minGap = 0.4 } = {}) {
  const clamped = clampWordEnds(realWords(words), silences);
  const sentences = [];
  let current = null;
  for (let i = 0; i < clamped.length; i++) {
    const w = clamped[i];
    if (!current) current = { start: w.start, words: [] };
    current.words.push(w);
    const next = clamped[i + 1];
    const punctuated = /[.!?]["')\]]?$/.test(w.text);
    const gapped = next ? next.start - w.end >= minGap : true;
    if (punctuated || gapped || !next) {
      const duration = round3(w.end - current.start);
      sentences.push({
        start: current.start,
        end: w.end,
        text: current.words.map((x) => x.text).join(" "),
        words: current.words.length,
        wps: duration > 0 ? round3(current.words.length / duration) : null,
      });
      current = null;
    }
  }
  return sentences;
}

// Conservative on purpose: only unambiguous vocalized pauses. Words like
// "like"/"so"/"right" are real words as often as fillers — that call needs
// the sentence, which is the model's job, not a regex's.
const FILLER_RE = /^(um+|uh+|erm+|hmm+|mhm+|ah+|eh+)[,.]?$/i;

// Filler-word spans: the exact removable ranges for a "tighter" pass, plus
// immediate word repeats (restarts: "she— she owns"). The only judgment left
// for the model is whether removal creates a jump cut.
export function fillerSpans(allWords, { fillers = FILLER_RE } = {}) {
  const words = realWords(allWords);
  const out = [];
  const norm = (t) => t.toLowerCase().replace(/[^a-z']/g, "");
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const isFiller = fillers.test(w.text.trim());
    const isRestart = i + 1 < words.length && norm(w.text) && norm(w.text) === norm(words[i + 1].text);
    if (isFiller || isRestart) {
      out.push({ start: w.start, end: w.end, text: w.text.trim(), kind: isRestart ? "restart" : "filler" });
    }
  }
  return out;
}

// Hard cuts / resets stand out as outlier spikes in the per-frame luma-diff
// track. Threshold: well above both an absolute floor and the track's own
// statistics, with a refractory gap so one cut isn't reported twice.
export function sceneChangesFromMotion(track, { floor = 22, sigmas = 6, minGap = 0.5 } = {}) {
  if (!track.length) return [];
  const mean = track.reduce((a, v) => a + v.value, 0) / track.length;
  const variance = track.reduce((a, v) => a + (v.value - mean) ** 2, 0) / track.length;
  const threshold = Math.max(floor, mean + sigmas * Math.sqrt(variance));
  const changes = [];
  for (const v of track) {
    if (v.value < threshold) continue;
    if (changes.length && v.t - changes[changes.length - 1] < minGap) continue;
    changes.push(v.t);
  }
  return changes;
}

// Infer the whisper-cli --dtw preset from a ggml model filename
// (ggml-base.en.bin → base.en, ggml-large-v3-turbo-q5_0.bin → large.v3.turbo).
// Returns null when the name doesn't map to a known preset.
export function dtwPreset(modelPath) {
  const m = modelPath.match(/ggml-([a-z0-9.-]+?)(?:-q[0-9]_[0-9k])?\.bin$/i);
  if (!m) return null;
  const name = m[1].replace(/-/g, ".");
  const known = new Set([
    "tiny", "tiny.en", "base", "base.en", "small", "small.en",
    "medium", "medium.en", "large.v1", "large.v2", "large.v3", "large.v3.turbo",
  ]);
  return known.has(name) ? name : null;
}
