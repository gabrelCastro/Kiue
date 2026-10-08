import type { Level } from '../game/level-types';
import { LEVELS } from '../game/levels';
import { useController } from './hooks';
import { Stars } from './Result';

export function Menu() {
  const ctrl = useController();
  const totalStars = Object.values(ctrl.progress).reduce((s, p) => s + p.stars, 0);
  return (
    <div class="menu">
      <header class="menu-hero">
        <div class="logo" aria-hidden="true">
          <span class="cube c1" />
          <span class="cube c2" />
          <span class="cube c3" />
        </div>
        <h1>SQSLearn</h1>
        <p>Aprenda Amazon SQS e SNS montando arquiteturas e vendo as mensagens circularem.</p>
        <div class="menu-meta">
          <span>
            ★ {totalStars} / {LEVELS.length * 3}
          </span>
          <button class="btn ghost" onClick={() => ctrl.setGlossary(true)}>
            Glossário
          </button>
          <button class="btn ghost" onClick={() => ctrl.startLevel('sandbox')}>
            Sandbox
          </button>
        </div>
      </header>
      <Track title="Trilha Iniciante" subtitle="Do zero: filas, fan-out, DLQ, ordem e custo." levels={LEVELS.filter((l) => l.track === 'iniciante')} />
      <Track
        title="Trilha Certificação"
        subtitle="Detalhes que caem na prova AWS Developer / Solutions Architect: Lambda, heartbeat, retries do SNS, cotas e limites. Libera após a fase 5 da trilha Iniciante."
        levels={LEVELS.filter((l) => l.track === 'certificacao')}
      />
      <footer class="menu-footer muted small">
        Simulação didática: tempos e limites são reduzidos para caber num jogo, mas as regras seguem o comportamento do SQS/SNS.{' '}
        <button
          class="linklike"
          onClick={() => {
            if (confirm('Apagar todo o progresso salvo neste navegador?')) ctrl.resetProgress();
          }}
        >
          Apagar progresso
        </button>
      </footer>
    </div>
  );
}

function Track({ title, subtitle, levels }: { title: string; subtitle: string; levels: Level[] }) {
  const ctrl = useController();
  return (
    <section class="track">
      <h2>{title}</h2>
      <p class="muted">{subtitle}</p>
      <div class="level-grid">
        {levels.map((l) => {
          const unlocked = ctrl.isUnlocked(l);
          const p = ctrl.progress[l.id];
          return (
            <button class={`level-card ${unlocked ? '' : 'locked'} ${p?.stars ? 'done' : ''}`} disabled={!unlocked} onClick={() => ctrl.startLevel(l.id)}>
              <span class="lc-num">{l.index}</span>
              <span class="lc-title">{l.title}</span>
              <span class="lc-concept">{l.concept}</span>
              <span class="lc-stars">{unlocked ? <Stars n={p?.stars ?? 0} /> : <span class="muted small">bloqueada</span>}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
