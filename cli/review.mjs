import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { resolveManifestPath } from "./status.mjs";
import { ensureDir, fail, output, parseArgs, round3 } from "./util.mjs";

// Internal module: surfaced as `ripple qa --report` (the review page is a QA
// artifact). Not registered as its own command.

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function img(outDir, path, alt) {
  return `<figure><img src="${esc(relative(outDir, path))}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>`;
}

export function qaCheckStatus(check) {
  return check.status ?? (check.skipped ? "not-verified" : check.ok ? "pass" : "fail");
}

export function qaSnapshotStatus(snapshot) {
  const explicit = snapshot && ["status", "ok", "verified"].every((key) => Object.hasOwn(snapshot, key));
  if (!explicit) return "not-verified";
  if (snapshot.status === "pass" && snapshot.ok === true && snapshot.verified === true) return "pass";
  if (snapshot.status === "fail" || snapshot.ok === false) return "fail";
  return "not-verified";
}

export function reviewManifestPath(explicit, cwd = process.cwd()) {
  return explicit ?? resolveManifestPath(cwd);
}

export function readQaSnapshotEntries(qaDir, limit = 5) {
  const files = readdirSync(qaDir)
    .filter((file) => /^qa-.*\.json$/.test(file))
    .sort();
  const entries = [];
  const unreadable = [];
  for (const file of files) {
    const snapshotPath = join(qaDir, file);
    try {
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new TypeError("snapshot root must be an object");
      }
      entries.push({ file, snapshotPath, snapshot });
    } catch {
      unreadable.push({ file, snapshotPath });
    }
  }
  return {
    entries: entries.slice(-limit),
    unreadable,
    newestCandidate: files.at(-1) ?? null,
  };
}

// A review badge is a statement about the current manifest and current
// render, not merely the newest JSON filename. Any broken identity/freshness
// link downgrades the badge to NOT VERIFIED while preserving the historical
// check rows as evidence.
export function qaSnapshotEvidence(snapshot, { snapshotPath, manifestPath, currentRender }) {
  if (!snapshot) return { status: null, detail: "no QA snapshot" };
  const issues = [];
  const rawStatus = qaSnapshotStatus(snapshot);
  if (rawStatus === "pass" && !(snapshot.status === "pass" && snapshot.ok === true && snapshot.verified === true)) {
    issues.push("snapshot lacks explicit verified PASS fields");
  }

  const baseDir = dirname(resolve(manifestPath));
  const expectedManifest = resolve(manifestPath);
  const recordedManifest = snapshot.manifest ? resolve(baseDir, snapshot.manifest) : null;
  if (recordedManifest !== expectedManifest) {
    issues.push(`snapshot manifest ${snapshot.manifest ?? "(missing)"} does not match the review manifest`);
  }

  const recordedRender = snapshot.file ? resolve(baseDir, snapshot.file) : null;
  if (!recordedRender || !existsSync(recordedRender)) {
    issues.push(`snapshot render ${snapshot.file ?? "(missing)"} does not exist`);
  }
  if (!currentRender) {
    issues.push("no current render exists in outputs/");
  } else if (recordedRender !== resolve(currentRender)) {
    issues.push(`snapshot target ${snapshot.file ?? "(missing)"} is not the latest render ${relative(baseDir, currentRender)}`);
  }

  if (!snapshotPath || !existsSync(snapshotPath)) {
    issues.push("QA snapshot file is missing");
  } else {
    const snapshotMtime = statSync(snapshotPath).mtimeMs;
    const manifestMtime = statSync(expectedManifest).mtimeMs;
    const snapshotTimestamp = Date.parse(snapshot.timestamp);
    if (!Number.isFinite(snapshotTimestamp)) issues.push("QA snapshot timestamp is missing or invalid");
    if (snapshotMtime < manifestMtime) issues.push("QA snapshot predates the manifest");
    if (Number.isFinite(snapshotTimestamp) && snapshotTimestamp < manifestMtime) issues.push("QA snapshot timestamp predates the manifest");
    if (recordedRender && existsSync(recordedRender)) {
      const renderMtime = statSync(recordedRender).mtimeMs;
      if (renderMtime < manifestMtime) issues.push("render predates the manifest");
      if (snapshotMtime < renderMtime) issues.push("QA snapshot predates the render");
      if (Number.isFinite(snapshotTimestamp) && snapshotTimestamp < renderMtime) issues.push("QA snapshot timestamp predates the render");
    }
  }

  return issues.length
    ? { status: "not-verified", detail: issues.join("; ") }
    : { status: rawStatus, detail: null };
}

