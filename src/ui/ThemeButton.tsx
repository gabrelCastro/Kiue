import { cycleTheme, useTheme } from './theme-mode';

const LABEL = { system: 'Tema: igual ao sistema', light: 'Tema: claro', dark: 'Tema: noturno' } as const;
const ICON = { system: '◐', light: '☀', dark: '☾' } as const;

/** Chave de tema: alterna entre sistema, claro e noturno. */
export function ThemeButton({ withText = false }: { withText?: boolean }) {
  const { pref } = useTheme();
  const next = pref === 'system' ? 'claro' : pref === 'light' ? 'noturno' : 'igual ao sistema';
  return (
    <button class="btn ghost theme-btn" onClick={cycleTheme} title={`${LABEL[pref]}. Clique para: ${next}`} aria-label={`${LABEL[pref]}. Trocar para ${next}`}>
      <span aria-hidden="true">{ICON[pref]}</span>
      {withText && <span>{LABEL[pref].replace('Tema: ', 'Tema ')}</span>}
    </button>
  );
}
