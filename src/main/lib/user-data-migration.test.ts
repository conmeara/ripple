import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  hasRealUserDataState,
  migrateLegacyUserData,
} from "./user-data-migration"

let tmpRoots: string[] = []

function makeTmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ripple-user-data-"))
  tmpRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true })
  }
  tmpRoots = []
})

describe("legacy userData migration", () => {
  test("copies safe legacy state into an empty Ripple destination", () => {
    const root = makeTmpRoot()
    const legacy = join(root, "1Code")
    const destination = join(root, "Ripple")

    mkdirSync(join(legacy, "data"), { recursive: true })
    writeFileSync(join(legacy, "data", "agents.db"), "db")
    writeFileSync(join(legacy, "auth.dat.json"), "{}")
    mkdirSync(join(legacy, "Local Storage", "leveldb"), { recursive: true })
    writeFileSync(join(legacy, "Local Storage", "leveldb", "000003.log"), "local")
    writeFileSync(join(legacy, "SingletonLock"), "stale")

    const result = migrateLegacyUserData({
      destinationPath: destination,
      legacyPaths: [legacy],
      appVersion: "0.0.72",
      validateAuth: () => true,
    })

    expect(result.migrated).toBe(true)
    expect(result.copiedPaths).toContain("data/agents.db")
    expect(result.copiedPaths).toContain("auth.dat.json")
    expect(result.copiedPaths).toContain("Local Storage")
    expect(result.authReadable).toBe(true)
    expect(existsSync(join(destination, "data", "agents.db"))).toBe(true)
    expect(existsSync(join(destination, "Local Storage", "leveldb", "000003.log"))).toBe(true)
    expect(existsSync(join(destination, "SingletonLock"))).toBe(false)

    const marker = JSON.parse(readFileSync(join(destination, "ripple-migration.json"), "utf8"))
    expect(marker.sourcePath).toBe(legacy)
    expect(marker.appVersion).toBe("0.0.72")
    expect(marker.copiedPaths).toContain("data/agents.db")
    expect(marker.authReadable).toBe(true)
  })

  test("does not overwrite an existing Ripple destination", () => {
    const root = makeTmpRoot()
    const legacy = join(root, "1Code")
    const destination = join(root, "Ripple")

    mkdirSync(join(legacy, "data"), { recursive: true })
    writeFileSync(join(legacy, "data", "agents.db"), "legacy")
    mkdirSync(join(destination, "data"), { recursive: true })
    writeFileSync(join(destination, "data", "agents.db"), "existing")

    const result = migrateLegacyUserData({
      destinationPath: destination,
      legacyPaths: [legacy],
    })

    expect(result).toMatchObject({
      migrated: false,
      skippedReason: "destination-has-state",
    })
  })

  test("ignores singleton locks and caches when detecting real destination state", () => {
    const root = makeTmpRoot()
    const destination = join(root, "Ripple")

    mkdirSync(join(destination, "GPUCache"), { recursive: true })
    writeFileSync(join(destination, "SingletonLock"), "stale")

    expect(hasRealUserDataState(destination)).toBe(false)
  })

  test("does not rerun after a migration marker exists", () => {
    const root = makeTmpRoot()
    const legacy = join(root, "1Code")
    const destination = join(root, "Ripple")

    mkdirSync(join(legacy, "data"), { recursive: true })
    writeFileSync(join(legacy, "data", "agents.db"), "legacy")
    mkdirSync(destination, { recursive: true })
    writeFileSync(join(destination, "ripple-migration.json"), "{}")

    const result = migrateLegacyUserData({
      destinationPath: destination,
      legacyPaths: [legacy],
    })

    expect(result).toMatchObject({
      migrated: false,
      skippedReason: "destination-has-state",
    })
    expect(existsSync(join(destination, "data", "agents.db"))).toBe(false)
  })
})
