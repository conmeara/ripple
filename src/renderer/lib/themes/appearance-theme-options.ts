import type { VSCodeFullTheme } from "../atoms"
import { BUILTIN_THEMES, normalizeBuiltinThemeId } from "./builtin-themes"

type ThemeType = VSCodeFullTheme["type"]

const VISIBLE_APPEARANCE_THEME_IDS = {
  light: ["cursor-light", "claude-light"],
  dark: ["cursor-dark", "claude-dark"],
} as const satisfies Record<ThemeType, readonly string[]>

const APPEARANCE_THEME_LABELS: Record<string, string> = {
  "cursor-light": "Cool",
  "cursor-dark": "Cool",
  "claude-light": "Warm",
  "claude-dark": "Warm",
}

const FALLBACK_APPEARANCE_THEME_IDS: Record<ThemeType, string> = {
  light: VISIBLE_APPEARANCE_THEME_IDS.light[0],
  dark: VISIBLE_APPEARANCE_THEME_IDS.dark[0],
}

export function getVisibleAppearanceThemes(type: ThemeType): VSCodeFullTheme[] {
  return VISIBLE_APPEARANCE_THEME_IDS[type]
    .map((themeId) => BUILTIN_THEMES.find((theme) => theme.id === themeId))
    .filter((theme): theme is VSCodeFullTheme => Boolean(theme))
}

export function isVisibleAppearanceThemeId(
  themeId: string,
  type?: ThemeType,
): boolean {
  const normalizedThemeId = normalizeBuiltinThemeId(themeId)

  if (type) {
    return (VISIBLE_APPEARANCE_THEME_IDS[type] as readonly string[]).includes(
      normalizedThemeId,
    )
  }

  return Object.values(VISIBLE_APPEARANCE_THEME_IDS).some((themeIds) =>
    (themeIds as readonly string[]).includes(normalizedThemeId),
  )
}

export function normalizeVisibleAppearanceThemeId(
  themeId: string,
  type: ThemeType,
): string {
  const normalizedThemeId = normalizeBuiltinThemeId(themeId)

  if (isVisibleAppearanceThemeId(normalizedThemeId, type)) {
    return normalizedThemeId
  }

  return FALLBACK_APPEARANCE_THEME_IDS[type]
}

export function getAppearanceThemeLabel(
  theme: VSCodeFullTheme | null | undefined,
  options: { includeType?: boolean } = {},
): string {
  if (!theme) return "Select"

  const label = APPEARANCE_THEME_LABELS[theme.id] ?? theme.name
  if (!options.includeType) return label

  return `${label} ${theme.type === "dark" ? "Dark" : "Light"}`
}
