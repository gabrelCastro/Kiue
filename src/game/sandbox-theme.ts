import { DEFAULT_THEME, isVisualTheme, type VisualTheme } from './visual-themes';

/* Preferência de tema do Sandbox neste navegador (separada de visual-themes.ts, que o servidor importa). */

const PREF_KEY = 'kiue:sandbox-theme';

/** Último tema escolhido no Sandbox neste navegador (o sandbox novo começa nele). */
export function sandboxThemePref(): VisualTheme {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return isVisualTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveSandboxThemePref(theme: VisualTheme): void {
  try {
    localStorage.setItem(PREF_KEY, theme);
  } catch {
    // sem armazenamento (aba anônima, bloqueio): a escolha vale só nesta sessão
  }
}
