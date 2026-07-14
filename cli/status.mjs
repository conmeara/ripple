import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { clipName } from "./cut.mjs";
import { lintManifest, parseFrontMatter } from "./rules.mjs";
import { listSnapshots } from "./snapshot.mjs";
import { findMedia } from "./sources.mjs";
import { fail, fileStamp, output, parseArgs, readJsonOrNull, round3 } from "./util.mjs";

// git-status for the edit: ONE call answers "where am I" — footage and its
// perception state, the manifest and its outstanding findings, render
// freshness, the last QA verdict, the undo stack — and names the next most
// useful command. Reads cached facts only: no ffprobe, no whisper, no
// renders, no writes. The skill's context gate (skills/ripple/scripts/
// context.mjs) sources its facts from gatherStatus, so a probe must never
// exist in two versions.

// Manifest resolution mirrors the skill's context gate: edit.json at the
// project root, then the work/ variant. Null when neither exists — the
// caller decides whether that degrades (status) or directs (plan).
export function resolveManifestPath(root) {
  for (const p of [join(root, "edit.json"), join(root, "work", "edit.json")]) {
    if (existsSync(p)) return p;
  }
  return null;
}

// Parse errors propagate: an unreadable manifest is a degraded fact for
// status but a MANIFEST_UNREADABLE directive for the context gate, and both
// need the parser's own message.
export function summarizeManifest(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  return {
    path: manifestPath,
    sceneCount: scenes.length,
    colorPolicy: manifest.color?.policy ?? "unset",
    statuses: scenes.reduce((acc, s) => {
      const k = s.status ?? "unknown";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    scenes: scenes.map((s) => ({
      slug: s.slug ?? null,
      source: s.source ?? null,
      duration:
        typeof s.start === "number" && typeof s.end === "number" && s.end > s.start
          ? round3(s.end - s.start)
          : null,
      status: s.status ?? "unknown",
    })),
    manifest,
  };
}

export function videoMdStatus(root) {
  const path = join(root, "VIDEO.md");
  if (!existsSync(path)) return { present: false, path: null, rulesBlock: false };
  // An unreadable VIDEO.md (a misperm'd checkout) is a degraded fact —
  // gatherStatus runs before every command and must never crash on it.
  try {
    const fm = parseFrontMatter(readFileSync(path, "utf8"));
    return { present: true, path, rulesBlock: Boolean(fm.rules && typeof fm.rules === "object") };
  } catch {
    return { present: true, path, rulesBlock: false };
  }
}

// Cached facts only: duration/word/suspect counts come from the perception
// index, never a fresh probe — status on a 50-clip bin must stay instant
// and must not require ffprobe at all. An unindexed source therefore shows
// duration null; that gap IS the "run analyze" signal.
export function sourcesStatus(root, { analysisDir } = {}) {
  const dirs = [...new Set([analysisDir, join(root, "work", "analysis")].filter(Boolean))];
  const list = findMedia(root).map((file) => {
    let index = null;
    try {
      const stem = `${basename(file, extname(file))}_${fileStamp(file)}`;
      for (const dir of dirs) {
        index = readJsonOrNull(join(dir, `${stem}.analysis.json`));
        if (index) break;
      }
    } catch {
      // An unreadable file cannot be stamped — report it unindexed, never crash.
    }
    if (!index) return { file, indexed: false, duration: null };
    const suspect = (index.words ?? []).filter((w) => w.suspect).length;
    return {
      file,
      indexed: true,
      duration: index.duration ?? null,
      words: index.words ? index.words.length : null,
      ...(suspect ? { suspectWords: suspect } : {}),
    };
  });
  return {
    count: list.length,
    indexed: list.filter((s) => s.indexed).length,
    unindexed: list.filter((s) => !s.indexed).length,
    list,
  };
}

// qa writes trend snapshots to .ripple/qa under its cwd (review reads them
// from the manifest's dir) — check the given dirs in order, first hit wins.
export function qaStatus(dirs) {
  for (const qaDir of dirs) {
    if (!existsSync(qaDir)) continue;
    let files;
    try {
      files = readdirSync(qaDir).filter((f) => f.startsWith("qa-") && f.endsWith(".json")).sort();
    } catch {
      continue; // unreadable qa dir: no runs to report, never a crash
    }
    if (!files.length) continue;
    const snap = readJsonOrNull(join(qaDir, files[files.length - 1]));
    return {
      runs: files.length,
      latest: snap
        ? { passed: snap.passed, total: snap.total, when: snap.timestamp ?? null, ok: snap.passed === snap.total }
        : null,
    };
  }
  return { runs: 0, latest: null };
}

export function historyStatus(historyDir) {
  let snapshots;
  try {
    snapshots = listSnapshots(historyDir);
  } catch {
    snapshots = []; // unreadable history dir degrades to zero snapshots
  }
  const latest = snapshots[snapshots.length - 1] ?? null;
  return {
    count: snapshots.length,
    latest: latest ? { label: latest.label, savedAt: latest.savedAt ?? null } : null,
  };
}

// Freshness is mtime-based: a clip or final older than edit.json renders a
// PREVIOUS cut (the same trap qa's staleNote names). A missing final counts
// as stale for the verdict — there is nothing current to QA.
export function rendersStatus(manifestPath, scenes) {
  const baseDir = dirname(resolve(manifestPath));
  // Never trust an existence check to hold through the stat: a dangling
  // symlink in outputs/ (render moved, target cleaned up) or a concurrent
  // delete must degrade to "not a render", not crash the never-throws
  // gatherStatus contract every command's context gate depends on.
  const mtimeOf = (p) => {
    try {
      return statSync(p).mtimeMs;
    } catch {
      return null;
    }
  };
  const manifestMtime = mtimeOf(manifestPath) ?? 0;
  const clipsDir = join(baseDir, "clips");
  const expected = (Array.isArray(scenes) ? scenes : []).map((s) => clipName(s));
  let rendered = 0;
  let stale = 0;
  for (const name of expected) {
    const m = mtimeOf(join(clipsDir, name));
    if (m === null) continue;
    rendered++;
    if (m < manifestMtime) stale++;
  }
  const outputsDir = join(baseDir, "outputs");
  let final = null;
  if (existsSync(outputsDir)) {
    let names = [];
    try {
      names = readdirSync(outputsDir);
    } catch {
      // unreadable outputs dir: no final to report
    }
    const newest = names
      .filter((f) => /\.(mp4|mov|webm)$/i.test(f))
      .map((f) => ({ file: join(outputsDir, f), mtimeMs: mtimeOf(join(outputsDir, f)) }))
      .filter((e) => e.mtimeMs !== null)
      .sort((a, b) => a.mtimeMs - b.mtimeMs)
      .pop();
    if (newest) {
      final = {
        file: newest.file,
        when: new Date(newest.mtimeMs).toISOString(),
        stale: newest.mtimeMs < manifestMtime,
      };
    }
  }
  return { clipsDir, expected: expected.length, rendered, missing: expected.length - rendered, stale, final };
}

// The skill's routing philosophy as one line: name the next most useful
// command, in the order work actually flows — standing direction, footage,
// perception, plan, gates, render, delivery.
export function computeVerdict({ videoMd, sources, manifestPath, manifestError, findings, renders, qa }) {
  if (!videoMd.present) {
    return {
      next: "init",
      verdict: "No VIDEO.md — interview the user and set standing direction (skill reference/init.md) before editing.",
    };
  }
  if (sources.count === 0) {
    return { next: "sources", verdict: "No footage found — add source media, then ripple analyze each file." };
  }
  if (sources.unindexed > 0) {
    return {
      next: "analyze",
      verdict: `${sources.unindexed} source(s) have no perception index — run ripple analyze on each before planning.`,
    };
  }
  if (manifestError) {
    return { next: "plan", verdict: `edit.json exists but does not parse (${manifestError}) — fix or regenerate it before editing.` };
  }
  if (!manifestPath) {
    return { next: "plan", verdict: "Footage indexed but no edit.json — plan the edit (/ripple plan)." };
  }
  if (findings && findings.block > 0) {
    return {
      next: "lint",
      verdict: `${findings.block} block finding(s) outstanding — ripple lint, then re-scope (ripple candidates) or waive with a written reason.`,
    };
  }
  if (renders && (renders.missing > 0 || renders.stale > 0 || !renders.final || renders.final.stale)) {
    return { next: "cut", verdict: "Renders are missing or older than edit.json — run ripple cut." };
  }
  if (qa.latest && !qa.latest.ok) {
    return {
      next: "qa",
      verdict: `Last QA failed (${qa.latest.passed}/${qa.latest.total}) — fix the failing gates and re-run ripple qa.`,
    };
  }
  return { next: "qa", verdict: "Cut is clean and renders are current — ripple qa the final, then ripple review." };
}

// Every fact, one pass, no side effects. Never throws on project state and
// never exits — the context gate runs this at the start of every command,
// so a broken manifest or missing index must degrade into facts.
export function gatherStatus(root, { manifestPath = resolveManifestPath(root), analysisDir } = {}) {
  const effAnalysisDir = analysisDir ?? join(root, "work", "analysis");
  const videoMd = videoMdStatus(root);
  const sources = sourcesStatus(root, { analysisDir: effAnalysisDir });

  let manifestFacts = null;
  let manifestError = null;
  if (manifestPath && existsSync(manifestPath)) {
    try {
      manifestFacts = summarizeManifest(manifestPath);
    } catch (e) {
      manifestError = e.message;
    }
  } else {
    manifestPath = null;
  }

  let findings = null;
  if (manifestFacts) {
    try {
      const lint = lintManifest(manifestPath, {
        analysisDir: effAnalysisDir,
        ...(videoMd.path ? { videoMd: videoMd.path } : {}),
      });
      findings = {
        block: lint.findings.filter((f) => f.severity === "block" && !f.waived).length,
        warn: lint.findings.filter((f) => f.severity === "warn" && !f.waived).length,
        waived: lint.findings.filter((f) => f.waived).length,
      };
    } catch {
      // Lint facts degrade to null; status itself must never fail on them.
    }
  }

  const renders = manifestFacts ? rendersStatus(manifestPath, manifestFacts.manifest.scenes) : null;
  const baseDir = manifestPath ? dirname(resolve(manifestPath)) : resolve(root);
  const qa = qaStatus([join(baseDir, ".ripple", "qa"), join(resolve(root), ".ripple", "qa")]);
  const history = historyStatus(join(baseDir, ".ripple", "history"));
  const { next, verdict } = computeVerdict({ videoMd, sources, manifestPath, manifestError, findings, renders, qa });

  return {
    root,
    videoMd,
    sources,
    manifestPath,
    manifest: manifestFacts
      ? {
          path: manifestPath,
          sceneCount: manifestFacts.sceneCount,
          colorPolicy: manifestFacts.colorPolicy,
          statuses: manifestFacts.statuses,
          scenes: manifestFacts.scenes,
        }
      : manifestError
        ? { path: manifestPath, error: `unreadable: ${manifestError}` }
        : null,
    manifestError,
    findings,
    renders,
    qa,
    history,
    next,
    verdict,
  };
}

export async function main(argv) {
  const args = parseArgs(argv, { manifest: "string", "analysis-dir": "string" });
  const root = args._[0] ?? process.cwd();
  if (!existsSync(root)) fail(`Directory not found: ${root}`, 2);
  // An explicit --manifest that doesn't exist is a usage error; a missing
  // DEFAULT manifest is a project fact the verdict routes on.
  if (args.manifest && !existsSync(args.manifest)) fail(`Manifest not found: ${args.manifest}`, 2);

  const status = gatherStatus(root, {
    ...(args.manifest ? { manifestPath: args.manifest } : {}),
    analysisDir: args["analysis-dir"],
  });

  const { manifestPath, manifestError, ...facts } = status;
  output({ ok: true, ...facts });
}
