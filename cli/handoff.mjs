import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { clipName, validateManifest } from "./cut.mjs";
import { ensureDir, fail, ffprobeJson, output, parseArgs, round3 } from "./util.mjs";

// Hand a rough cut off to an NLE: edit.json → timeline files that reference
// the ORIGINAL media. xmeml → Premiere (stable path), otio → Resolve (native)
// and modern pipelines, edl → universal fallback.

// ---------- pure helpers (unit-tested) ----------

// "24000/1001" | "24" | 23.976 → { rate, timebase, ntsc }
export function parseFps(fps) {
  let rate;
  if (typeof fps === "number") rate = fps;
  else if (/^\d+\/\d+$/.test(fps)) {
    const [num, den] = fps.split("/").map(Number);
    rate = num / den;
  } else rate = Number(fps);
  if (!rate || rate <= 0) throw new Error(`unusable fps: ${fps}`);
  const timebase = Math.round(rate);
  return { rate, timebase, ntsc: Math.abs(timebase - rate) > 0.001 };
}

export function toFrames(seconds, rate) {
  return Math.round(seconds * rate);
}

// Non-drop timecode at the nominal timebase (drop-frame deliberately out of
// scope; every file declares NON-DROP explicitly).
export function timecode(frames, timebase) {
  const ff = frames % timebase;
  const totalSeconds = Math.floor(frames / timebase);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

export function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Flatten the manifest into sequential timeline events. J-cuts flatten to
// straight cuts (a marker records the intent); cards become clips referencing
// their rendered segment files.
export function buildEvents(manifest, { cardPathFor, includeCards = true }) {
  const events = [];
  for (const scene of manifest.scenes) {
    if (includeCards && (scene.card || scene.cardFile)) {
      const path = cardPathFor(scene);
      events.push({
        kind: "card",
        name: `card: ${scene.slug}`,
        path,
        srcIn: 0,
        srcOut: scene.cardDuration ?? 2.5,
        marker: null,
      });
    }
    const notes = [scene.reasoning, scene.expectEnding ? `ends: "${scene.expectEnding}"` : null, scene.jcut ? `intended J-cut: ${scene.jcut}s of audio under the preceding card` : null]
      .filter(Boolean)
      .join(" · ");
    events.push({
      kind: "scene",
      name: scene.slug,
      path: scene.sourceAbs,
      srcIn: scene.start,
      srcOut: scene.end,
      marker: { name: scene.slug, comment: notes },
    });
  }
  let rec = 0;
  for (const e of events) {
    e.recIn = round3(rec);
    e.recOut = round3(rec + (e.srcOut - e.srcIn));
    rec = e.recOut;
  }
  return events;
}

export function buildEdl(events, { title, timebase, rate }) {
  const lines = [`TITLE: ${title}`, "FCM: NON-DROP FRAME", ""];
  events.forEach((e, i) => {
    const num = String(i + 1).padStart(3, "0");
    const tc = (sec) => timecode(toFrames(sec, rate), timebase);
    lines.push(`${num}  AX       V     C        ${tc(e.srcIn)} ${tc(e.srcOut)} ${tc(e.recIn)} ${tc(e.recOut)}`);
    lines.push(`* FROM CLIP NAME: ${e.name}`);
    lines.push(`* SOURCE FILE: ${e.path}`);
    if (e.marker?.comment) lines.push(`* COMMENT: ${e.marker.comment}`);
    lines.push("");
  });
  return lines.join("\n");
}

export function buildXmeml(events, { title, timebase, ntsc, rate, width, height }) {
  const rateXml = `<rate><timebase>${timebase}</timebase><ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
  const fileIds = new Map();
  const fileXml = (e) => {
    if (fileIds.has(e.path)) return `<file id="${fileIds.get(e.path)}"/>`;
    const id = `file-${fileIds.size + 1}`;
    fileIds.set(e.path, id);
    return `<file id="${id}"><name>${xmlEscape(basename(e.path))}</name><pathurl>${xmlEscape(pathToFileURL(e.path).href)}</pathurl>${rateXml}<media><video/><audio/></media></file>`;
  };
  const clip = (e, i, mediatype) => {
    const f = (sec) => toFrames(sec, rate);
    const src = mediatype === "audio"
      ? `<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>`
      : "";
    return [
      `<clipitem id="clipitem-${mediatype}-${i + 1}">`,
      `<name>${xmlEscape(e.name)}</name><enabled>TRUE</enabled>`,
      `<duration>${f(e.srcOut - e.srcIn)}</duration>${rateXml}`,
      `<start>${f(e.recIn)}</start><end>${f(e.recOut)}</end>`,
      `<in>${f(e.srcIn)}</in><out>${f(e.srcOut)}</out>`,
      fileXml(e),
      src,
      `</clipitem>`,
    ].join("");
  };
  const videoClips = events.map((e, i) => clip(e, i, "video")).join("\n      ");
  fileIds.clear();
  const audioClips = events.map((e, i) => clip(e, i, "audio")).join("\n      ");
  // Sequence-level markers: the only marker tier Premiere reliably imports.
  const markers = events
    .filter((e) => e.marker)
    .map((e) => `<marker><name>${xmlEscape(e.marker.name)}</name><comment>${xmlEscape(e.marker.comment)}</comment><in>${toFrames(e.recIn, rate)}</in><out>-1</out></marker>`)
    .join("\n  ");
  const total = toFrames(events[events.length - 1].recOut, rate);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
 <sequence id="sequence-1">
  <name>${xmlEscape(title)}</name>
  <duration>${total}</duration>
  ${rateXml}
  <media>
   <video>
    <format><samplecharacteristics>${rateXml}<width>${width}</width><height>${height}</height></samplecharacteristics></format>
    <track>
      ${videoClips}
    </track>
   </video>
   <audio>
    <track>
      ${audioClips}
    </track>
   </audio>
  </media>
  <timecode>${rateXml}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
  ${markers}
 </sequence>
</xmeml>
`;
}

export function buildOtio(events, { title, rate, manifestPath }) {
  const rt = (seconds) => ({ OTIO_SCHEMA: "RationalTime.1", rate, value: toFrames(seconds, rate) });
  const range = (inSec, outSec) => ({
    OTIO_SCHEMA: "TimeRange.1",
    start_time: rt(inSec),
    duration: rt(round3(outSec - inSec)),
  });
  const clips = events.map((e) => ({
    OTIO_SCHEMA: "Clip.1",
    name: e.name,
    enabled: true,
    effects: [],
    markers: e.marker
      ? [{
          OTIO_SCHEMA: "Marker.2",
          name: e.marker.name,
          color: "GREEN",
          marked_range: { OTIO_SCHEMA: "TimeRange.1", start_time: rt(e.srcIn), duration: rt(0) },
          metadata: { ripple: { comment: e.marker.comment } },
        }]
      : [],
    metadata: { ripple: { kind: e.kind } },
    media_reference: {
      OTIO_SCHEMA: "ExternalReference.1",
      name: basename(e.path),
      target_url: pathToFileURL(e.path).href,
      available_range: null,
      metadata: {},
    },
    source_range: range(e.srcIn, e.srcOut),
  }));
  return JSON.stringify(
    {
      OTIO_SCHEMA: "Timeline.1",
      name: title,
      metadata: { ripple: { manifest: manifestPath, generator: "ripple handoff" } },
      tracks: {
        OTIO_SCHEMA: "Stack.1",
        name: "tracks",
        enabled: true,
        children: [
          {
            OTIO_SCHEMA: "Track.1",
            name: "V1",
            kind: "Video",
            enabled: true,
            children: clips,
            effects: [],
            markers: [],
            metadata: {},
            source_range: null,
          },
        ],
        effects: [],
        markers: [],
        metadata: {},
        source_range: null,
      },
    },
    null,
    2
  );
}

// ---------- impl ----------

const FORMATS = ["otio", "xmeml", "edl"];

export async function main(argv) {
  const args = parseArgs(argv, { format: "string", out: "string", "no-cards": "boolean" });
  const manifestPath = args._[0] ?? "edit.json";
  if (!existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}. Run /ripple plan first.`, 2);
  const baseDir = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const errors = validateManifest(manifest, baseDir);
  if (errors.length) fail(`Manifest invalid:\n- ${errors.join("\n- ")}`, 2);

  const formats = args.format ? args.format.split(",").map((f) => f.trim()) : FORMATS;
  for (const f of formats) if (!FORMATS.includes(f)) fail(`Unknown format: ${f}. Options: ${FORMATS.join(", ")} (comma-separate for several)`, 2);

  for (const scene of manifest.scenes) scene.sourceAbs = resolve(baseDir, scene.source);

  // Geometry/rate from manifest or first source probe.
  const probe = ffprobeJson(manifest.scenes[0].sourceAbs);
  const video = (probe.streams ?? []).find((s) => s.codec_type === "video");
  const fps = parseFps(manifest.output?.fps ?? video?.avg_frame_rate ?? "30");
  const width = manifest.output?.width ?? video?.width ?? 1920;
  const height = manifest.output?.height ?? video?.height ?? 1080;
  const title = manifest.title ?? "ripple cut";

  const includeCards = !args["no-cards"];
  const cardPathFor = (scene) => {
    if (scene.cardFile) return resolve(baseDir, scene.cardFile);
    const seg = join(baseDir, "work", "segments", `${clipName(scene).replace(".mp4", "")}_card.mp4`);
    if (!existsSync(seg)) {
      fail(
        `Card segment for scene "${scene.slug}" not rendered yet (${seg}). Run \`ripple cut ${manifestPath}\` first, or pass --no-cards to hand off footage only.`,
        2
      );
    }
    return seg;
  };

  const events = buildEvents(manifest, { cardPathFor, includeCards });
  const outDir = ensureDir(resolve(baseDir, args.out ?? "handoff"));
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  const files = {};
  if (formats.includes("otio")) {
    files.otio = join(outDir, `${slug}.otio`);
    writeFileSync(files.otio, buildOtio(events, { title, rate: fps.rate, manifestPath: basename(manifestPath) }) + "\n");
  }
  if (formats.includes("xmeml")) {
    files.xmeml = join(outDir, `${slug}.xml`);
    writeFileSync(files.xmeml, buildXmeml(events, { title, ...fps, width, height }));
  }
  if (formats.includes("edl")) {
    files.edl = join(outDir, `${slug}.edl`);
    writeFileSync(files.edl, buildEdl(events, { title, ...fps }));
  }

  output({
    ok: true,
    events: events.length,
    fps: { rate: round3(fps.rate), timebase: fps.timebase, ntsc: fps.ntsc, dropFrame: false },
    files,
    importInto: {
      ...(files.xmeml ? { premiere: `File > Import: ${files.xmeml} (scene reasoning arrives as sequence markers)` } : {}),
      ...(files.otio ? { resolve: `File > Import Timeline: ${files.otio} (native since 18.5; also imports the .xml)` } : {}),
      ...(files.edl ? { universal: `${files.edl} — single video track, no markers; the always-works fallback` } : {}),
    },
    notes: [
      "Timelines reference ORIGINAL media by absolute path — keep sources where they are, or relink after moving.",
      ...(events.some((e) => e.kind === "card") ? ["Cards reference ripple-rendered segment files; editors will likely rebuild titles natively."] : []),
      ...(manifest.scenes.some((s) => s.jcut) ? ["J-cuts are flattened to straight cuts; the intended overlap is noted in each scene's marker."] : []),
    ],
  });
}
