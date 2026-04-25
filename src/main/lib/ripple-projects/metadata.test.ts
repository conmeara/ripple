import { describe, expect, test } from "bun:test"
import {
  discoverDeclaredCompositions,
  parseHyperframesMetadata,
} from "./metadata"

describe("HyperFrames project metadata", () => {
  test("rejects malformed project metadata", () => {
    expect(() => parseHyperframesMetadata("{ nope")).toThrow("hyperframes.json is malformed")
  })

  test("discovers every declared composition path", () => {
    const metadata = parseHyperframesMetadata(JSON.stringify({
      name: "Launch",
      entry: "index.html",
      width: 1920,
      height: 1080,
      compositions: ["index.html", "compositions/lower-third.html"],
    }))

    expect(
      discoverDeclaredCompositions(metadata, {
        entry: "index.html",
        width: 1920,
        height: 1080,
      }).map((composition) => ({
        name: composition.name,
        filePath: composition.filePath,
        dataCompositionId: composition.dataCompositionId,
        parentDataCompositionId: composition.parentDataCompositionId,
      })),
    ).toEqual([
      {
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        parentDataCompositionId: undefined,
      },
      {
        name: "Lower Third",
        filePath: "compositions/lower-third.html",
        dataCompositionId: "lower-third",
        parentDataCompositionId: "main",
      },
    ])
  })

  test("uses object metadata dimensions when compositions declare them", () => {
    const metadata = parseHyperframesMetadata(JSON.stringify({
      entry: "index.html",
      width: 1920,
      height: 1080,
      compositions: [
        {
          name: "Ticker",
          filePath: "compositions/ticker.html",
          dataCompositionId: "ticker",
          width: 1920,
          height: 160,
          kind: "external",
          parentDataCompositionId: "main",
        },
      ],
    }))

    expect(
      discoverDeclaredCompositions(metadata, {
        entry: "index.html",
        width: 1920,
        height: 1080,
      }).find((composition) => composition.dataCompositionId === "ticker"),
    ).toMatchObject({
      name: "Ticker",
      filePath: "compositions/ticker.html",
      width: 1920,
      height: 160,
      parentDataCompositionId: "main",
    })
  })
})
