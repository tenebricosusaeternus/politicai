export type ThemeName = "light" | "dark"

const THEME_STORAGE_KEY = "politicai-theme"

export function getStoredTheme(): ThemeName {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function initTheme() {
  applyTheme(getStoredTheme())
}
