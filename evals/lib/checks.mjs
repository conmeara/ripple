// Deterministic checks for eval cases. Each check returns
// { id, pass, detail } and never throws.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { assemblyTimeline } from '../../cli/cut.mjs';

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

function mediaProbe(file) {
  return JSON.parse(ffprobe(['-show_format', '-show_streams', '-of', 'json', file]));
}

function audioDuration(probe) {
  const audio = (probe.streams ?? []).find(s => s.codec_type === 'audio');
  if (!audio) return null;
  const streamDuration = Number(audio.duration);
  return streamDuration > 0 ? streamDuration : Number(probe.format?.duration) || null;
}

function audioSilences(file) {
  const duration = audioDuration(mediaProbe(file));
  if (!duration) throw new Error('render has no measurable audio stream');
  const res = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file, '-vn', '-map', '0:a:0',
    '-af', 'silencedetect=noise=-40dB:d=0.25', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`silencedetect failed: ${(res.stderr ?? '').slice(-200)}`);
  const spans = [];
  let current = null;
  for (const line of (res.stderr ?? '').split('\n')) {
    const start = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (start) {
      current = { start: Number(start[1]), end: null };
      spans.push(current);
      continue;
    }
    const end = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (end && current) {
      current.end = Number(end[1]);
      current = null;
    }
  }
  for (const span of spans) if (span.end == null) span.end = duration;
  return { duration, spans };
}

function meanVolumeDb(file, start, duration) {
  const res = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-ss', String(Math.max(0, start)), '-t', String(duration),
    '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`volumedetect failed: ${(res.stderr ?? '').slice(-200)}`);
  const match = (res.stderr ?? '').match(/mean_volume:\s*(-?inf|-?[\d.]+)\s*dB/i);
  if (!match) throw new Error('volumedetect returned no mean_volume');
  return match[1].toLowerCase() === '-inf' ? -Infinity : Number(match[1]);
}

