import { describe, expect, test } from "bun:test"
import { getLegacyUserDataDirs } from "./app-identity"

describe("Ripple app identity", () => {
  test("keeps production and development legacy userData migrations separate", () => {
    expect(getLegacyUserDataDirs(false)).toEqual(["1Code"])
    expect(getLegacyUserDataDirs(true)).toEqual(["Agents Dev"])
  })
})
