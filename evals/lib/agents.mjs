// Headless agent invocation for eval cases.
// - claude: Claude Code with the working-tree plugin loaded via --plugin-dir
// - codex:  Codex CLI with the plugin installed from evals/codex/marketplace.json
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_MODEL = /fable/i;

function run(cmd, args, { cwd, timeoutMs, stdoutFile, env }) {
  return new Promise((resolve) => {
    const out = fs.createWriteStream(stdoutFile);
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: env ?? process.env });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    let stderr = '';
    child.stdout.pipe(out);
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, timedOut: signal === 'SIGKILL', stderr: stderr.slice(-4000) });
    });
  });
}

// Prepend the run's shim dir so a bare `ripple` always resolves to the
// working-tree CLI (a stale installed plugin's bin can otherwise shadow it).
function shimEnv(shimDir) {
  return shimDir ? { ...process.env, PATH: `${shimDir}:${process.env.PATH}` } : process.env;
}

// skill: 'full' loads the working-tree plugin, 'router' loads a stripped copy
// (SKILL.md truncated to its header, craft sections stripped), 'none' loads no plugin at all —
// the ablation knob that measures what each layer is worth.
export async function invokeClaude({ prompt, model, ws, root, transcriptPath, finalPath, timeoutMs, shimDir, skill = 'full', routerDir }) {
  const m = model || 'sonnet';
  if (FORBIDDEN_MODEL.test(m)) throw new Error(`model "${m}" is not allowed for evals`);
  const pluginDir = skill === 'full' ? root : skill === 'router' ? routerDir : null;
  if (skill === 'router' && !routerDir) throw new Error('skill "router" requires a routerDir');
  const args = [
    '-p', prompt,
    '--model', m,
    ...(pluginDir ? ['--plugin-dir', pluginDir] : []),
    '--dangerously-skip-permissions',
    '--output-format', 'stream-json',
    '--verbose',
  ];
  const res = await run('claude', args, { cwd: ws, timeoutMs, stdoutFile: transcriptPath, env: shimEnv(shimDir) });
  // Final message is the "result" event in the stream.
  let finalText = '';
  try {
    for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.type === 'result' && typeof ev.result === 'string') finalText = ev.result;
      } catch { /* partial line */ }
    }
  } catch { /* no transcript */ }
  fs.writeFileSync(finalPath, finalText);
  return { ...res, agent: 'claude', model: m };
}

export async function invokeCodex({ prompt, model, ws, transcriptPath, finalPath, timeoutMs, shimDir }) {
  // The account default may need a newer CLI than installed; gpt-5.5 works
  // broadly on ChatGPT-auth Codex. Override with RIPPLE_EVAL_CODEX_MODEL.
  model = model || process.env.RIPPLE_EVAL_CODEX_MODEL || 'gpt-5.5';
  if (model && FORBIDDEN_MODEL.test(model)) throw new Error(`model "${model}" is not allowed for evals`);
  const args = [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '--dangerously-bypass-hook-trust',
    '--skip-git-repo-check',
    '--disable', 'memories',
    '--json',
    '-o', finalPath,
    ...(model ? ['-m', model] : []),
    prompt,
  ];
  const res = await run('codex', args, { cwd: ws, timeoutMs, stdoutFile: transcriptPath, env: shimEnv(shimDir) });
  if (!fs.existsSync(finalPath)) fs.writeFileSync(finalPath, '');
  return { ...res, agent: 'codex', model: model || '(default)' };
}

// (Re)install the ripple plugin for Codex from the local working tree.
// Codex snapshots the plugin into its cache at install time, so reinstall
// on every run to make sure evals test HEAD, not a stale snapshot.
export function ensureCodexPlugin(evalsDir) {
  // Codex resolves a local plugin's path relative to the marketplace root and
  // won't escape it, so link the repo in from inside evals/codex/. Made at
  // runtime rather than committed — a symlink to the repo root confuses
  // tools that walk the tree.
  const link = path.join(evalsDir, 'codex', 'ripple');
  if (!fs.existsSync(link)) fs.symlinkSync('../..', link);
  let markets = '';
  try { markets = execFileSync('codex', ['plugin', 'marketplace', 'list'], { encoding: 'utf8' }); } catch { /* fallthrough */ }
  if (!/ripple-local/.test(markets)) {
    execFileSync('codex', ['plugin', 'marketplace', 'add', path.join(evalsDir, 'codex')], { encoding: 'utf8' });
  }
  try { execFileSync('codex', ['plugin', 'remove', 'ripple'], { encoding: 'utf8', stdio: 'pipe' }); } catch { /* not installed */ }
  execFileSync('codex', ['plugin', 'add', 'ripple@ripple-local'], { encoding: 'utf8' });
  return 'installed ripple@ripple-local (fresh snapshot of working tree)';
}
