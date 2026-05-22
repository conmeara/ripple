import { describe, expect, test } from "bun:test"
import {
  getAppearanceThemeLabel,
  getVisibleAppearanceThemes,
  isVisibleAppearanceThemeId,
  normalizeVisibleAppearanceThemeId,
} from "./appearance-theme-options"

describe("appearance theme options", () => {
  test("exposes only the Cool and Warm pair for each system appearance", () => {
    const lightThemes = getVisibleAppearanceThemes("light")
    const darkThemes = getVisibleAppearanceThemes("dark")

    expect(lightThemes.map((theme) => theme.id)).toEqual([
      "cursor-light",
      "claude-light",
    ])
    expect(lightThemes.map((theme) => getAppearanceThemeLabel(theme))).toEqual([
      "Cool",
      "Warm",
    ])

    expect(darkThemes.map((theme) => theme.id)).toEqual([
      "cursor-dark",
      "claude-dark",
    ])
    expect(darkThemes.map((theme) => getAppearanceThemeLabel(theme))).toEqual([
      "Cool",
      "Warm",
    ])
  })

  test("keeps hidden theme IDs out of the user-facing appearance picker", () => {
    expect(isVisibleAppearanceThemeId("ripple-light")).toBe(false)
    expect(isVisibleAppearanceThemeId("cursor-midnight")).toBe(false)
    expect(isVisibleAppearanceThemeId("vitesse-dark")).toBe(false)
    expect(isVisibleAppearanceThemeId("cursor-light", "light")).toBe(true)
    expect(isVisibleAppearanceThemeId("cursor-light", "dark")).toBe(false)
  })

  test("falls hidden saved values back to Cool for the matching appearance", () => {
    expect(normalizeVisibleAppearanceThemeId("ripple-light", "light")).toBe(
      "cursor-light",
    )
    expect(normalizeVisibleAppearanceThemeId("cursor-midnight", "dark")).toBe(
      "cursor-dark",
    )
  })
})
