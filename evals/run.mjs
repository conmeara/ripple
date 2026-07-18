#!/usr/bin/env node
// Ripple plugin eval runner.
//
//   node evals/run.mjs                 run every case
//   node evals/run.mjs --only 30,35    run selected cases (id prefix match)
//   node evals/run.mjs --list          list cases
//
// Env: RIPPLE_EVAL_FOOTAGE  dir with sample footage (default ~/Projects/Groom-Video)
//
// Results land in evals/runs/<timestamp>/ (gitignored): per-case workspace,
// agent transcript, final message, result.json, plus a run-level summary.
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from './lib/checks.mjs';
import { invokeClaude, invokeCodex, ensureCodexPlugin } from './lib/agents.mjs';

const EVALS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(EVALS);
const FOOTAGE = process.env.RIPPLE_EVAL_FOOTAGE || path.join(os.homedir(), 'Projects', 'Groom-Video');
const CACHE = path.join(os.homedir(), '.ripple', 'eval-cache');
const FIXTURES = path.join(EVALS, 'fixtures');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? true) : undefined;
};

function loadCases() {
  const dir = path.join(EVALS, 'cases');
  let cases = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
  const only = flag('only');
  if (typeof only === 'string') {
    const wanted = only.split(',');
    cases = cases.filter(c => wanted.some(w => c.id.startsWith(w) || c.file.startsWith(w)));
  }
  return cases;
}

function expand(str) {
  return str
    .replaceAll('$FOOTAGE', FOOTAGE)
    .replaceAll('$CACHE', CACHE)
    .replaceAll('$FIXTURES', FIXTURES)
    .replaceAll('$ROOT', ROOT);
}

// Every fixture is cut from the one stable master (IMG_E1223.MOV) into
// ~/.ripple/eval-cache, so evals never depend on a live project's derived
// files. Ranges come from the original Groom-Video edit.json.
const FIXTURE_CUTS = [
  { name: 'loose_married.mp4', ss: 750, t: 33, note: 'raw take: slate + dead air, full answer, throat-clear tail' },
  { name: 'howmet.mp4', ss: 209, t: 24.3, note: 'trimmed answer: "…she showed up" (Bumble story)' },
  { name: 'married.mp4', ss: 757, t: 22.0, note: 'trimmed answer: "…just a bonus"' },
  // Whisper drift only shows on LONG sources — audio is copied bit-exact
  // (drift is an audio/whisper phenomenon), video downscaled to keep the
  // fixture ~130MB instead of 1.2GB.
  {
    name: 'long_qanda.mp4', ss: 56, t: 444,
    note: 'long source (7.4 min, q1–q7): reproduces whisper timestamp drift',
    args: ['-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'copy'],
  },
];

function prepFixtures() {
  fs.mkdirSync(CACHE, { recursive: true });
  const missing = FIXTURE_CUTS.filter(f => !fs.existsSync(path.join(CACHE, f.name)));
  if (!missing.length) return;
  const master = path.join(FOOTAGE, 'IMG_E1223.MOV');
  if (!fs.existsSync(master)) {
    console.error(`Master footage not found: ${master} (set RIPPLE_EVAL_FOOTAGE)\nNeeded to build: ${missing.map(f => f.name).join(', ')}`);
    process.exit(2);
  }
  for (const f of missing) {
    console.log(`building fixture: ${f.name} — ${f.note}`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(f.ss), '-i', master, '-t', String(f.t), ...(f.args ?? ['-c', 'copy']), path.join(CACHE, f.name)]);
  }
}

// A bare `ripple` on PATH may be a stale installed plugin's bin; shim it to
// the working-tree CLI so every agent (and setup command) tests HEAD.
function makeShim(runRoot) {
  const dir = path.join(runRoot, 'bin');
  fs.mkdirSync(dir, { recursive: true });
  const shim = path.join(dir, 'ripple');
  fs.writeFileSync(shim, `#!/bin/sh\nexec node "${path.join(ROOT, 'cli', 'index.mjs')}" "$@"\n`);
  fs.chmodSync(shim, 0o755);
  return dir;
}

