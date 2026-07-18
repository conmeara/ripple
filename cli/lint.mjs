import { existsSync } from "node:fs";
import { lintManifest } from "./cut-safety.mjs";
import { fail, output, parseArgs } from "./util.mjs";

// The pre-render gate: cut-safety checks across every scene, from cached
// perception only. Exists because flags caught at lock time kept re-breaking
// later — a scene re-scoped by hand after candidates ran carried a fresh
// DEAD_AIR_TAIL nobody re-checked, and the render shipped it. lint re-judges
// the WHOLE manifest in milliseconds, so a file-write hook can run it on
// every edit.json save: no ffmpeg, no whisper, no writes, ever.
export async function main(argv) {
  const args = parseArgs(argv, {
    scene: "string", "analysis-dir": "string", "max-tail": "number", "max-lead": "number",
  });
  const manifestPath = args._[0] ?? "edit.json";
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}. Run /ripple plan first.`, 2);

  let result;
  try {
    result = lintManifest(manifestPath, {
      scene: args.scene,
      analysisDir: args["analysis-dir"],
      maxTail: args["max-tail"],
      maxLead: args["max-lead"],
    });
  } catch (e) {
    fail(`Manifest unreadable: ${e.message}`, 2);
  }
  if (args.scene && result.scenes.length === 0) fail(`--scene matched nothing (${args.scene})`, 2);

  const { findings, scenes, endpoints } = result;
  const blocked = findings.filter((f) => f.severity === "block");
  const warns = findings.filter((f) => f.severity === "warn");

  output({
    ok: blocked.length === 0,
    manifest: manifestPath,
    scenes,
    // The endpoint result rendered as data, one row per scene: lastWordEnd,
    // tailGap, verdict. Scan this to pick where to zoom (timeline-sheet
    // --around) or verify (candidates --start --end).
    endpoints,
    findings,
    summary: { block: blocked.length, warn: warns.length },
    ...(blocked.length
      ? {
          hint: "Block findings stop the render: inspect and re-scope the cut with ripple candidates, then run ripple lint again.",
        }
      : findings.length === 0
        ? { hint: "next: ripple cut" }
        : {}),
  });
  if (blocked.length) process.exit(1);
}
