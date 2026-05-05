import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

describe("Ripple HyperFrames workflow fixtures", () => {
  test("keeps the basic title-card fixture renderable and deterministic", () => {
    const fixtureRoot = join("test", "fixtures", "hyperframes", "basic-title-card")
    const indexPath = join(fixtureRoot, "index.html")
    const metaPath = join(fixtureRoot, "meta.json")
    const hyperframesPath = join(fixtureRoot, "hyperframes.json")

    expect(existsSync(indexPath)).toBe(true)
    expect(existsSync(metaPath)).toBe(true)
    expect(existsSync(hyperframesPath)).toBe(true)

    const html = readFileSync(indexPath, "utf8")
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
      width: number
      height: number
      durationSeconds: number
      fps: number
    }

    expect(html).toContain('data-composition-id="main"')
    expect(html).toContain(`data-width="${meta.width}"`)
    expect(html).toContain(`data-height="${meta.height}"`)
    expect(html).toContain('class="clip"')
    expect(html).toContain("data-start")
    expect(html).toContain("data-duration")
    expect(html).toContain("data-track-index")
    expect(html).toContain("window.__timelines")
    expect(html).toContain("./assets/vendor/gsap.min.js")
    expect(html).toContain("window.gsap.timeline({ paused: true })")
    expect(meta).toEqual({
      name: "Basic Title Card",
      durationSeconds: 1,
      width: 640,
      height: 360,
      fps: 30,
    })
  })
})
