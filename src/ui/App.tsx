import { useEffect, useState } from 'preact/hooks';
import { GLOSSARY } from '../game/glossary';
import { useController } from './hooks';
import { LevelScreen } from './LevelScreen';
import { Menu } from './Menu';
import { AuthDialog } from './auth/AuthDialog';
import { usePhonePortrait } from './device';
import { prefetchScene } from './scene-loader';

export function App() {
  const ctrl = useController();
  useEffect(prefetchScene, []);
  return (
    <>
      {ctrl.screen === 'menu' ? <Menu /> : <LevelScreen />}
      {ctrl.showGlossary && <Glossary />}
      <AuthDialog />
      <RotateHint onLevel={ctrl.screen === 'level'} />
      {ctrl.screen === 'menu' && ctrl.toast && <div class={`toast floating ${ctrl.toast.kind}`}>{ctrl.toast.text}</div>}
    </>
  );
}

function Glossary() {
  const ctrl = useController();
  const [q, setQ] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const entries = GLOSSARY.filter((g) => !q || norm(g.term + g.text).includes(norm(q)));
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && ctrl.setGlossary(false)}>
      <div class="modal glossary" role="dialog" aria-modal="true" aria-labelledby="glossary-title">
        <div class="row between">
          <h2 id="glossary-title">Glossário</h2>
          <button class="btn ghost" onClick={() => ctrl.setGlossary(false)} aria-label="Fechar">
            ✕
          </button>
        </div>
        <input class="search" placeholder="Buscar termo…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} autoFocus />
        <dl>
          {entries.map((g) => (
            <div class="gl-entry" key={g.term}>
              <dt>
                {g.term} <span class={`svc svc-${g.service.toLowerCase()}`}>{g.service}</span>
              </dt>
              <dd>{g.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
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
