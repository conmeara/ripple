// Deterministic checks for eval cases. Each check returns
// { id, pass, detail } and never throws.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Minimal glob: supports "dir/sub/*.ext" style patterns (single-level "*").
function globMatch(ws, pattern) {
  const dir = path.join(ws, path.dirname(pattern));
  const base = path.basename(pattern);
  const re = new RegExp('^' + base.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter(n => re.test(n)).map(n => path.join(dir, n));
}

function matches(ws, globs) {
  return (Array.isArray(globs) ? globs : [globs]).flatMap(g => globMatch(ws, g));
}

function newest(files) {
  return files.map(f => ({ f, m: fs.statSync(f).mtimeMs })).sort((a, b) => b.m - a.m)[0]?.f;
}

function ffprobe(args) {
  return execFileSync('ffprobe', ['-v', 'error', ...args], { encoding: 'utf8' }).trim();
}

function runCli(ctx, args, timeoutMs = 300000) {
  const res = { ok: false, exit: null, json: null, raw: '' };
  try {
    res.raw = execFileSync('node', [path.join(ctx.root, 'cli', 'index.mjs'), ...args], {
      cwd: ctx.ws, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
    });
    res.exit = 0;
  } catch (e) {
    res.exit = e.status ?? -1;
    res.raw = (e.stdout || '') + (e.stderr || '');
  }
  try { res.json = JSON.parse(res.raw); } catch { /* non-JSON output */ }
  res.ok = res.exit === 0;
  return res;
}

function jsonPath(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function compare(op, actual, value) {
  switch (op) {
    case 'eq': return actual === value;
    case 'gte': return Number(actual) >= Number(value);
    case 'lte': return Number(actual) <= Number(value);
    case 'contains': return String(actual).toLowerCase().includes(String(value).toLowerCase());
    default: return actual !== undefined;
  }
}

const types = {
  // At least `min` files matching any of `globs` exist in the workspace.
  file_exists(ctx, c) {
    const found = matches(ctx.ws, c.globs ?? c.glob);
    const min = c.min ?? 1;
    return { pass: found.length >= min, detail: `${found.length} match(es): ${found.slice(0, 3).map(f => path.relative(ctx.ws, f)).join(', ') || 'none'}` };
  },

  // Newest file matching glob has a duration within [min, max] seconds.
  duration_between(ctx, c) {
    const f = newest(matches(ctx.ws, c.globs ?? c.glob));
    if (!f) return { pass: false, detail: 'no file matched' };
    const d = Number(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
    return { pass: d >= c.min && d <= c.max, detail: `${path.relative(ctx.ws, f)} = ${d.toFixed(2)}s (want ${c.min}-${c.max}s)` };
  },

  // Newest file matching glob has the expected video color_transfer (HDR guard).
  color_transfer(ctx, c) {
    const f = newest(matches(ctx.ws, c.globs ?? c.glob));
    if (!f) return { pass: false, detail: 'no file matched' };
    const t = ffprobe(['-select_streams', 'v:0', '-show_entries', 'stream=color_transfer', '-of', 'csv=p=0', f]).replace(/,+$/, '');
    return { pass: t === c.expect, detail: `${path.relative(ctx.ws, f)} color_transfer=${t || '(none)'} (want ${c.expect})` };
  },

  // Transcribe the newest render matching glob; assert word presence/absence.
  render_transcript(ctx, c) {
    const f = newest(matches(ctx.ws, c.globs ?? c.glob));
    if (!f) return { pass: false, detail: 'no file matched' };
    const res = runCli(ctx, ['transcribe', f]);
    const txtPath = res.json?.files?.txt;
    if (!res.ok || !txtPath) return { pass: false, detail: `transcribe failed (exit ${res.exit})` };
    const text = fs.readFileSync(txtPath, 'utf8').toLowerCase();
    const missing = (c.includes ?? []).filter(w => !text.includes(w.toLowerCase()));
    const leaked = (c.excludes ?? []).filter(w => text.includes(w.toLowerCase()));
    const pass = missing.length === 0 && leaked.length === 0;
    return { pass, detail: pass ? `transcript ok (${text.trim().length} chars)` : `missing: [${missing}] leaked: [${leaked}] — "${text.trim().slice(0, 160)}"` };
  },

  // Run a ripple CLI command in the workspace; assert exit and optional JSON path.
  cli(ctx, c) {
    const res = runCli(ctx, c.args);
    if ((c.expectOk ?? true) !== res.ok) return { pass: false, detail: `exit ${res.exit}: ${res.raw.slice(0, 200)}` };
    if (c.jsonPath) {
      const actual = jsonPath(res.json ?? {}, c.jsonPath);
      const pass = compare(c.op ?? 'eq', actual, c.value);
      return { pass, detail: `${c.jsonPath} = ${JSON.stringify(actual)} (${c.op ?? 'eq'} ${JSON.stringify(c.value)})` };
    }
    return { pass: true, detail: `exit ${res.exit}` };
  },

  // Assert a value inside a JSON file in the workspace.
  json_path(ctx, c) {
    const file = path.join(ctx.ws, c.file);
    if (!fs.existsSync(file)) return { pass: false, detail: `${c.file} missing` };
    let obj;
    try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { pass: false, detail: `${c.file} unparseable: ${e.message}` }; }
    const actual = jsonPath(obj, c.path);
    return { pass: compare(c.op ?? 'eq', actual, c.value), detail: `${c.path} = ${JSON.stringify(actual)} (${c.op ?? 'eq'} ${JSON.stringify(c.value)})` };
  },

  // Grep the agent's full transcript/event log (what the agent actually did).
  transcript_grep(ctx, c) {
    if (!fs.existsSync(ctx.transcriptPath)) return { pass: false, detail: 'no transcript captured' };
    const hit = new RegExp(c.pattern, c.flags ?? 'i').test(fs.readFileSync(ctx.transcriptPath, 'utf8'));
    const pass = hit === (c.expect ?? true);
    return { pass, detail: `/${c.pattern}/ ${hit ? 'found' : 'not found'} in transcript` };
  },

  // Grep the agent's final message (what the agent told the user).
  final_grep(ctx, c) {
    if (!fs.existsSync(ctx.finalPath)) return { pass: false, detail: 'no final message captured' };
    const hit = new RegExp(c.pattern, c.flags ?? 'i').test(fs.readFileSync(ctx.finalPath, 'utf8'));
    const pass = hit === (c.expect ?? true);
    return { pass, detail: `/${c.pattern}/ ${hit ? 'found' : 'not found'} in final message` };
  },
};

export function runCheck(ctx, check) {
  const fn = types[check.type];
  if (!fn) return { id: check.id ?? check.type, pass: false, detail: `unknown check type: ${check.type}` };
  try {
    const r = fn(ctx, check);
    return { id: check.id ?? check.type, ...r };
  } catch (e) {
    return { id: check.id ?? check.type, pass: false, detail: `check threw: ${e.message}` };
  }
}
