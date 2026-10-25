import { useEffect, useRef, useState } from 'preact/hooks';
import { CATALOG, type LevelMeta } from '../game/level-catalog';
import { auth } from '../auth/store';
import { AccountButton } from './auth/AccountButton';
import { useAuth } from './auth/AuthDialog';
import { useController } from './hooks';
import { SavedSandboxes } from './SavedSandboxes';
import { Stars } from './Result';

export function Menu() {
  const ctrl = useController();
  usePrefetchNext();
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
          ★ {totalStars} / {CATALOG.length * 3}
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
          <Showcase />
          <div class="hero-copy">
            <span class="hero-kicker">Amazon SQS e SNS na prática</span>
            <h1>Kiuê</h1>
            <p>Monte arquiteturas de mensageria e veja cada mensagem sair do produtor, esperar na fila e ser processada pelos consumidores.</p>
            <div class="hero-actions">
              <button class="btn primary" onClick={() => ctrl.startLevel(CATALOG[0].id)}>
                Começar pela fase 1
              </button>
              <button class="btn" onClick={() => ctrl.startLevel('sandbox')}>
                Abrir o sandbox
              </button>
            </div>
          </div>
        </header>
        <GuestBanner />
        <Track title="Trilha Iniciante" subtitle="Do zero: filas, fan-out, DLQ, ordem e custo." levels={CATALOG.filter((l) => l.track === 'iniciante')} />
        <Track
          title="Trilha Certificação"
          subtitle="Detalhes que caem na prova AWS Developer / Solutions Architect: Lambda, heartbeat, retries do SNS, cotas e limites. Libera após a fase 5 da trilha Iniciante."
          levels={CATALOG.filter((l) => l.track === 'certificacao')}
        />
        <SavedSandboxes />
        <footer class="menu-footer muted small">
          Simulação didática: tempos e limites são reduzidos para caber num jogo, mas as regras seguem o comportamento do SQS/SNS.{' '}
          <button
            class="linklike"
            onClick={() => {
              const where = auth.status === 'signed-in' ? 'da sua conta' : 'salvo neste navegador';
              if (confirm(`Apagar todo o progresso ${where}? Os sandboxes salvos continuam.`)) ctrl.resetProgress();
            }}
          >
            Apagar progresso
          </button>
        </footer>
      </div>
    </div>
  );
}

/** No menu, já busca a próxima fase a jogar (a primeira liberada e ainda sem estrela). */
function usePrefetchNext() {
  const ctrl = useController();
  const next = ctrl.access === 'member' ? CATALOG.find((l) => !ctrl.progress[l.id]?.stars && ctrl.isUnlocked(l)) : undefined;
  useEffect(() => {
    if (next) ctrl.prefetchLevel(next.id);
  }, [ctrl, next?.id]);
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

function Track({ title, subtitle, levels }: { title: string; subtitle: string; levels: readonly LevelMeta[] }) {
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
              onPointerEnter={() => ctrl.prefetchLevel(l.id)}
              onFocus={() => ctrl.prefetchLevel(l.id)}
              class={`level-card ${lock ? 'locked' : ''} ${needsAccount ? 'needs-account' : ''} ${p?.stars && !lock ? 'done' : ''}`}
              disabled={lock === 'progress' || (needsAccount && a.status !== 'guest')}
              onClick={() => ctrl.startLevel(l.id)}
            >
              <span class="lc-num">{l.index}</span>
              <span class="lc-title">{l.title}</span>
              <span class="lc-concept">{l.concept}</span>
              <span class="lc-stars">
                {ctrl.loadingLevel === l.id ? (
                  <span class="muted small">Carregando…</span>
                ) : !lock ? (
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

/** Tela estreita: a cena ocupa a largura toda e o texto vai para baixo dela. */
const NARROW = '(max-width: 760px)';

/**
 * Animação da tela inicial (render/showcase.ts): produtor → fila → consumidor com as peças do
 * jogo. three.js chega num chunk separado; até lá, o palco mostra só o fundo.
 */
function Showcase() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const narrow = window.matchMedia(NARROW);
    import('../render/showcase')
      .then((m) => {
        if (cancelled) return;
        dispose = m.mountShowcase(el, { frame: () => (narrow.matches ? 1 : 0.6) });
        setReady(true);
      })
      .catch(() => {
        // sem WebGL ou falha ao baixar: o palco fica só com o fundo
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);
  return (
    <div
      ref={ref}
      class={`hero-stage ${ready ? 'ready' : ''}`}
      role="img"
      aria-label="Animação: o produtor envia mensagens, a fila guarda as que chegam em rajada e os braços robóticos do consumidor processam uma por vez."
    />
  );
}
