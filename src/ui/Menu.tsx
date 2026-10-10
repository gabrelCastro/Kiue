import type { Level } from '../game/level-types';
import { LEVELS } from '../game/levels';
import { auth } from '../auth/store';
import { AccountButton } from './auth/AccountButton';
import { useAuth } from './auth/AuthDialog';
import { useController } from './hooks';
import { Stars } from './Result';

export function Menu() {
  const ctrl = useController();
  const totalStars = Object.values(ctrl.progress).reduce((s, p) => s + p.stars, 0);
  return (
    <div class="menu-shell">
      <nav class="console-nav" aria-label="Navegação">
        <span class="brand">
          <span class="logo" aria-hidden="true">
            <span class="cube c1" />
            <span class="cube c2" />
            <span class="cube c3" />
          </span>
          Kiuê
        </span>
        <span class="spacer" />
        <span class="star-count" title="Estrelas conquistadas">
          ★ {totalStars} / {LEVELS.length * 3}
        </span>
        <button class="btn" onClick={() => ctrl.setGlossary(true)}>
          Glossário
        </button>
        <button class="btn" onClick={() => ctrl.startLevel('sandbox')}>
          Sandbox
        </button>
        <AccountButton />
      </nav>
      <div class="menu">
        <header class="menu-hero">
          <h1>Kiuê</h1>
          <p>Aprenda Amazon SQS e SNS montando arquiteturas e vendo as mensagens circularem.</p>
        </header>
        <GuestBanner />
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
    </div>
  );
}

function GuestBanner() {
  const a = useAuth();
  if (a.status === 'signed-in' || a.status === 'loading') return null;
  return (
    <div class="guest-banner" role="note">
      <div>
        <b>Você está jogando como visitante.</b>{' '}
        {a.status === 'offline'
          ? 'O servidor de contas está fora do ar: as fases 1 e 2 e o sandbox limitado continuam abertos.'
          : 'As fases 1 e 2 e um sandbox limitado são abertos. Crie uma conta grátis para liberar as 22 fases e o sandbox completo.'}
      </div>
      {a.status === 'guest' && (
        <div class="row gap">
          <button class="btn" onClick={() => auth.open('login')}>
            Entrar
          </button>
          <button class="btn primary" onClick={() => auth.open('register')}>
            Criar conta
          </button>
        </div>
      )}
    </div>
  );
}

function Track({ title, subtitle, levels }: { title: string; subtitle: string; levels: Level[] }) {
  const ctrl = useController();
  const a = useAuth();
  return (
    <section class="track">
      <h2>{title}</h2>
      <p class="muted">{subtitle}</p>
      <div class="level-grid">
        {levels.map((l) => {
          const lock = ctrl.lockReason(l);
          const p = ctrl.progress[l.id];
          // fase que pede conta continua clicável: o clique abre o cadastro
          const needsAccount = lock === 'account';
          return (
            <button
              class={`level-card ${lock ? 'locked' : ''} ${needsAccount ? 'needs-account' : ''} ${p?.stars && !lock ? 'done' : ''}`}
              disabled={lock === 'progress' || (needsAccount && a.status !== 'guest')}
              onClick={() => ctrl.startLevel(l.id)}
            >
              <span class="lc-num">{l.index}</span>
              <span class="lc-title">{l.title}</span>
              <span class="lc-concept">{l.concept}</span>
              <span class="lc-stars">
                {!lock ? (
                  <Stars n={p?.stars ?? 0} />
                ) : needsAccount ? (
                  a.status === 'loading' ? null : <span class="lock-tag">Requer conta</span>
                ) : (
                  <span class="muted small">bloqueada</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
