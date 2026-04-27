import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  buildHyperframesPlayerBlobDocument,
  buildHyperframesPlayerFetchUrl,
  buildHyperframesThumbnailBlobDocument,
} from "./player-source-url"

describe("HyperFrames player source URLs", () => {
  test("adds reload versions without losing existing query params", () => {
    expect(buildHyperframesPlayerFetchUrl(
      "ripple-preview://project_1/__hyperframes/preview/index.html",
      0,
    )).toBe(
      "ripple-preview://project_1/__hyperframes/preview/index.html?rippleReload=0",
    )

    expect(buildHyperframesPlayerFetchUrl(
      "ripple-preview://project_1/__hyperframes/preview/index.html?composition=main",
      7,
    )).toBe(
      "ripple-preview://project_1/__hyperframes/preview/index.html?composition=main&rippleReload=7",
    )
  })

  test("marks blob documents with the approved source URL for reload diagnostics", () => {
    const document = buildHyperframesPlayerBlobDocument({
      html: "<!doctype html><html><body>Preview</body></html>",
      sourceUrl:
        "ripple-preview://project_1/__hyperframes/preview/index.html?rippleReload=3",
    })

    expect(document).toContain("<body>Preview</body>")
    expect(document).toContain(
      "<!-- ripple-player-source:ripple-preview://project_1/__hyperframes/preview/index.html?rippleReload=3 -->",
    )
    expect(document).not.toContain("srcdoc")
  })

  test("builds self-sampling thumbnail documents for isolated sandbox iframes", () => {
    const document = buildHyperframesThumbnailBlobDocument({
      html: "<!doctype html><html><body><main></main></body></html>",
      sourceUrl:
        "ripple-preview://project_1/__hyperframes/preview/index.html?rippleReload=3",
      sampleTime: 2,
    })

    expect(document).toContain('data-ripple-thumbnail-sampler="1"')
    expect(document).toContain("window.__player")
    expect(document).toContain("window.__timelines")
    expect(document).toContain("<main></main><script")
    expect(document).not.toContain("window.parent")
    expect(document).not.toContain("allow-same-origin")
  })

  test("keeps renderer CSP open only to local player source channels", () => {
    const html = readFileSync("src/renderer/index.html", "utf-8")
    const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ""

    expect(csp).toContain("connect-src 'self' ripple-preview:")
    expect(csp).toContain("frame-src 'self' blob: ripple-preview:")
    expect(csp).toContain("media-src 'self' blob: ripple-preview:")
    expect(csp).not.toContain("cdn.jsdelivr.net")
  })
})
