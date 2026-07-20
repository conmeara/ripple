// Headless agent invocation for eval cases.
// - claude: Claude Code with the working-tree plugin loaded via --plugin-dir
// - codex:  Codex CLI with a lean plugin staged in the local eval marketplace
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

const CODEX_PLUGIN_REQUIRED = [
  '.codex-plugin',
  'agents',
  'bin',
  'cli',
  'hooks',
  'schemas',
  'skills',
  'LICENSE',
  'package.json',
];

function bundledFiles(dir) {
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  visit(dir);
  return files;
}

// Older eval runs created evals/codex/ripple -> ../.. so Codex could snapshot
// the repository. Remove only that generated link; never touch a real path.
export function removeLegacyCodexLink(marketplaceRoot) {
  const legacyLink = path.join(marketplaceRoot, 'ripple');
  let stat;
  try {
    stat = fs.lstatSync(legacyLink);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (!stat.isSymbolicLink()) return false;
  fs.unlinkSync(legacyLink);
  return true;
}

// Build only the runtime plugin. Pointing Codex at the repo root also copies
// ignored eval runs and other development artifacts into its versioned cache.
export function stageCodexPlugin(evalsDir) {
  const root = path.resolve(evalsDir, '..');
  const marketplaceRoot = path.resolve(evalsDir, 'codex');
  removeLegacyCodexLink(marketplaceRoot);
  const pluginsRoot = path.join(marketplaceRoot, 'plugins');
  const bundle = path.join(pluginsRoot, 'ripple');
  if (path.relative(marketplaceRoot, bundle) !== path.join('plugins', 'ripple')) {
    throw new Error(`refusing unsafe Codex bundle path: ${bundle}`);
  }

  fs.rmSync(bundle, { recursive: true, force: true });
  fs.mkdirSync(bundle, { recursive: true });
  for (const entry of CODEX_PLUGIN_REQUIRED) {
    const source = path.join(root, entry);
    if (!fs.existsSync(source)) throw new Error(`missing Codex plugin runtime entry: ${entry}`);
    fs.cpSync(source, path.join(bundle, entry), {
      recursive: true,
      filter: candidate => !(entry === 'cli' && candidate.endsWith('.test.mjs')),
    });
  }
  const assets = path.join(root, 'assets');
  if (fs.existsSync(assets)) fs.cpSync(assets, path.join(bundle, 'assets'), { recursive: true });

  // Codex caches by manifest version. Derive local build metadata from the
  // staged content so uncommitted working-tree changes cannot reuse stale bits.
  const files = bundledFiles(bundle);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(bundle, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  const cachebuster = hash.digest('hex').slice(0, 12);
  const manifestPath = path.join(bundle, '.codex-plugin', 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baseVersion = manifest.version.replace(/\+.*/, '');
  manifest.version = `${baseVersion}+codex.local-${cachebuster}`;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const stagedFiles = bundledFiles(bundle);
  const bytes = stagedFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  return { bundle, version: manifest.version, files: stagedFiles.length, bytes };
}

// (Re)install the lean, content-versioned plugin for Codex. Codex snapshots a
// local plugin at install time, so every eval run must refresh it before use.
export function ensureCodexPlugin(evalsDir) {
  const staged = stageCodexPlugin(evalsDir);
  let markets = '';
  try { markets = execFileSync('codex', ['plugin', 'marketplace', 'list'], { encoding: 'utf8' }); } catch { /* fallthrough */ }
  if (!/ripple-local/.test(markets)) {
    execFileSync('codex', ['plugin', 'marketplace', 'add', path.join(evalsDir, 'codex')], { encoding: 'utf8' });
  }
  try { execFileSync('codex', ['plugin', 'remove', 'ripple@ripple-local', '--json'], { encoding: 'utf8', stdio: 'pipe' }); } catch { /* not installed */ }
  execFileSync('codex', ['plugin', 'add', 'ripple@ripple-local', '--json'], { encoding: 'utf8' });
  return `installed ripple@ripple-local ${staged.version} (${staged.files} files, ${Math.ceil(staged.bytes / 1024)} KiB)`;
}
