import { detectHdr, fail, ffprobeJson, findTool, output, parseArgs, run } from "./util.mjs";

// Optional ffmpeg filters worth knowing about before choosing a pipeline.
// drawtext is famously absent from many builds (title cards); the rest
// gate specific techniques.
const INTERESTING_FILTERS = ["drawtext", "tile", "zoompan", "loudnorm", "libplacebo"];

export async function main(argv) {
  const args = parseArgs(argv, { filters: "boolean" });
  const file = args._[0];
  if (!file) fail("Usage: ripple probe <file> [--filters]", 2);

  const probe = ffprobeJson(file);
  const video = (probe.streams ?? []).find((s) => s.codec_type === "video");
  const audio = (probe.streams ?? []).filter((s) => s.codec_type === "audio");
  const hdr = detectHdr(video);

  const result = {
    ok: true,
    file,
    container: probe.format?.format_name ?? null,
    duration: probe.format?.duration ? Number(probe.format.duration) : null,
    sizeBytes: probe.format?.size ? Number(probe.format.size) : null,
    video: video
      ? {
          codec: video.codec_name,
          profile: video.profile ?? null,
          width: video.width,
          height: video.height,
          fps: video.avg_frame_rate ?? null,
          pix_fmt: video.pix_fmt ?? null,
        }
      : null,
    audio: audio.map((a) => ({
      index: a.index,
      codec: a.codec_name,
      channels: a.channels,
      sample_rate: a.sample_rate,
    })),
    color: hdr,
    colorPolicySuggestion: hdr.hdr
      ? "preserve — source is HDR; converting to SDR silently will look washed out. Ask the user or check VIDEO.md."
      : "sdr source — standard BT.709 pipeline is fine.",
  };

  if (args.filters) {
    const ffmpeg = findTool(["ffmpeg"]);
    if (ffmpeg) {
      const res = run(ffmpeg, ["-hide_banner", "-filters"]);
      const available = {};
      for (const f of INTERESTING_FILTERS) {
        available[f] = new RegExp(`\\s${f}\\s`).test(res.stdout);
      }
      result.ffmpegFilters = available;
      if (!available.drawtext) {
        result.ffmpegFilters.note =
          "drawtext unavailable — render title cards via HyperFrames/Remotion or ImageMagick PNG + loop, not drawtext.";
      }
    } else {
      result.ffmpegFilters = { error: "ffmpeg not found on PATH" };
    }
  }

  output(result);
}