export async function main(argv) {
  const args = parseArgs(argv, { manifest: "string", file: "string", out: "string", title: "string" });
  const manifestPath = reviewManifestPath(args.manifest);
  if (!manifestPath || !existsSync(manifestPath)) fail(`Manifest not found. Expected edit.json or work/edit.json; run /ripple plan first.`, 2);
  const baseDir = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const outPath = resolve(args.out ?? join(baseDir, "qa", "review.html"));
  const outDir = ensureDir(dirname(outPath));
  const title = args.title ?? manifest.title ?? "Edit review";

  // Gather artifacts.
  const candidatesDir = join(baseDir, "work", "candidates");
  const sheetsDir = join(baseDir, "qa", "frame-sheets");
  const gradesSheet = join(baseDir, "qa", "grades", "grade_contact.jpg");
  const qaDirs = [...new Set([
    join(baseDir, ".ripple", "qa"),
    join(process.cwd(), ".ripple", "qa"),
  ])];
  let snapshotEntries = [];
  let unreadableSnapshots = [];
  let newestSnapshotCandidate = null;
  for (const qaDir of qaDirs) {
    if (!existsSync(qaDir)) continue;
    const loaded = readQaSnapshotEntries(qaDir);
    if (loaded.entries.length || loaded.unreadable.length) {
      snapshotEntries = loaded.entries;
      unreadableSnapshots = loaded.unreadable;
      newestSnapshotCandidate = loaded.newestCandidate;
      break;
    }
  }
  const snapshots = snapshotEntries.map((entry) => entry.snapshot);
  const latestEntry = snapshotEntries.at(-1) ?? null;
  const latest = latestEntry?.snapshot ?? null;
  const reviewTarget = args.file
    ? resolve(args.file)
    : latest?.file
      ? resolve(baseDir, latest.file)
      : null;
  let latestEvidence = latest
    ? qaSnapshotEvidence(latest, {
        snapshotPath: latestEntry.snapshotPath,
        manifestPath,
        currentRender: reviewTarget,
      })
    : { status: null, detail: null };
  const newestSnapshotUnreadable = newestSnapshotCandidate
    && newestSnapshotCandidate !== latestEntry?.file;
  if (newestSnapshotUnreadable) {
    const detail = `newest QA snapshot ${newestSnapshotCandidate} is unreadable or incomplete`;
    latestEvidence = {
      status: "not-verified",
      detail: latestEvidence.detail ? `${latestEvidence.detail}; ${detail}` : detail,
    };
  }

  const sceneRows = (manifest.scenes ?? []).map((s) => {
    const dur = round3(s.end - s.start);
    return `<tr>
      <td class="mono">${esc(s.slug)}</td>
      <td>${esc(s.title ?? s.card ?? "")}</td>
      <td class="mono num">${s.start}</td>
      <td class="mono num">${s.end}</td>
      <td class="mono num">${dur}s</td>
      <td><span class="chip ${esc(s.status)}">${esc(s.status)}</span></td>
      <td class="dim">${esc(s.reasoning ?? "")}${s.expectEnding ? `<br><span class="mono dim">ends: “${esc(s.expectEnding)}”</span>` : ""}</td>
    </tr>`;
  }).join("\n");

  const stripFigures = (manifest.scenes ?? []).flatMap((s) => {
    const figs = [];
    for (const kind of ["head", "tail"]) {
      const p = join(candidatesDir, `${s.slug}_${kind}.jpg`);
      if (existsSync(p)) figs.push(img(outDir, p, `${s.slug} — ${kind} frames`));
    }
    return figs;
  }).join("\n");

  const sheetFigures = existsSync(sheetsDir)
    ? readdirSync(sheetsDir).filter((f) => f.endsWith(".jpg")).sort()
        .map((f) => img(outDir, join(sheetsDir, f), `frame sheet — ${f}`)).join("\n")
    : "";

  const hasQaEvidence = Boolean(latest || newestSnapshotUnreadable);
  const qaRows = hasQaEvidence
    ? [
        ...(latestEvidence.detail ? [{ id: "evidence-current", status: "not-verified", ok: null, detail: latestEvidence.detail }] : []),
        ...(latest?.checks ?? []),
      ].map((c) => {
        const state = qaCheckStatus(c);
        return `<tr><td class="mono">${esc(c.id)}</td><td><span class="chip ${state}">${state.replace("-", " ").toUpperCase()}</span></td><td class="dim">${esc(typeof c.detail === "string" ? c.detail : JSON.stringify(c.detail))}</td></tr>`;
      }).join("\n")
    : "";
  const trendLine = snapshots.map((s) => `${s.passed}/${s.total} ${qaSnapshotStatus(s)}`).join(" → ");
  const latestStatus = latestEvidence.status;
  const snapshotWarnings = unreadableSnapshots.map(({ file }) => `ignored unreadable QA snapshot ${file}`);
  const qaSummary = latest
    ? `${esc(latest.passed)}/${esc(String(latest.total))} executed checks passed${trendLine ? ` · trend: ${esc(trendLine)}` : ""}`
    : "no complete snapshot could be read";

  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ripple review</title>
<style>
  :root { color-scheme: dark; }
  body { background:#14161b; color:#e7e5df; font:15px/1.55 -apple-system,BlinkMacSystemFont,sans-serif; margin:0; }
  .wrap { max-width:1000px; margin:0 auto; padding:40px 24px 80px; }
  h1 { font-size:26px; margin:0 0 4px; } h2 { font-size:18px; margin:40px 0 12px; }
  .sub { color:#9aa0aa; margin:0 0 24px; }
  .mono { font-family:"SF Mono",ui-monospace,Menlo,monospace; font-size:12.5px; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .dim { color:#9aa0aa; font-size:13px; }
  table { border-collapse:collapse; width:100%; }
  th { text-align:left; font-size:11px; letter-spacing:.08em; color:#6b7078; padding:6px 12px 6px 0; border-bottom:1px solid #2a2e38; }
  td { padding:8px 12px 8px 0; border-bottom:1px solid #2a2e38; vertical-align:top; }
  .chip { font-family:"SF Mono",ui-monospace,monospace; font-size:10.5px; padding:1px 7px; border-radius:3px; border:1px solid; }
  .chip.locked, .chip.pass { color:#7fb069; border-color:#7fb06966; }
  .chip.proposed { color:#d9a54a; border-color:#d9a54a66; }
  .chip.repaired { color:#6a9ec9; border-color:#6a9ec966; }
  .chip.fail { color:#c97a6a; border-color:#c97a6a66; }
  .chip.not-verified, .chip.skip { color:#d9a54a; border-color:#d9a54a66; }
  figure { margin:0 0 16px; } figcaption { color:#6b7078; font-size:12px; margin-top:4px; }
  img { max-width:100%; border-radius:4px; border:1px solid #2a2e38; }
  .scroll { overflow-x:auto; }
</style>
<div class="wrap">
  <h1>${esc(title)}</h1>
  <p class="sub">Generated by <span class="mono">ripple qa --report</span> · color policy: <span class="mono">${esc(manifest.color?.policy ?? "unset")}</span>${manifest.grade?.name ? ` · grade: <span class="mono">${esc(manifest.grade.name)}</span>` : ""}</p>

  <h2>Cut list</h2>
  <div class="scroll"><table>
    <tr><th>SCENE</th><th>CARD / TITLE</th><th>IN</th><th>OUT</th><th>DUR</th><th>STATUS</th><th>REASONING</th></tr>
    ${sceneRows}
  </table></div>

  ${hasQaEvidence ? `<h2>QA — ${esc(latestStatus.replace("-", " ").toUpperCase())} <span class="dim mono">(${qaSummary})</span></h2>
  <div class="scroll"><table><tr><th>CHECK</th><th>RESULT</th><th>DETAIL</th></tr>${qaRows}</table></div>` : ""}

  ${existsSync(gradesSheet) ? `<h2>Grade variants</h2>${img(outDir, gradesSheet, "grade comparison (same frame)")}` : ""}

  ${stripFigures ? `<h2>Cut-point evidence</h2>${stripFigures}` : ""}

  ${sheetFigures ? `<h2>Frame sheets</h2>${sheetFigures}` : ""}
</div>
`;

  writeFileSync(outPath, html);
  output({
    ok: true,
    review: outPath,
    scenes: manifest.scenes?.length ?? 0,
    qaStatus: latestStatus,
    qaFile: reviewTarget,
    qaTrend: trendLine || null,
    ...(snapshotWarnings.length ? { qaSnapshotWarnings: snapshotWarnings } : {}),
    next: `Open it: open "${outPath}" — flag problems by scene slug; repairs stay localized.`,
  });
}
