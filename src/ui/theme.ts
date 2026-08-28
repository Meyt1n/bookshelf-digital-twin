export type ThemeId = 'aurora' | 'contrast' | 'venue'

const STORAGE_KEY = 'shelf-twin-theme'
const THEMES: ThemeId[] = ['aurora', 'contrast', 'venue']

function isThemeId(value: string | null): value is ThemeId {
  return value !== null && (THEMES as string[]).includes(value)
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // private browsing / quota — ignore
  }
}

export function getTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isThemeId(stored)) return stored
  } catch {
    // ignore
  }
  return 'aurora'
}

export function cycleTheme(): ThemeId {
  const current = getTheme()
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]
  applyTheme(next)
  return next
}

/** 启动时恢复已保存主题 */
export function initTheme(): void {
  applyTheme(getTheme())
}
