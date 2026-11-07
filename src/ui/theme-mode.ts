import { useEffect, useReducer } from 'preact/hooks';
import { setThemeMode, type ThemeMode } from '../theme';

/**
 * Modo claro/noturno. A preferência ("sistema", "claro" ou "noturno") fica neste navegador; o modo
 * resolvido vai para `data-theme` no <html> (o CSS troca os tokens) e para o `theme.ts` (a cena 3D
 * lê as cores dele ao ser montada). O index.html já aplica o modo antes da primeira pintura.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'kiue:theme';
const ORDER: ThemePref[] = ['system', 'light', 'dark'];
const listeners = new Set<() => void>();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref = readPref();

export function themePref(): ThemePref {
  return pref;
}

export function resolvedTheme(): ThemeMode {
  return pref === 'system' ? (media?.matches ? 'dark' : 'light') : pref;
}

/** Aplica o modo atual na página e na paleta da cena, e avisa quem precisa remontar. */
export function applyTheme(): void {
  const mode = resolvedTheme();
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#161a22' : '#ffffff');
  setThemeMode(mode);
  for (const fn of listeners) fn();
}

/** Próxima preferência: sistema → claro → noturno → sistema. */
export function cycleTheme(): void {
  pref = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // sem storage: vale só nesta sessão
  }
  applyTheme();
}

media?.addEventListener('change', () => pref === 'system' && applyTheme());

/** Re-renderiza quando o modo muda; devolve a preferência e o modo resolvido. */
export function useTheme(): { pref: ThemePref; mode: ThemeMode } {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force as () => void);
    return () => void listeners.delete(force as () => void);
  }, []);
  return { pref, mode: resolvedTheme() };
}