function snapshotStatus(snapshot) {
  if (snapshot.status) return snapshot.status;
  const states = (snapshot.checks ?? []).map(c => c.status ?? (c.skipped ? 'not-verified' : c.ok ? 'pass' : 'fail'));
  return states.includes('fail') ? 'fail' : states.includes('not-verified') ? 'not-verified' : 'pass';
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

function normalizedSource(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function sourceMatches(actual, expected) {
  const a = normalizedSource(actual);
  const e = normalizedSource(expected);
  return a === e || a.endsWith(`/${e}`);
}

export function assessAudioBoundaries({
  tail, joins, minTail = 0.05, maxTail = 1, maxJoin = 1.25,
  minHardJoins = 0, maxHardJoins = Infinity,
}) {
  return tail >= minTail && tail <= maxTail &&
    joins.length >= minHardJoins && joins.length <= maxHardJoins &&
    joins.every(j => j.silence <= maxJoin);
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

  // Privacy-safe content preservation: correlate each source's audio energy
  // envelope against the render. This proves the requested source material is
  // present without storing transcript phrases in the tracked eval case.
  audio_source_correlation(ctx, c) {
    const render = newest(matches(ctx.ws, c.globs ?? c.glob));
    if (!render) return { pass: false, detail: 'no render matched' };
    const sources = (c.sources ?? []).map(source => path.join(ctx.ws, source));
    const missing = sources.filter(source => !fs.existsSync(source));
    if (missing.length) return { pass: false, detail: `missing source(s): ${missing.map(f => path.relative(ctx.ws, f)).join(', ')}` };
    const res = runCli(ctx, ['sync', render, ...sources]);
    if (!res.ok || !res.json?.results) return { pass: false, detail: `ripple sync failed (exit ${res.exit}): ${res.raw.slice(0, 200)}` };
    const min = c.minConfidence ?? 0.3;
    const duration = Number(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', render]));
    const hasSourceBounds = [
      c.minSourceStart, c.maxSourceStart, c.minSourceEnd, c.maxSourceEnd,
    ].some(value => value !== undefined);
    const rows = res.json.results.map(r => {
      const offset = Number(r.offset);
      const sourceStart = -offset;
      return {
        file: path.relative(ctx.ws, r.file),
        confidence: Number(r.confidence),
        offset,
        ...(hasSourceBounds ? { sourceStart, sourceEnd: sourceStart + duration } : {}),
      };
    });
    const bounded = (value, low, high) =>
      (low === undefined || value >= low) && (high === undefined || value <= high);
    return {
      pass: rows.length === sources.length && rows.every(r =>
        r.confidence >= min &&
        bounded(r.sourceStart, c.minSourceStart, c.maxSourceStart) &&
        bounded(r.sourceEnd, c.minSourceEnd, c.maxSourceEnd)),
      detail: `${rows.map(r => hasSourceBounds
        ? `${r.file} confidence=${r.confidence.toFixed(3)} source=${r.sourceStart.toFixed(2)}-${r.sourceEnd.toFixed(2)}s`
        : `${r.file} confidence=${r.confidence.toFixed(3)} offset=${r.offset.toFixed(2)}s`).join(', ')} (min confidence ${min})`,
    };
  },

  // Assert the manifest uses the requested sources in the requested order.
  // Audio correlation proves material is present, but not which scene comes
  // first (or whether an unexpected scene/card was inserted).
  manifest_source_order(ctx, c) {
    const manifestPath = path.join(ctx.ws, c.manifest ?? 'edit.json');
    if (!fs.existsSync(manifestPath)) return { pass: false, detail: `${c.manifest ?? 'edit.json'} missing` };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const actual = (manifest.scenes ?? []).map(scene => normalizedSource(scene.source));
    const expected = (c.sources ?? []).map(normalizedSource);
    const sameLength = c.exact === false ? actual.length >= expected.length : actual.length === expected.length;
    const ordered = expected.every((source, index) => sourceMatches(actual[index], source));
    return {
      pass: sameLength && ordered,
      detail: `manifest sources [${actual.join(', ')}] (want ${c.exact === false ? 'prefix' : 'exactly'} [${expected.join(', ')}])`,
    };
  },

  // Measure the actual rendered audio at hard scene joins and EOF. This is
  // independent of the agent's manifest and QA claims, and catches the
  // case-40 pattern where 1.4s of dead air sat across a join and 2.6s at EOF.
  render_audio_boundaries(ctx, c) {
    const render = newest(matches(ctx.ws, c.globs ?? c.glob));
    if (!render) return { pass: false, detail: 'no render matched' };
    const manifestPath = path.join(ctx.ws, c.manifest ?? 'edit.json');
    if (!fs.existsSync(manifestPath)) return { pass: false, detail: `${c.manifest ?? 'edit.json'} missing` };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const { duration, spans } = audioSilences(render);
    const tailSpan = spans.find(s => s.end >= duration - 0.05);
    const tail = tailSpan ? Math.max(0, tailSpan.end - tailSpan.start) : 0;
    const timeline = assemblyTimeline(manifest.scenes ?? []);
    const hardJoins = [];
    for (let i = 0; i < timeline.length - 1; i++) {
      const left = timeline[i], right = timeline[i + 1];
      if (left.kind === 'body' && right.kind === 'body' && Math.abs(left.outEnd - right.outStart) <= 0.05) {
        hardJoins.push(left.outEnd);
      }
    }
    const joins = hardJoins.map(at => {
      const span = spans.find(s => s.start <= at + 0.05 && s.end >= at - 0.05);
      return { at, silence: span ? Math.max(0, span.end - span.start) : 0 };
    });
    const minTail = c.minTail ?? 0.05;
    const maxTail = c.maxTail ?? 1;
    const maxJoin = c.maxJoinSilence ?? 1.25;
    const minHardJoins = c.minHardJoins ?? 0;
    const maxHardJoins = c.maxHardJoins ?? Infinity;
    const pass = assessAudioBoundaries({ tail, joins, minTail, maxTail, maxJoin, minHardJoins, maxHardJoins });
    return {
      pass,
      detail: `tail ${tail.toFixed(3)}s (want ${minTail}-${maxTail}s); ` +
        (joins.length ? `join silence ${joins.map(j => `${j.at.toFixed(3)}s→${j.silence.toFixed(3)}s`).join(', ')} (max ${maxJoin}s)` : 'no hard joins found') +
        `; hard joins ${joins.length} (want ${minHardJoins}-${Number.isFinite(maxHardJoins) ? maxHardJoins : '∞'})`,
    };
  },

  // Require a real, latest Ripple QA snapshot and named gates. A transcript
  // grep proving the command ran is not evidence that the delivery passed.
  qa_snapshot(ctx, c) {
    const dir = path.join(ctx.ws, c.dir ?? '.ripple/qa');
    const snapshots = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => /^qa-.*\.json$/.test(f)).map(f => path.join(dir, f))
      : [];
    const file = newest(snapshots);
    if (!file) return { pass: false, detail: 'no Ripple QA snapshot found' };
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    const status = snapshotStatus(snapshot);
    const expect = c.status ?? 'pass';
    const explicitVerifiedPass = snapshot.status === 'pass' && snapshot.verified === true && snapshot.ok === true;
    const render = c.globs || c.glob ? newest(matches(ctx.ws, c.globs ?? c.glob)) : null;
    const recordedRender = snapshot.file
      ? path.resolve(ctx.ws, snapshot.file)
      : null;
    const renderMatches = !c.globs && !c.glob
      ? true
      : Boolean(render && recordedRender && path.resolve(render) === recordedRender);
    const expectedManifest = c.manifest ? path.resolve(ctx.ws, c.manifest) : null;
    const recordedManifest = snapshot.manifest ? path.resolve(ctx.ws, snapshot.manifest) : null;
    const manifestMatches = !expectedManifest
      ? true
      : Boolean(fs.existsSync(expectedManifest) && recordedManifest === expectedManifest);
    const snapshotMtime = fs.statSync(file).mtimeMs;
    const snapshotTimestamp = Date.parse(snapshot.timestamp);
    const requiresBoundEvidence = Boolean(c.globs || c.glob || c.manifest);
    const timestampFresh = !requiresBoundEvidence || (
      Number.isFinite(snapshotTimestamp) &&
      (!render || snapshotTimestamp >= fs.statSync(render).mtimeMs) &&
      (!expectedManifest || snapshotTimestamp >= fs.statSync(expectedManifest).mtimeMs)
    );
    const evidenceFresh = renderMatches && manifestMatches &&
      (!render || snapshotMtime >= fs.statSync(render).mtimeMs) &&
      (!expectedManifest || snapshotMtime >= fs.statSync(expectedManifest).mtimeMs) &&
      timestampFresh;
    const required = c.gates ?? [];
    const missing = required.filter(id => !(snapshot.checks ?? []).some(g => g.id === id && (g.status ?? (g.ok ? 'pass' : 'fail')) === 'pass'));
    // A release case that expects PASS must prove it came from the tri-state
    // QA contract. Legacy snapshots can say N/N while skipped or false-green
    // gates remain hidden, so never upgrade one into release evidence.
    const legacyPass = expect === 'pass' && !explicitVerifiedPass;
    return {
      pass: status === expect && !legacyPass && renderMatches && manifestMatches && evidenceFresh && missing.length === 0,
      detail: `${path.relative(ctx.ws, file)} status=${status}` +
        (legacyPass ? ' but lacks explicit ok:true/status:pass/verified:true tri-state evidence; ' : '; ') +
        (!renderMatches ? `snapshot target ${snapshot.file ?? '(missing)'} does not match latest render ${render ? path.relative(ctx.ws, render) : '(none)'}; ` : '') +
        (!manifestMatches ? `snapshot manifest ${snapshot.manifest ?? '(missing)'} does not match ${c.manifest}; ` : '') +
        (renderMatches && manifestMatches && !evidenceFresh ? 'snapshot file or recorded timestamp predates the render or manifest; ' : '') +
        (missing.length ? `missing passing gates: ${missing.join(', ')}` : `passing gates: ${required.join(', ') || '(none required)'}`),
    };
  },

  // Verify that the declared J-cut exists in the rendered audio: the quiet
  // portion of the card is silent, then audible content begins before the
  // picture cut. This tests timing in the output, not only a JSON field.
  rendered_jcut(ctx, c) {
    const render = newest(matches(ctx.ws, c.globs ?? c.glob));
    if (!render) return { pass: false, detail: 'no render matched' };
    const manifestPath = path.join(ctx.ws, c.manifest ?? 'edit.json');
    if (!fs.existsSync(manifestPath)) return { pass: false, detail: `${c.manifest ?? 'edit.json'} missing` };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const scene = c.sceneSlug
      ? (manifest.scenes ?? []).find(s => s.slug === c.sceneSlug)
      : (manifest.scenes ?? [])[c.sceneIndex ?? 1];
    if (!scene?.jcut || !scene.card) return { pass: false, detail: 'target scene has no card-backed jcut' };
    const card = assemblyTimeline(manifest.scenes).find(seg => seg.kind === 'card' && seg.slug === scene.slug);
    const jcutPart = card?.audio?.find(part => part.kind === 'jcut');
    const quietPart = card?.audio?.find(part => part.kind === 'silence');
    if (!card || !jcutPart || !quietPart) return { pass: false, detail: 'timeline has no measurable quiet→jcut card regions' };
    const window = Math.min(c.window ?? 0.4, jcutPart.outEnd - jcutPart.outStart, quietPart.outEnd - quietPart.outStart);
    if (!(window >= 0.2)) return { pass: false, detail: `J-cut/quiet measurement window too short (${window}s)` };
    const inset = Math.min(0.05, window / 5);
    const quietDb = meanVolumeDb(render, quietPart.outEnd - window, window - inset);
    // Sample the FINAL J-cut window immediately before the picture appears.
    // A legitimate J-cut may begin with a breath/pause and only become audible
    // later in its declared lead; measuring its first window would false-fail.
    const jcutDb = meanVolumeDb(render, jcutPart.outEnd - window, window - inset);
    const minActiveDb = c.minActiveDb ?? -55;
    const maxQuietDb = c.maxQuietDb ?? -65;
    const minContrastDb = c.minContrastDb ?? 12;
    const contrast = jcutDb - quietDb;
    const sourcePath = path.isAbsolute(scene.source)
      ? scene.source
      : path.resolve(path.dirname(manifestPath), scene.source);
    if (!fs.existsSync(sourcePath)) return { pass: false, detail: `J-cut source missing: ${scene.source}` };
    const sync = runCli(ctx, ['sync', render, sourcePath]);
    const syncRow = sync.json?.results?.[0];
    if (!sync.ok || !syncRow) return { pass: false, detail: `could not map J-cut source into render (exit ${sync.exit})` };
    // sync reports source_time + offset = render_time. The scene's source
    // start must therefore land at the J-cut's output start under the card.
    const expectedOffset = jcutPart.outStart - Number(scene.start ?? 0);
    const actualOffset = Number(syncRow.offset);
    const offsetError = Math.abs(actualOffset - expectedOffset);
    const minSourceConfidence = c.minSourceConfidence ?? 0.35;
    const maxOffsetError = c.maxOffsetError ?? 0.35;
    const sourceMapped = Number(syncRow.confidence) >= minSourceConfidence && offsetError <= maxOffsetError;
    return {
      pass: jcutDb >= minActiveDb && quietDb <= maxQuietDb && contrast >= minContrastDb && sourceMapped,
      detail: `card quiet ${Number.isFinite(quietDb) ? quietDb.toFixed(1) : '-inf'} dB → J-cut ${jcutDb.toFixed(1)} dB before picture at ${card.outEnd.toFixed(3)}s (${Number.isFinite(contrast) ? contrast.toFixed(1) : '∞'} dB contrast); ` +
        `${normalizedSource(scene.source)} maps to ${actualOffset.toFixed(3)}s (want ${expectedOffset.toFixed(3)}s ±${maxOffsetError}, confidence ${Number(syncRow.confidence).toFixed(3)} ≥${minSourceConfidence})`,
    };
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