// The ablation knob's "router" rung: the plugin with SKILL.md truncated to its
// header — frontmatter, the three ideas, setup, the arc — with every craft
// section (## Taste onward) stripped, so C−B measures the header and D−C the
// craft sections.
function makeRouterPlugin(runRoot) {
  // Outside the repo: cpSync refuses a destination inside its own source tree.
  const dest = path.join(os.tmpdir(), `ripple-router-plugin-${path.basename(runRoot)}`);
  if (fs.existsSync(dest)) return dest;
  const skipTop = new Set(['evals', 'node_modules', '.git', 'docs', 'runs']);
  fs.cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(ROOT, src);
      if (!rel || rel.startsWith('..')) return true;
      if (skipTop.has(rel.split(path.sep)[0])) return false;
      return true;
    },
  });
  const skillPath = path.join(dest, 'skills', 'ripple', 'SKILL.md');
  const full = fs.readFileSync(skillPath, 'utf8');
  const firstSection = full.indexOf('\n## ');
  if (firstSection !== -1) fs.writeFileSync(skillPath, full.slice(0, firstSection + 1));
  return dest;
}

async function runCase(c, runRoot, shimDir) {
  const caseDir = path.join(runRoot, c.id);
  const ws = path.join(caseDir, 'ws');
  fs.mkdirSync(ws, { recursive: true });
  const transcriptPath = path.join(caseDir, 'transcript.jsonl');
  const finalPath = path.join(caseDir, 'final.txt');
  const timeoutMs = (c.timeoutMinutes ?? 20) * 60_000;

  for (const fx of c.fixtures ?? []) {
    const from = expand(fx.from);
    const to = path.join(ws, fx.to);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  for (const cmd of c.setup ?? []) {
    execSync(expand(cmd), {
      cwd: ws, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, RIPPLE: `node ${path.join(ROOT, 'cli', 'index.mjs')}`, FOOTAGE, CACHE, FIXTURES },
      timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024,
    });
  }

  // skill: none|router|full (claude only) — the ablation knob.
  // bareCli: true removes the ripple shim from the agent's PATH (rung A).
  const skill = c.skill ?? 'full';
  const agentShim = c.bareCli ? null : shimDir;
  let agentResult = { agent: 'none' };
  const started = Date.now();
  if (c.agent === 'claude') {
    const routerDir = skill === 'router' ? makeRouterPlugin(runRoot) : undefined;
    agentResult = await invokeClaude({ prompt: c.prompt, model: c.model, ws, root: ROOT, transcriptPath, finalPath, timeoutMs, shimDir: agentShim, skill, routerDir });
  } else if (c.agent === 'codex') {
    if (skill !== 'full') throw new Error(`skill "${skill}" is claude-only — codex loads its plugin globally`);
    agentResult = await invokeCodex({ prompt: c.prompt, model: c.model, ws, transcriptPath, finalPath, timeoutMs, shimDir: agentShim });
  }
  const agentSeconds = Math.round((Date.now() - started) / 1000);

  const ctx = { ws, root: ROOT, transcriptPath, finalPath };
  const checks = (c.checks ?? []).map(ch => runCheck(ctx, ch));
  const pass = checks.every(ch => ch.pass) && !agentResult.timedOut;
  const result = {
    id: c.id, title: c.title, agent: c.agent, model: agentResult.model ?? c.model ?? null,
    skill: c.agent === 'claude' ? skill : undefined, bareCli: c.bareCli ?? false,
    baseline: c.baseline ?? false, pass, agentSeconds, timedOut: agentResult.timedOut ?? false,
    tokens: extractUsage(transcriptPath, c.agent), checks,
  };
  fs.writeFileSync(path.join(caseDir, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}

// Token usage from the agent transcript. Codex reports cumulative session
// usage on each turn.completed (take the last); Claude reports it once in the
// final "result" event. "uncachedIn" is the tokens actually processed fresh.
function extractUsage(transcriptPath, agent) {
  if (!fs.existsSync(transcriptPath)) return null;
  let usage = null;
  for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (agent === 'codex' && ev.type === 'turn.completed' && ev.usage) {
      usage = {
        uncachedIn: (ev.usage.input_tokens ?? 0) - (ev.usage.cached_input_tokens ?? 0),
        cachedIn: ev.usage.cached_input_tokens ?? 0,
        out: ev.usage.output_tokens ?? 0,
      };
    } else if (agent === 'claude' && ev.type === 'result' && ev.usage) {
      usage = {
        uncachedIn: (ev.usage.input_tokens ?? 0) + (ev.usage.cache_creation_input_tokens ?? 0),
        cachedIn: ev.usage.cache_read_input_tokens ?? 0,
        out: ev.usage.output_tokens ?? 0,
        costUsd: ev.total_cost_usd,
      };
    }
  }
  return usage;
}

function fmtTokens(t) {
  if (!t) return '—';
  const k = n => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
  return `${k(t.uncachedIn)} in / ${k(t.out)} out${t.costUsd != null ? ` ($${t.costUsd.toFixed(2)})` : ''}`;
}

function summarize(results, runRoot) {
  const scored = results.filter(r => !r.baseline);
  const passed = scored.filter(r => r.pass).length;
  const lines = [];
  lines.push(`# Ripple eval run — ${path.basename(runRoot)}`, '');
  lines.push(`**${passed}/${scored.length} scored cases passed** (baselines excluded)`, '');
  lines.push('| case | agent | result | checks | time | tokens (fresh in / out) |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const ok = r.checks.filter(c => c.pass).length;
    const label = r.baseline ? ' (baseline)' : '';
    lines.push(`| ${r.id}${label} | ${r.agent}${r.model && r.agent !== 'none' ? `/${r.model}` : ''} | ${r.pass ? 'PASS' : 'FAIL'}${r.timedOut ? ' (timeout)' : ''} | ${ok}/${r.checks.length} | ${r.agentSeconds ?? 0}s | ${fmtTokens(r.tokens)} |`);
  }
  // Ablation rungs side by side: what is each layer worth?
  const abl = results.filter(r => /-ablation-/.test(r.id));
  if (abl.length) {
    lines.push('', '## Ablation rungs (same task, increasing layers)', '');
    lines.push('| rung | layer | result | checks | time | tokens (fresh in / out) |');
    lines.push('|---|---|---|---|---|---|');
    const layer = r => r.bareCli ? 'bare agent + ffmpeg' : r.skill === 'none' ? 'CLI, no skill' : r.skill === 'router' ? 'CLI + router' : 'full plugin';
    for (const r of abl) {
      lines.push(`| ${r.id.replace(/^.*-ablation-/, '')} | ${layer(r)} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.checks.filter(c => c.pass).length}/${r.checks.length} | ${r.agentSeconds ?? 0}s | ${fmtTokens(r.tokens)} |`);
    }
  }
  lines.push('', '## Failing checks', '');
  let anyFail = false;
  for (const r of results) {
    for (const ch of r.checks.filter(c => !c.pass)) {
      anyFail = true;
      lines.push(`- **${r.id}** › ${ch.id}: ${ch.detail}`);
    }
  }
  if (!anyFail) lines.push('(none)');
  const md = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(runRoot, 'summary.md'), md);
  fs.writeFileSync(path.join(runRoot, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n' + md);
  return passed === scored.length;
}

async function main() {
  const cases = loadCases();
  if (flag('list')) {
    for (const c of cases) console.log(`${c.id}\t${c.agent}${c.model ? '/' + c.model : ''}\t${c.title}`);
    return;
  }
  prepFixtures();
  if (cases.some(c => c.agent === 'codex')) {
    console.log('codex plugin:', ensureCodexPlugin(EVALS));
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runRoot = path.join(EVALS, 'runs', stamp);
  fs.mkdirSync(runRoot, { recursive: true });
  const shimDir = makeShim(runRoot);
  console.log(`run: ${runRoot}\ncases: ${cases.map(c => c.id).join(', ')}\n`);

  const results = [];
  for (const c of cases) {
    process.stdout.write(`▶ ${c.id} (${c.agent}${c.model ? '/' + c.model : ''}) ... `);
    try {
      const r = await runCase(c, runRoot, shimDir);
      results.push(r);
      console.log(r.pass ? 'PASS' : 'FAIL', `(${r.checks.filter(x => x.pass).length}/${r.checks.length} checks, ${r.agentSeconds}s)`);
    } catch (e) {
      results.push({ id: c.id, title: c.title, agent: c.agent, baseline: c.baseline ?? false, pass: false, checks: [{ id: 'runner', pass: false, detail: e.message }] });
      console.log('ERROR', e.message);
    }
  }
  const allPass = summarize(results, runRoot);
  process.exit(allPass ? 0 : 1);
}

main();
