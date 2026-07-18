#!/usr/bin/env node
// PostToolUse hook: cut-safety checks run the moment the agent writes an edit
// manifest, so findings surface into the loop without the agent choosing to
// look. Two laws bound every path through this file:
//   - Fail-open. Broken stdin, an unreadable manifest, or missing checks
//     — nothing here may cost the agent its write. Every exit is 0; failure
//     is a one-line stdout note (the host's debug log), never a hook error.
//   - Never block. Ripple's flags block LOCKING, not editing — findings
//     enter context via additionalContext, never decision:block, so the
//     agent stays free to keep shaping the manifest.
// lintManifest reads cached perception only (never analyzes): the hook must
// stay milliseconds-cheap, or it gets removed within a day.
// Both hosts feed it: Claude Code sends Write/Edit with tool_input.file_path;
// Codex file edits arrive as an apply_patch envelope. The plugin root comes
// from this script's own location — never from PATH or a registered command.
import { readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_SHOWN = 3;

// Exit-0 plain stdout lands in the host's debug log, not the transcript —
// the fail-open channel.
function note(line) {
  process.stdout.write(`ripple lint hook: ${line} (fail-open)\n`);
}

function emit(context) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context },
      suppressOutput: true,
    })}\n`
  );
}

async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

// Claude's Write/Edit names the file directly; Codex file edits arrive as an
// apply_patch envelope whose Add/Update lines name every touched path.
function candidatePaths(event) {
  const input = event.tool_input ?? {};
  if (typeof input.file_path === "string") return [input.file_path];
  const patch = [input.command, input.patch].find(
    (v) => typeof v === "string" && v.includes("*** Begin Patch")
  );
  if (!patch) return [];
  return [...patch.matchAll(/^\*\*\* (?:Add|Update) File: (.+)$/gm)].map((m) => m[1].trim());
}

// A manifest by name (edit.json), or by content for any other .json: the two
// fields schemas/edit.schema.json requires — version plus scenes[]. Anything
// else is someone else's file and gets total silence.
function isManifest(path) {
  if (basename(path) === "edit.json") return true;
  if (extname(path) !== ".json") return false;
  try {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    return doc !== null && typeof doc === "object" && "version" in doc && Array.isArray(doc.scenes);
  } catch {
    return false;
  }
}

// Compact by contract: counts, the first few finding codes, and the pointer
// to the full report — enough to act on, cheap enough
// to inject on every save.
function summarize(manifestPath, findings) {
  const block = findings.filter((f) => f.severity === "block").length;
  const lines = [
    `ripple lint — ${manifestPath}: ${block} block, ${findings.length - block} warn`,
  ];
  for (const f of findings.slice(0, MAX_SHOWN)) {
    const detail = f.detail.length > 200 ? `${f.detail.slice(0, 197)}...` : f.detail;
    lines.push(`  [${f.code}] ${f.scene}: ${detail}`);
  }
  if (findings.length > MAX_SHOWN) lines.push(`  ...and ${findings.length - MAX_SHOWN} more`);
  lines.push(
    "Flags block locking, not editing — run `ripple lint` for the full report, then inspect and re-scope the affected cut."
  );
  return lines.join("\n");
}

async function main() {
  let event;
  try {
    event = JSON.parse(await readStdin());
  } catch {
    return note("event on stdin was not JSON — skipped");
  }
  if (event === null || typeof event !== "object") return note("event was not an object — skipped");
  const cwd = typeof event.cwd === "string" ? event.cwd : process.cwd();
  const manifests = candidatePaths(event)
    .map((p) => resolve(cwd, p))
    .filter(isManifest);
  if (manifests.length === 0) return; // not a manifest write: stay silent

  let lintManifest;
  try {
    ({ lintManifest } = await import(pathToFileURL(join(PLUGIN_ROOT, "cli", "cut-safety.mjs")).href));
  } catch (e) {
    return note(`cut-safety checks unavailable (${e.message}) — skipped`);
  }

  const contexts = [];
  const notes = [];
  for (const manifest of manifests) {
    try {
      const { findings } = lintManifest(manifest);
      if (findings.length) contexts.push(summarize(manifest, findings));
    } catch (e) {
      notes.push(`lint failed for ${manifest} (${e.message}) — skipped`);
    }
  }
  // One payload on stdout, ever: mixing a note into a JSON emission would
  // un-parse the JSON and drop the findings.
  if (contexts.length) return emit(contexts.join("\n\n"));
  if (notes.length) return note(notes.join("; "));
}

try {
  await main();
} catch (e) {
  note(`unexpected failure (${e?.message ?? e}) — skipped`);
}
