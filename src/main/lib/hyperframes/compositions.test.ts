import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  mergeCliAndDeclaredCompositions,
  parseHyperframesCompositionsJson,
} from "./compositions"
import type { ScaffoldCompositionMetadata } from "../ripple-projects/types"

const tempDirs: string[] = []

async function makeProjectDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ripple-hyperframes-compositions-"))
  tempDirs.push(dir)
  await mkdir(join(dir, "compositions"), { recursive: true })
  await writeFile(join(dir, "index.html"), "<!doctype html>", "utf8")
  await writeFile(join(dir, "compositions", "lower-third.html"), "<template></template>", "utf8")
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("HyperFrames composition discovery", () => {
  test("parses the installed CLI JSON shape", () => {
    expect(parseHyperframesCompositionsJson(JSON.stringify({
      compositions: [
        {
          id: "main",
          duration: 180,
          width: 1920,
          height: 1080,
          elementCount: 4,
        },
      ],
      _meta: { version: "0.4.28" },
    }))).toEqual([
      {
        id: "main",
        duration: 180,
        width: 1920,
        height: 1080,
        elementCount: 4,
        source: null,
      },
    ])
  })

  test("merges CLI facts with declared file paths", async () => {
    const projectPath = await makeProjectDir()
    const declared: ScaffoldCompositionMetadata[] = [
      {
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
        kind: "root",
      },
      {
        name: "Lower Third",
        filePath: "compositions/lower-third.html",
        dataCompositionId: "lower-third",
        width: 1920,
        height: 220,
        kind: "external",
        parentDataCompositionId: "main",
      },
    ]

    expect(
      mergeCliAndDeclaredCompositions({
        projectPath,
        entry: "index.html",
        width: 1920,
        height: 1080,
        declared,
        cliCompositions: [
          {
            id: "main",
            duration: 180,
            width: 1920,
            height: 1080,
            elementCount: 4,
          },
          {
            id: "lower-third",
            duration: 90,
            width: 1920,
            height: 240,
            elementCount: 3,
            source: "./compositions/lower-third.html",
          },
        ],
      }).map((composition) => ({
        filePath: composition.filePath,
        dataCompositionId: composition.dataCompositionId,
        height: composition.height,
        parentDataCompositionId: composition.parentDataCompositionId,
      })),
    ).toEqual([
      {
        filePath: "index.html",
        dataCompositionId: "main",
        height: 1080,
        parentDataCompositionId: undefined,
      },
      {
        filePath: "compositions/lower-third.html",
        dataCompositionId: "lower-third",
        height: 240,
        parentDataCompositionId: "main",
      },
    ])
  })

  test("does not keep declared composition paths that are not project files", async () => {
    const projectPath = await makeProjectDir()
    const declared: ScaffoldCompositionMetadata[] = [
      {
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
        kind: "root",
      },
      {
        name: "Missing",
        filePath: "compositions/missing.html",
        dataCompositionId: "missing",
        width: 1920,
        height: 1080,
        kind: "external",
        parentDataCompositionId: "main",
      },
    ]

    expect(
      mergeCliAndDeclaredCompositions({
        projectPath,
        entry: "index.html",
        width: 1920,
        height: 1080,
        declared,
        cliCompositions: [
          {
            id: "main",
            duration: 6,
            width: 1920,
            height: 1080,
            elementCount: 4,
          },
        ],
      }).map((composition) => composition.filePath),
    ).toEqual(["index.html"])
  })

  test("rejects declared composition paths outside the project", async () => {
    const projectPath = await makeProjectDir()

    expect(() =>
      mergeCliAndDeclaredCompositions({
        projectPath,
        entry: "index.html",
        width: 1920,
        height: 1080,
        declared: [
          {
            name: "Outside",
            filePath: "../outside.html",
            dataCompositionId: "outside",
            width: 1920,
            height: 1080,
            kind: "external",
            parentDataCompositionId: "main",
          },
        ],
        cliCompositions: [],
      }),
    ).toThrow("Path traversal")
  })
})
