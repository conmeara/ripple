import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fail, output, parseArgs } from "./util.mjs";
import { transcribeFile } from "./transcribe.mjs";

// ---------- pure helpers (unit-tested) ----------

const FILLERS = ["um", "uh", "uhm", "er", "like", "you know", "i mean", "sort of", "kind of"];

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []);
}

// For similarity: fillers are delivery noise, not content — two takes of the
// same answer must cluster together even when one is filler-heavy.
const FILLER_TOKENS = new Set(["um", "uh", "uhm", "er", "like"]);
export function contentTokens(text) {
  return tokenize(text).filter((t) => !FILLER_TOKENS.has(t));
}

export function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function fillerDensity(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return 0;
  const lower = ` ${text.toLowerCase()} `;
  let count = 0;
  for (const f of FILLERS) {
    count += (lower.match(new RegExp(`[^a-z]${f.replace(" ", "\\s")}[^a-z]`, "g")) ?? []).length;
  }
  return count / tokens.length;
}

export function endsComplete(text) {
  return /[.!?]\s*$/.test(text.trim());
}

// Greedy clustering: a take joins the first group whose representative is similar enough.
export function clusterTakes(takes, threshold = 0.4) {
  const groups = [];
  for (const take of takes) {
    const tokens = contentTokens(take.text);
    const home = groups.find((g) => jaccard(tokens, g.repTokens) >= threshold);
    if (home) home.takes.push(take);
    else groups.push({ repTokens: tokens, takes: [take] });
  }
  return groups.map((g) => g.takes);
}

// Score a take within its group. Later takes and cleaner speech win; incomplete endings lose.
export function scoreTake(take, index, total) {
  const recency = total > 1 ? index / (total - 1) : 1;
  const cleanliness = 1 - Math.min(fillerDensity(take.text) * 10, 1);
  const complete = endsComplete(take.text) ? 1 : 0;
  const score = 0.4 * recency + 0.35 * cleanliness + 0.25 * complete;
  return {
    score: Math.round(score * 100) / 100,
    reasoning: [
      `take ${index + 1}/${total}${index === total - 1 ? " (latest)" : ""}`,
      `filler density ${(fillerDensity(take.text) * 100).toFixed(1)}%`,
      endsComplete(take.text) ? "ends on a complete sentence" : "does NOT end cleanly — verify before using",
    ].join("; "),
  };
}

// ---------- impl ----------

export async function main(argv) {
  const args = parseArgs(argv, { out: "string", prompt: "string", threshold: "number" });
  const files = args._;
  if (files.length < 2) {
    fail(
      "Usage: ripple select <file1> <file2> [...] [--threshold 0.4] [--prompt hints]\n" +
        "Groups source files whose transcripts cover the same content and recommends the best take per group.\n" +
        "For multiple takes INSIDE one long recording, read the transcript timestamps instead (see /ripple plan).",
      2
    );
  }
  for (const f of files) if (!existsSync(f)) fail(`File not found: ${f}`, 2);

  const outDir = args.out ?? join(process.cwd(), "work", "transcripts");
  const takes = [];
  for (const file of files) {
    const t = transcribeFile(file, { outDir, prompt: args.prompt });
    const text = existsSync(t.files.txt) ? readFileSync(t.files.txt, "utf8").trim() : "";
    takes.push({ file, text, mtime: statSync(file).mtimeMs });
  }

  const groups = clusterTakes(takes, args.threshold ?? 0.4).map((group) => {
    const ordered = [...group].sort((a, b) => a.mtime - b.mtime);
    const scored = ordered.map((take, i) => ({
      file: take.file,
      excerpt: take.text.slice(0, 160),
      ...scoreTake(take, i, ordered.length),
    }));
    const best = [...scored].sort((a, b) => b.score - a.score)[0];
    return { takes: scored, recommended: best.file, why: best.reasoning };
  });

  output({
    ok: true,
    groups,
    note:
      "Scores are heuristics, not verdicts. Confirm the recommended take with `ripple candidates` " +
      "(three signals) before locking it into edit.json, and record the reasoning there.",
  });
}
