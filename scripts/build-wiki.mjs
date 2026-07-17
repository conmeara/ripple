// Builds docs/index.html (the wiki): converts the shipped skill files to HTML
// and injects them, the command reference, and the landscape cards into
// docs/wiki-template.html. Run with: npm run gen:wiki
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.dirname(DIR);
const VERSION = 'v' + JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

// ---------- tiny markdown -> html ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}
function mdToHtml(src) {
  const out = [];
  const lines = src.split('\n');
  let i = 0;
  // front matter shown as a meta block
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      out.push(`<div class="fm">${esc(lines.slice(1, end).join('\n'))}</div>`);
      i = end + 1;
    }
  }
  const listStack = [];
  const closeLists = (depth = 0) => { while (listStack.length > depth) out.push(`</${listStack.pop()}>`); };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      closeLists();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\|/.test(line)) {
      closeLists();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(rows[0]);
      const body = rows.slice(rows[1] && /^[|\s:\-]+$/.test(rows[1]) ? 2 : 1);
      out.push('<table><thead><tr>' + head.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>');
      for (const r of body) out.push('<tr>' + cells(r).map((c) => `<td>${c}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { closeLists(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { closeLists(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      closeLists();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
    if (li) {
      const depth = Math.floor(li[1].length / 2) + 1;
      const kind = /\d/.test(li[2]) ? 'ol' : 'ul';
      while (listStack.length > depth) out.push(`</${listStack.pop()}>`);
      while (listStack.length < depth) { out.push(`<${kind}>`); listStack.push(kind); }
      // continuation lines (indented, non-list) belong to this item
      const buf = [li[3]];
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) buf.push(lines[i++].trim());
      out.push(`<li>${inline(buf.join(' '))}</li>`);
      continue;
    }
    if (/^\s*$/.test(line)) { closeLists(); i++; continue; }
    closeLists();
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|```|\||>|---|\s*([-*]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  closeLists();
  return out.join('\n');
}

// ---------- skill files ----------
const FILES = [
  { id: 'skill', group: 'Router', name: 'SKILL.md', blurb: 'entry point + absolute rules', rel: 'skills/ripple/SKILL.md' },
  { id: 'develop', group: 'Playbooks', name: 'develop.md', blurb: 'idea → script, shot list, generation', rel: 'skills/ripple/reference/develop.md' },
  { id: 'edit', group: 'Playbooks', name: 'edit.md', blurb: 'the verified-endpoint cut loop', rel: 'skills/ripple/reference/edit.md' },
  { id: 'taste', group: 'Playbooks', name: 'taste.md', blurb: 'VIDEO.md, study, stack opinions', rel: 'skills/ripple/reference/taste.md' },
  { id: 'deliver', group: 'Playbooks', name: 'deliver.md', blurb: 'color, assembly, QA, NLE handoff', rel: 'skills/ripple/reference/deliver.md' },
  { id: 'perception', group: 'References', name: 'perception.md', blurb: 'reading the index + sheets', rel: 'skills/ripple/reference/perception.md' },
  { id: 'rules', group: 'References', name: 'rules.md', blurb: '28 rules, generated from code', rel: 'skills/ripple/reference/rules.md' },
  { id: 'videomd', group: 'Taste & agents', name: 'VIDEO.md (template)', blurb: 'standing creative direction', rel: 'skills/ripple/templates/VIDEO.md' },
  { id: 'qareviewer', group: 'Taste & agents', name: 'qa-reviewer.md', blurb: 'independent read-only reviewer', rel: 'agents/qa-reviewer.md' },
];

let templates = '';
const manifest = [];
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f.rel), 'utf8');
  templates += `<template id="md-${f.id}">${mdToHtml(src)}</template>\n`;
  manifest.push({ id: f.id, group: f.group, name: f.name, blurb: f.blurb, path: f.rel, lines: src.split('\n').length });
}

// ---------- command reference ----------
const CMDS = {
  analyze: { one: 'build the perception index — run once per source', what: 'The eyes and ears. One pass produces the cached index: word timings, measured silence at multiple thresholds, sentences with pace and terminal pitch, fillers, breaths, audible non-speech events (laughs, claps), scene changes, motion and energy curves, and a drift self-check.', how: 'Extracts 16kHz mono WAV; whisper-cpp transcribes it — long sources are pre-segmented at measured silences into ≤30s chunks with timestamps offset-added, so cumulative drift is structurally impossible (v0.11). Word timing comes from a second whisper pass (-ml 1 -sow), fused with ffmpeg silencedetect; prosody, motion, and scene curves come from ffmpeg filters. Cached by file content hash, so moved files keep their index.', io: 'Reads the media file → writes work/analysis/&lt;hash&gt;.analysis.json (+ 16k WAV, word JSONs). Everything downstream queries this cache instead of re-perceiving.' },
  candidates: { one: 'verify a cut range with three signals before you trust it', what: 'The endpoint instrument for "cut after the completed thought." For a proposed IN/OUT it returns word timing (lastWordEnd, tailGap, what starts next), red flags from the rules registry, a mechanical suggestedOut and suggestedIn, silence at multiple thresholds, the range transcript, edge frames, and head/tail cut-card sheets.', how: 'Reads the cached index; computes timing via cutTiming; flags DEAD_AIR_TAIL, LATE_FIRST_WORD, STUTTER_CUT (cut inside a &lt;0.25s silence), MICRO_CLIP (&lt;1s kept range) and more; suggestedOut = lastWordEnd + tail preference, capped before next speech; suggestedIn = firstWordStart − 0.3s lead margin, floored on prior audio. Every range is cross-checked against an isolated re-transcription (driftCheck) — disagreement raises INDEX_DRIFT and suppresses the suggestion. --manifest batch-verifies every scene of an edit.json, the expensive pass lint skips.', io: 'Reads index + media → writes strips/cut-card sheets under work/candidates/; JSON verdict to stdout.' },
  'frame-sheet': { one: 'tiled frames so the agent can see the footage', what: 'The discovery eye: a tiled contact sheet of frames across a range. --scenes samples where the picture changes — the cheap way to find takes, resets, and b-roll ("look at 40 tiles, pick the coffee pour").', how: 'ffmpeg frame extraction on a time grid (or at scene-change timestamps from the index), tiled into one PNG with timestamps burned per tile, sized to stay cheap as image tokens.', io: 'Reads media (+ index for --scenes) → writes the sheet PNG; JSON with the path and grid to stdout.' },
  'timeline-sheet': { one: 'the editor’s timeline as one image — the flagship artifact', what: 'Thumbnails, a motion strip, the audio waveform with silence shading, non-speech events, the word-aligned transcript, and edit markers on one shared time axis. The agent reasons in tokens, then confirms the situation visually without guessing how one view maps to the other. --at zooms a moment.', how: 'Renders bands from the cached index onto a canvas: frame thumbnails on the ruler, motion curve, waveform with measured-silence shading, event and word lanes, and cut markers (the orange OUT). All bands share one time axis, so vertical alignment is meaning.', io: 'Reads index + media → writes the sheet PNG; JSON with band legend to stdout.' },
  lint: { one: 'pre-render rule check for the whole manifest', what: 'The cheap gate before rendering: every scene’s endpoint flags from cached perception, plus waiver accounting — a flagged scene passes only with a written waiver naming the rule and reason. Exit 1 on an unwaived block.', how: 'Walks edit.json scenes, resolves each source’s cached index, runs the same endpointFlags code candidates uses (one registry, two callers), applies VIDEO.md project overrides (maxTail/maxLead), checks schema validity, J/L-cut fit, and waiver integrity.', io: 'Reads edit.json + cached indexes → JSON verdict with per-scene flags; exit code is the contract.' },
  cut: { one: 'render the manifest — clips, cards, J/L cuts, music, assembly', what: 'The hands. Renders each scene clip and the full assembly from edit.json: title cards, J/L-cuts bridged through card audio, dissolve/fadeblack transitions, a music bed with sidechain ducking and loudness normalization, per-scene gain, and 30ms de-pop micro-fades at every cut boundary by default.', how: 'Builds ffmpeg filter graphs per scene and for the assembly: xfade/acrossfade for transitions (with pixel-format guards), aevalsrc/anullsrc card audio, sidechaincompress for ducking, afade micro-fades (J/L-aware, clamped for tiny clips), HDR-preserving encode with explicit color params, then a history snapshot of the manifest.', io: 'Reads edit.json + media → writes clips/ and outputs/final_draft.mp4 + .ripple/history snapshot; JSON (paths, warnings, next: qa) to stdout.' },
  qa: { one: 'deterministic delivery gates on the rendered file', what: 'The involuntary playback review: decode integrity, color policy (HDR in = HDR out), clip counts, scene tails, dialogue loudness spread, leading/tail silence, black and freeze frames outside intentional regions, prompt-leak patterns, and expected scene endings verified against a transcript of the render. --report renders the HTML QA report.', how: 'ffprobe/ffmpeg probes (blackdetect, freezedetect, volumedetect, loudnorm), manifest-aware intentional-region exclusion (cards, transitions), transcript-backed content gates that refuse to pass unverified (fail-unverified plan), whitespace-normalized ending matching, trend snapshots across runs.', io: 'Reads the render + edit.json (+ --transcribe) → JSON gate results; exit 1 on any failed gate.' },
  search: { one: 'find where anyone says a phrase, word-accurate, across sources', what: 'Phrase search over every indexed source at word accuracy — the entry point for interview-at-scale work: find the answer inside hours, then verify it with candidates.', how: 'Scans the cached word timelines (no re-transcription), matches normalized phrases, returns source, start/end, and surrounding words for each hit.', io: 'Reads cached indexes → JSON hits with word-accurate times.' },
  select: { one: 'group repeated takes and recommend the best', what: 'Take selection on evidence: groups takes of the same line across files by transcript similarity and recommends the best per group — matched to script lines in fiction work.', how: 'Clusters ranges whose transcripts overlap, scores candidates on measured signals (completeness, pace, fillers, energy), and reports the evidence behind each recommendation rather than a bare verdict.', io: 'Reads cached indexes → JSON groups with per-take evidence.' },
  sync: { one: 'multicam offsets by audio cross-correlation', what: 'Finds how far each recording is offset from a reference so a moment found in one angle maps onto another. The measured answer to "which camera started when."', how: 'Cross-correlates audio energy between files; reports offset (other_time + offset = ref_time), a normalized confidence (below ~0.2 the files likely don’t share audio), and a plain-language note about which file is missing head.', io: 'Reads two or more media files → JSON offsets + confidence.' },
  beats: { one: 'a beat grid for the music bed', what: 'BPM, beat times, and confidence for a track — the timing lattice for cutting to music.', how: 'Energy-flux onset detection in ffmpeg terms (zero-dependency floor); the prior-art ladder escalates to the aubiotrack binary when installed.', io: 'Reads the audio/music file → JSON bpm + beat times.' },
  study: { one: 'extract taste from a reference edit', what: 'Measures a reference edit’s cutting rhythm, delivery pace, tail preference, silence usage, energy, and grade lean, then proposes matching VIDEO.md values with the measurement behind each — taste captured as numbers, never applied without approval.', how: 'Runs the perception stack on the reference, derives distributions (shot lengths, tail lengths, wps), maps them onto VIDEO.md fields, and shows the evidence per proposal.', io: 'Reads a reference video → JSON proposed VIDEO.md values + evidence; writes nothing without approval.' },
  doctor: { one: 'check the toolchain and print fixes', what: 'Verifies ffmpeg/ffprobe, whisper-cpp and its model, encoders, and optional binaries, and prints the exact install commands for anything missing.', how: 'Probes PATH and versions, runs capability checks (e.g. whisper --split-on-word support, zscale availability), and emits guided fixes.', io: 'Reads the environment → JSON status + fix hints.' },
  probe: { one: 'inspect a file’s streams — or the whole media bin', what: 'Per-file: streams, resolution, fps, HDR/color metadata, audio layout, capability warnings. With no file: the media bin listing plus each source’s perception-index state — the orientation command for a cold session.', how: 'ffprobe JSON parsed into a normalized envelope; HDR detection from color_transfer/primaries; index state from the analysis cache.', io: 'Reads media/cache → JSON description.' },
  history: { one: 'save, list, and diff cut snapshots', what: 'The edit’s memory: every cut auto-snapshots the manifest; history lists versions, diffs two of them scene-by-scene, and dedups identical states.', how: 'Content-hashes the manifest; stores under .ripple/history; --diff compares manifests structurally (scenes added/removed/retimed) rather than as text.', io: 'Reads/writes .ripple/history → JSON list/diff.' },
  captions: { one: 'word-accurate captions in output time', what: 'SRT plus styled ASS captions whose times are in the rendered output’s timeline (not source time), with optional burn-in.', how: 'Maps source-time word timings through the manifest’s scene arithmetic into output time, then emits caption files; burn-in re-renders with the subtitles filter.', io: 'Reads edit.json + index → writes .srt/.ass (and optionally a burned render).' },
  handoff: { one: 'hand the cut to an NLE', what: 'Exports the cut as OTIO (Resolve-native since 18.5), FCP7 XML (the Premiere path — its OTIO import is still beta), or EDL (universal). For interview-scale work the NLE is a peer terminal: cut the structure right, hand over the taste-heavy 20%.', how: 'Translates edit.json scene arithmetic into each format’s timeline model directly — no OTIO library dependency; ripple’s render path is its own ffmpeg bridge.', io: 'Reads edit.json → writes .otio/.xml/.edl.' },
  transcribe: { one: 'transcript for any file — subtitles first, whisper fallback', what: 'The plain transcript utility: existing subtitle tracks win (free and exact), whisper-cpp otherwise, cached; --words adds word-level timing.', how: 'Same chunked whisper pipeline as analyze (shared cache with version/mode/model metadata so stale entries can’t be reused); subtitle extraction via ffmpeg when a track exists.', io: 'Reads media → writes .txt/.srt/word JSON under work/transcripts/; JSON with file paths.' },
};

function cmdHtml(name) {
  const c = CMDS[name];
  return `<details class="cmd"><summary><code>${name}</code><span class="oneline">${c.one}</span></summary>
  <div class="body">
    <p><b class="k">What it does</b>${c.what}</p>
    <p><b class="k">How it works</b>${c.how}</p>
    <p><b class="k">Reads → writes</b>${c.io}</p>
  </div></details>`;
}

// ---------- landscape projects ----------
const PROJECTS = [
  { name: 'video-use (browser-use)', meta: '17k\u2605 \u00b7 MIT \u00b7 TypeScript', verdict: ['learn', 'ADJACENT'], html: `The closest neighbor, and a well-designed one. Same thesis, stated their way: <b>"the LLM never watches the video. It reads it."</b> The bets differ: video-use packs one cloud transcription call (ElevenLabs) into ~12KB of markdown; Ripple builds a local-first perception index with whisper-cpp and ffmpeg on your machine. Ripple's always-on 30ms cut fades credit video-use's design. What Ripple adds above it: verified cut endpoints, deterministic QA gates, and NLE handoff \u2014 the "check your work" half of editing.` },
  { name: 'OpenMontage', meta: '~39.5k\u2605 \u00b7 AGPL', verdict: ['ignore', 'DIFFERENT PRODUCT'], html: `<b>Generation-first</b>: a provider menu (Runway, Kling, Veo\u2026) that composes generated shots into montages. Ripple is the opposite bet \u2014 editing-first and opinionated: it cuts footage you already have and routes generation out to a deliberately chosen stack. Its named-failure-mode QA scoring is a kindred idea to Ripple's rule registry. AGPL vs Ripple's Apache-2.0.` },
  { name: 'auto-editor', meta: '4.6k\u2605 \u00b7 very active \u00b7 Nim', verdict: ['adopt', 'TECHNIQUE CREDIT'], html: `The best deterministic batch silence-cutter: one command, one job, done instantly \u2014 not agentic, and it makes no editorial decisions. Ripple's cut-safety guards port its ideas with credit: asymmetric lead/trail margins (Ripple's <code>suggestIn</code>) and minimum cut/clip durations (Ripple's <code>STUTTER_CUT</code>/<code>MICRO_CLIP</code> flags). Use auto-editor when you want fast unattended silence removal; use Ripple when the cut needs judgment and verification.` },
  { name: 'WhisperX', meta: '23.1k\u2605 \u00b7 active \u00b7 Python/PyTorch', verdict: ['adopt', 'TECHNIQUE CREDIT'], html: `The gold standard for long-source transcription alignment: VAD pre-chunking plus wav2vec2 forced alignment (word boundaries to tens of ms). Ripple ports the chunking idea into its zero-Python whisper-cpp pipeline \u2014 silence-anchored \u226430s windows, offset-added \u2014 so cumulative drift is structurally impossible without the ~2GB PyTorch install. WhisperX stops at transcription; Ripple is the editing loop above it.` },
  { name: 'videogrep \u00b7 PySceneDetect \u00b7 aubio', meta: 'the technique lineage', verdict: ['adopt', 'TECHNIQUE CREDIT'], html: `Three more ideas Ripple stands on: videogrep pioneered transcript-driven cutting (Ripple's <code>search</code> keeps its two-tier contract \u2014 sentence-safe by default, word-exact on request); PySceneDetect's adaptive rolling-ratio scene test informs how Ripple reads scene scores; aubio's <code>aubiotrack</code> is the planned optional beat-grid backend, the same detected-binary pattern as whisper-cpp.` },
  { name: 'FunClip \u00b7 ClipsAI \u00b7 ButterCut', meta: 'Alibaba \u00b7 OSS \u00b7 PolyForm-NC', verdict: ['learn', 'ADJACENT'], html: `The adjacent category. FunClip: clip-by-selecting-transcript-text as the primitive. ClipsAI: speaker-tracking auto-reframe to 9:16 \u2014 finishing-suite work Ripple leaves to the NLE. ButterCut: the same <b>"agent edits, NLE finishes"</b> thesis as Ripple's handoff \u2014 independent confirmation that terminal is right.` },
  { name: 'HyperFrames \u00b7 Remotion \u00b7 ElevenLabs \u00b7 Gemini Image', meta: 'the routed-to stack', verdict: ['route', 'ROUTES TO'], html: `Not competitors \u2014 the production stack Ripple's playbooks choose deliberately: HyperFrames for motion graphics from scratch, Remotion for timed React overlays (timed from Ripple's word-level transcript), ElevenLabs for voice-over and music beds generated to the manifest's exact duration, Gemini for stills and cards. Ripple owns assembly timing and verification; they own creation.` },
];
const projHtml = PROJECTS.map((p) => `<div class="proj">
  <div class="head"><b>${p.name}</b><span class="meta">${p.meta}</span><span class="verdict v-${p.verdict[0]}">${p.verdict[1]}</span></div>
  <p>${p.html}</p>
</div>`).join('\n');

// ---------- assemble ----------
let html = fs.readFileSync(path.join(ROOT, 'docs', 'wiki-template.html'), 'utf8');
html = html.replaceAll('{{VERSION}}', VERSION);
html = html.replace(/<!--CMD:([a-z-]+)-->/g, (_, n) => cmdHtml(n));
html = html.replace('<!--PROJECTS-->', projHtml);
html = html.replace('<!--FILE_LIST-->', '');
html = html.replace('<script>', `${templates}<script>\nwindow.__RIPPLE_FILES__ = ${JSON.stringify(manifest)};\n`);
fs.writeFileSync(path.join(ROOT, 'docs', 'index.html'), html);
console.log('wrote docs/index.html (' + VERSION + ')', html.length, 'bytes');
