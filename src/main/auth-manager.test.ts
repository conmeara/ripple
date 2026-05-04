import { afterEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let userDataPath = ""
let decryptCalls = 0
let encryptionAvailabilityChecks = 0

mock.module("electron", () => ({
  app: {
    getPath: () => userDataPath,
    getVersion: () => "0.0.0-test",
  },
  safeStorage: {
    isEncryptionAvailable: () => {
      encryptionAvailabilityChecks += 1
      return true
    },
    decryptString: () => {
      decryptCalls += 1
      throw new Error("safeStorage should not be read when hosted auth is disabled")
    },
    encryptString: (value: string) => Buffer.from(value),
  },
}))

const { AuthManager } = await import("./auth-manager")

const originalRippleApiUrl = process.env.MAIN_VITE_RIPPLE_API_URL
const originalLegacyApiUrl = process.env.MAIN_VITE_API_URL
const tmpRoots: string[] = []

function makeTmpRoot(): string {
  const root = join(
    tmpdir(),
    `ripple-auth-manager-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(root, { recursive: true })
  tmpRoots.push(root)
  return root
}

afterEach(() => {
  if (originalRippleApiUrl === undefined) {
    delete process.env.MAIN_VITE_RIPPLE_API_URL
  } else {
    process.env.MAIN_VITE_RIPPLE_API_URL = originalRippleApiUrl
  }

  if (originalLegacyApiUrl === undefined) {
    delete process.env.MAIN_VITE_API_URL
  } else {
    process.env.MAIN_VITE_API_URL = originalLegacyApiUrl
  }

  for (const root of tmpRoots.splice(0)) {
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

describe("AuthManager local-first startup", () => {
  test("does not decrypt saved hosted auth when no hosted API is configured", async () => {
    userDataPath = makeTmpRoot()
    writeFileSync(join(userDataPath, "auth.dat"), Buffer.from("stale-hosted-auth"))
    decryptCalls = 0
    encryptionAvailabilityChecks = 0
    delete process.env.MAIN_VITE_RIPPLE_API_URL
    delete process.env.MAIN_VITE_API_URL

    const manager = new AuthManager(true)

    expect(manager.isAuthenticated()).toBe(false)
    expect(manager.getUser()).toBeNull()
    expect(manager.getAuth()).toBeNull()
    expect(await manager.getValidToken()).toBeNull()
    expect(await manager.refresh()).toBe(false)
    expect(encryptionAvailabilityChecks).toBe(0)
    expect(decryptCalls).toBe(0)
  })
})
