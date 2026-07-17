import { existsSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { realWords } from "./timing.mjs";
import { fail, fileStamp, output, parseArgs, readJsonOrNull, round3 } from "./util.mjs";

// "Find where anyone says X across all footage" — word-accurate spans from
// the cached perception indexes. The search box every editor has and every
// multi-source agent project was missing.

// Apostrophes collapse too: "dont" must find "don't".
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

// Word-sequence match over [{start, end, text}] — returns word-accurate
// spans for every occurrence of the phrase. Suspect words are whisper
// fabrications over silence/music: a phrase the speaker never said must not
// come back as a timestamped hit, so the filter lives in the helper every
// caller shares (the timing.mjs consumer-filters idiom).
export function searchWords(allWords, phrase) {
  const words = realWords(allWords ?? []);
  const tokens = phrase.split(/\s+/).map(norm).filter(Boolean);
  if (!tokens.length || !words.length) return [];
  const normalized = words.map((w) => norm(w.text));
  const matches = [];
  for (let i = 0; i + tokens.length <= words.length; i++) {
    let hit = true;
    for (let k = 0; k < tokens.length; k++) {
      if (normalized[i + k] !== tokens[k]) {
        hit = false;
        break;
      }
    }
    if (hit) {
      matches.push({
        start: words[i].start,
        end: words[i + tokens.length - 1].end,
        text: words.slice(i, i + tokens.length).map((w) => w.text).join(" "),
      });
    }
  }
  return matches;
}

export async function main(argv) {
  const args = parseArgs(argv, { "analysis-dir": "string", limit: "number" });
  const phrase = args._[0];
  if (!phrase) fail('Usage: ripple search "phrase" [source-files...] [--analysis-dir work/analysis] [--limit 50]', 2);
  const files = args._.slice(1);
  const analysisDir = args["analysis-dir"] ?? join(process.cwd(), "work", "analysis");
  if (!existsSync(analysisDir)) {
    fail(`No analysis dir at ${analysisDir} — run \`ripple analyze <source>\` first; search reads the cached indexes.`, 2);
  }

  // Explicit files → their current indexes; otherwise every index on disk.
  let indexPaths;
  if (files.length) {
    indexPaths = files.map((f) => {
      if (!existsSync(f)) fail(`File not found: ${f}`, 2);
      return join(analysisDir, `${basename(f, extname(f))}_${fileStamp(f)}.analysis.json`);
    });
  } else {
    // Superseded stems for the same source linger after re-analysis — keep
    // one index per source file, preferring the current (non-stale) stem.
    const bySource = new Map();
    for (const f of readdirSync(analysisDir).filter((f) => f.endsWith(".analysis.json"))) {
      const path = join(analysisDir, f);
      const idx = readJsonOrNull(path);
      if (!idx?.file) continue;
      const current = existsSync(idx.file) && path.includes(fileStamp(idx.file));
      const prev = bySource.get(idx.file);
      if (!prev || (current && !prev.current)) bySource.set(idx.file, { path, current });
    }
    indexPaths = [...bySource.values()].map((v) => v.path);
  }

  const limit = args.limit ?? 50;
  const results = [];
  const searched = [];
  const problems = [];
  for (const path of indexPaths) {
    const index = readJsonOrNull(path);
    if (!index?.words) {
      problems.push(`${path}: no word data (re-run ripple analyze)`);
      continue;
    }
    // Stale index (source changed since indexing) still searches, but says so.
    const stale = Boolean(
      index.file && existsSync(index.file) &&
      !path.includes(fileStamp(index.file))
    );
    searched.push(index.file ?? path);
    for (const m of searchWords(index.words, phrase)) {
      const sentence = (index.sentences ?? []).find((s) => m.start >= s.start - 0.05 && m.start < s.end + 0.05);
      results.push({
        file: index.file ?? path,
        start: round3(m.start),
        end: round3(m.end),
        text: m.text,
        ...(sentence ? { sentence: sentence.text.slice(0, 160) } : {}),
        ...(stale ? { stale: true } : {}),
      });
    }
  }
  results.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  const capped = results.slice(0, limit);

  output({
    ok: true,
    phrase,
    matches: capped,
    total: results.length,
    ...(results.length > limit ? { note: `showing ${limit} of ${results.length} — raise --limit` } : {}),
    searched: searched.length,
    ...(problems.length ? { problems } : {}),
    hints: capped.length
      ? ["Zoom any hit: ripple timeline-sheet <file> --around <start> --span 12 — then candidates before using it."]
      : ["No matches. Try fewer words (matching is exact word-sequence, punctuation-insensitive), or check `ripple probe` for unindexed footage."],
  });
}
