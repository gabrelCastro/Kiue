import { VISUAL_THEMES } from '../game/visual-themes';
import { useController } from './hooks';

/**
 * Painel "Tema" do Sandbox: troca o visual do produtor e do consumidor (Indústria, Fazenda…).
 * A montagem não muda; o tema vai junto quando o sandbox é salvo e vira o padrão deste navegador.
 */
export function SandboxTheme() {
  const ctrl = useController();
  const current = ctrl.visualTheme;
  return (
    <div class="panel sandbox-theme">
      <h3 id="sandbox-theme-title">Tema</h3>
      <div class="theme-grid" role="group" aria-labelledby="sandbox-theme-title">
        {VISUAL_THEMES.map((t) => (
          <button key={t.id} class={current === t.id ? 'active' : ''} aria-pressed={current === t.id} onClick={() => ctrl.setSandboxTheme(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
