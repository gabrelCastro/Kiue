import { useEffect, useState } from 'preact/hooks';
import { GLOSSARY } from '../game/glossary';
import { useController } from './hooks';
import { LevelScreen } from './LevelScreen';
import { Menu } from './Menu';
import { prefetchScene } from './scene-loader';

export function App() {
  const ctrl = useController();
  useEffect(prefetchScene, []);
  return (
    <>
      {ctrl.screen === 'menu' ? <Menu /> : <LevelScreen />}
      {ctrl.showGlossary && <Glossary />}
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
