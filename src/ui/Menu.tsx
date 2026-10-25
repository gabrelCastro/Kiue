import { useEffect, useRef, useState } from 'preact/hooks';
import type { LockReason } from '../game/controller';
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
  const next = nextLevel(ctrl);
  const started = CATALOG.some((l) => (ctrl.progress[l.id]?.stars ?? 0) > 0);
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
              <button class="btn primary" onClick={() => ctrl.startLevel((next?.level ?? CATALOG[0]).id)}>
                {started && next ? 'Continuar jogando' : 'Começar pela fase 1'}
              </button>
              <button class="btn" onClick={() => ctrl.startLevel('sandbox')}>
                Abrir o sandbox
              </button>
            </div>
          </div>
        </header>
        {started && <ContinueCard next={next} />}
        <GuestBanner />
        <div class="tracks">
          <Track
            track="iniciante"
            title="Trilha Iniciante"
            subtitle="Do zero: filas, fan-out, DLQ, ordem e custo."
            levels={CATALOG.filter((l) => l.track === 'iniciante')}
            next={next?.level.id}
          />
          <Track
            track="certificacao"
            title="Trilha Certificação"
            subtitle="O que cai na prova AWS Developer e Solutions Architect: Lambda, heartbeat, retries do SNS, cotas e limites."
            levels={CATALOG.filter((l) => l.track === 'certificacao')}
            next={next?.level.id}
          />
        </div>
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

type Ctrl = ReturnType<typeof useController>;

/** A próxima fase a jogar: a primeira ainda sem estrela que não depende de terminar outra antes. */
function nextLevel(ctrl: Ctrl): { level: LevelMeta; lock: LockReason | null } | null {
  for (const level of CATALOG) {
    if ((ctrl.progress[level.id]?.stars ?? 0) > 0) continue;
    const lock = ctrl.lockReason(level);
    if (lock !== 'progress') return { level, lock };
  }
  return null;
}

const TRACK_NAME: Record<string, string> = { iniciante: 'Iniciante', certificacao: 'Certificação' };

/** O que falta para liberar uma fase bloqueada pelo progresso. */
function unlockHint(level: LevelMeta): string {
  if (level.track === 'certificacao' && level.index === 1) return 'Termine a fase 5 da Iniciante';
  return `Termine a fase ${level.index - 1}`;
}

/** Para quem já começou: a próxima fase, com o conceito que ela ensina. */
function ContinueCard({ next }: { next: ReturnType<typeof nextLevel> }) {
  const ctrl = useController();
  if (!next) {
    return (
      <section class="continue-card all-done">
        <div class="continue-body">
          <span class="continue-kicker">Trilhas completas</span>
          <h2>Você terminou todas as fases</h2>
          <p class="muted">Monte o que quiser no sandbox, ou volte a uma fase para buscar as 3 estrelas.</p>
        </div>
        <button class="btn primary" onClick={() => ctrl.startLevel('sandbox')}>
          Abrir o sandbox
        </button>
      </section>
    );
  }
  const { level, lock } = next;
  return (
    <section class="continue-card">
      <div class="continue-body">
        <span class="continue-kicker">Continue de onde parou</span>
        <span class="continue-where">
          Trilha {TRACK_NAME[level.track]} · fase {level.index}
        </span>
        <h2>{level.title}</h2>
        <span class="concept-tag">{level.concept}</span>
      </div>
      <button class="btn primary" onClick={() => ctrl.startLevel(level.id)}>
        {lock === 'account' ? 'Criar conta para continuar' : 'Continuar'}
      </button>
    </section>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

type StepState = 'done' | 'next' | 'open' | 'locked' | 'account';

function Track({ track, title, subtitle, levels, next }: { track: string; title: string; subtitle: string; levels: readonly LevelMeta[]; next?: string }) {
  const ctrl = useController();
  const a = useAuth();
  const doneCount = levels.filter((l) => (ctrl.progress[l.id]?.stars ?? 0) > 0).length;
  const stars = levels.reduce((s, l) => s + (ctrl.progress[l.id]?.stars ?? 0), 0);
  const firstLock = ctrl.lockReason(levels[0]);
  const accountLocked = levels.filter((l) => ctrl.lockReason(l) === 'account').length;
  return (
    <section class={`track track-${track}`}>
      <header class="track-head">
        <span class="track-badge">{TRACK_NAME[track]}</span>
        <h2>{title}</h2>
        <p class="muted">{subtitle}</p>
        <div class="track-progress" aria-label={`${doneCount} de ${levels.length} fases concluídas, ${stars} de ${levels.length * 3} estrelas`}>
          <span class="track-bar">
            <span style={{ width: `${(doneCount / levels.length) * 100}%` }} />
          </span>
          <span class="track-count">
            {doneCount}/{levels.length} fases · {stars}/{levels.length * 3} ★
          </span>
        </div>
        {firstLock === 'progress' && (
          <p class="track-lock">
            <LockIcon /> Libera ao terminar a fase 5 da Iniciante
          </p>
        )}
        {accountLocked > 0 && a.status === 'guest' && (
          <p class="track-lock">
            <LockIcon /> {accountLocked === levels.length ? 'Crie uma conta grátis para jogar esta trilha' : `Crie uma conta grátis para liberar as outras ${accountLocked} fases`}
          </p>
        )}
      </header>
      <ol class="trail">
        {levels.map((l) => {
          const lock = ctrl.lockReason(l);
          const p = ctrl.progress[l.id];
          // fase que pede conta continua clicável: o clique abre o cadastro
          const needsAccount = lock === 'account';
          const state: StepState = p?.stars && !lock ? 'done' : l.id === next && !lock ? 'next' : needsAccount ? 'account' : lock ? 'locked' : 'open';
          return (
            <li class={`trail-step is-${state}`} key={l.id}>
              <span class="trail-dot" aria-hidden="true">
                {state === 'done' ? <CheckIcon /> : state === 'locked' || state === 'account' ? <LockIcon /> : l.index}
              </span>
              <button
                onPointerEnter={() => ctrl.prefetchLevel(l.id)}
                onFocus={() => ctrl.prefetchLevel(l.id)}
                class={`level-card ${lock ? 'locked' : ''} ${needsAccount ? 'needs-account' : ''} ${state === 'done' ? 'done' : ''} ${state === 'next' ? 'next' : ''}`}
                disabled={lock === 'progress' || (needsAccount && a.status !== 'guest')}
                onClick={() => ctrl.startLevel(l.id)}
              >
                <span class="lc-body">
                  <span class="lc-title">
                    <span class="lc-num">{l.index}.</span> {l.title}
                  </span>
                  <span class="concept-tag">{l.concept}</span>
                </span>
                <span class="lc-side">
                  {ctrl.loadingLevel === l.id ? (
                    <span class="muted small">Carregando…</span>
                  ) : state === 'done' ? (
                    <Stars n={p!.stars} />
                  ) : state === 'next' ? (
                    <span class="lc-play">Jogar ▸</span>
                  ) : needsAccount ? (
                    a.status === 'loading' ? null : <span class="lock-tag">Requer conta</span>
                  ) : lock ? (
                    <span class="lc-hint">{unlockHint(l)}</span>
                  ) : (
                    <Stars n={0} />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
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
