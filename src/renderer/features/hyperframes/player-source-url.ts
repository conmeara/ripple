export function buildHyperframesPlayerFetchUrl(
  sourceUrl: string,
  reloadVersion: number,
): string {
  const separator = sourceUrl.includes("?") ? "&" : "?"
  return `${sourceUrl}${separator}rippleReload=${reloadVersion}`
}

export function buildHyperframesPlayerBlobDocument(input: {
  html: string
  sourceUrl: string
}): string {
  return `${input.html}\n<!-- ripple-player-source:${input.sourceUrl} -->`
}

function appendBeforeClosingBody(html: string, content: string): string {
  const bodyEndMatch = /<\/body\s*>/i.exec(html)
  if (!bodyEndMatch) return `${html}\n${content}`

  return [
    html.slice(0, bodyEndMatch.index),
    content,
    "\n",
    html.slice(bodyEndMatch.index),
  ].join("")
}

function buildThumbnailSamplerScript(sampleTime: number): string {
  const fallbackTime = Number.isFinite(sampleTime) && sampleTime >= 0
    ? sampleTime
    : 2

  return `<script data-ripple-thumbnail-sampler="1">
(() => {
  const fallbackTime = ${JSON.stringify(fallbackTime)};
  const sampleForDuration = (duration) => {
    if (!Number.isFinite(duration) || duration <= 0) return fallbackTime;
    if (duration <= 0.5) return duration / 2;
    return Math.min(fallbackTime, Math.max(0.5, duration * 0.65));
  };
  const readTimelineDuration = (timeline) => {
    try {
      const duration = timeline && typeof timeline.duration === "function"
        ? timeline.duration()
        : null;
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    } catch {
      return null;
    }
  };
  const seekTimeline = (timeline) => {
    if (!timeline) return false;
    try {
      if (typeof timeline.pause === "function") timeline.pause();
      const time = sampleForDuration(readTimelineDuration(timeline));
      if (typeof timeline.totalTime === "function") {
        timeline.totalTime(time, false);
        return true;
      }
      if (typeof timeline.seek === "function") {
        timeline.seek(time, false);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };
  const seekThumbnail = () => {
    try {
      const player = window.__player;
      if (player && typeof player.seek === "function") {
        const duration = typeof player.getDuration === "function"
          ? player.getDuration()
          : null;
        player.seek(sampleForDuration(duration));
        return true;
      }
      if (seekTimeline(window.__timeline)) return true;
      const timelines = window.__timelines;
      if (!timelines) return false;
      const rootId = document
        .querySelector("[data-composition-id]")
        ?.getAttribute("data-composition-id");
      const keys = Object.keys(timelines);
      const timeline = (rootId && timelines[rootId]) || timelines[keys[keys.length - 1]];
      return seekTimeline(timeline);
    } catch {
      return false;
    }
  };
  let attempts = 0;
  const attemptSeek = () => {
    attempts += 1;
    if (seekThumbnail() || attempts >= 30) return;
    window.setTimeout(attemptSeek, 100);
  };
  const start = () => window.setTimeout(attemptSeek, 80);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
</script>`
}

export function buildHyperframesThumbnailBlobDocument(input: {
  html: string
  sourceUrl: string
  sampleTime?: number
}): string {
  return appendBeforeClosingBody(
    buildHyperframesPlayerBlobDocument(input),
    buildThumbnailSamplerScript(input.sampleTime ?? 2),
  )
}
