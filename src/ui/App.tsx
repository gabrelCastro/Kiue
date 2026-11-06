import { useEffect, useState } from 'preact/hooks';
import { useController } from './hooks';
import { LevelScreen } from './LevelScreen';
import { Menu } from './Menu';
import { StudyPanel, StudyScreen } from './Study';
import { AuthDialog } from './auth/AuthDialog';
import { usePhonePortrait } from './device';
import { prefetchScene } from './scene-loader';

export function App() {
  const ctrl = useController();
  useEffect(prefetchScene, []);
  return (
    <>
      {ctrl.screen === 'menu' ? <Menu /> : ctrl.screen === 'study' ? <StudyScreen /> : <LevelScreen />}
      {ctrl.screen === 'level' && ctrl.study.panel && <StudyPanel />}
      <AuthDialog />
      <RotateHint onLevel={ctrl.screen === 'level'} />
      {ctrl.screen !== 'level' && ctrl.toast && <div class={`toast floating ${ctrl.toast.kind}`}>{ctrl.toast.text}</div>}
    </>
  );
}

const HINT_KEY = 'kiue:rotate-hint';

/** Celular em pé: avisa uma vez por sessão que o jogo fica melhor deitado (não bloqueia nada). */
function RotateHint({ onLevel }: { onLevel: boolean }) {
  const portrait = usePhonePortrait();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const show = portrait && !dismissed;
  // some sozinho: não fica tapando a tela de quem prefere jogar em pé
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setDismissed(true), 9000);
    return () => clearTimeout(id);
  }, [show]);
  if (!show) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(HINT_KEY, '1');
    } catch {
      /* sem armazenamento: o aviso volta na próxima abertura */
    }
  };
  return (
    <div class={`rotate-hint ${onLevel ? 'on-level' : ''}`} role="status">
      <span class="rotate-icon" aria-hidden="true">⟳</span>
      <span>Para jogar melhor, deite o celular: a cena e os painéis ganham mais espaço.</span>
      <button class="btn" onClick={dismiss}>
        Entendi
      </button>
    </div>
  );
}
