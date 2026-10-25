import { useEffect, useRef, useState } from 'preact/hooks';
import { useCompact, useTouchUI } from './device';
import { KIND_LABEL } from '../game/catalog';
import { SPEEDS, type Controller } from '../game/controller';
import type { GoalResult } from '../game/goals';
import { auth } from '../auth/store';
import { AccountButton } from './auth/AccountButton';
import { loadScene } from './scene-loader';
import { Briefing } from './Briefing';
import { describeEvent, fmtTime, type LogLine } from './format';
import { useController, useTicker } from './hooks';
import { Inspector } from './Inspector';
import { ResultModal } from './Result';
import { SandboxFile } from './SandboxFile';

export function LevelScreen() {
  const ctrl = useController();
  const level = ctrl.level!;
  const compact = useCompact();
  useKeyboard();
  useUnsavedGuard();

  if (compact) return <CompactLevel />;

  return (
    <div class="level-screen">
      <TopBar />
      <aside class="left">
        {level.track === 'sandbox' && <SandboxFile />}
        {level.palette.length > 0 && <Palette />}
        {level.goals.length > 0 && <Goals />}
        <ObjectiveCard />
      </aside>
      <main class="stage">
        <SceneHost />
        <StageHint />
        <TouchActions />
      </main>
      <aside class="right">
        <Inspector />
      </aside>
      <footer class="bottom">
        <Metrics />
        <EventLog />
      </footer>
      {ctrl.showBriefing && <Briefing />}
      {ctrl.result && <ResultModal />}
    </div>
  );
}

function SceneHost() {
  const ctrl = useController();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let dispose = () => {};
    void loadScene().then(({ SceneView }) => {
      if (disposed) return;
      const view = new SceneView(ref.current!, ctrl);
      // gancho para testes e2e
      (window as unknown as { __kiue?: object }).__kiue = { ctrl, view, project: view.project.bind(view) };
      ctrl.recenterView = () => view.recenter();
      dispose = () => {
        ctrl.recenterView = () => {};
        view.dispose();
      };
    });
    return () => {
      disposed = true;
      dispose();
    };
  }, [ctrl]);
  return <div class="scene-host" ref={ref} />;
}

function TopBar() {
  const ctrl = useController();
  const level = ctrl.level!;
  const running = ctrl.mode === 'run';
  return (
    <header class="topbar">
      <button class="btn ghost" onClick={() => confirmLeave(ctrl) && ctrl.openMenu()} title="Voltar ao menu">
        ← Menu
      </button>
      <div class="title">
        <span class="level-tag">{level.track === 'sandbox' ? 'Sandbox' : `${level.track === 'iniciante' ? 'Iniciante' : 'Certificação'} ${level.index}`}</span>
        <h1>{level.title}</h1>
        <span class="concept-chip">{level.concept}</span>
      </div>
      <div class="controls">
        {ctrl.mode === 'build' ? (
          <button class="btn run" onClick={() => ctrl.run()}>
            ▶ Rodar
          </button>
        ) : (
          <button class="btn" onClick={() => ctrl.toBuild()}>
            ✎ Construir
          </button>
        )}
        <div class="segmented" role="group" aria-label="Velocidade">
          {SPEEDS.map((s) => (
            <button key={s} class={ctrl.speed === s ? 'active' : ''} onClick={() => ctrl.setSpeed(s)} aria-pressed={ctrl.speed === s}>
              {String(s).replace('.', ',')}×
            </button>
          ))}
        </div>
        <button class="btn ghost" disabled={!running} onClick={() => ctrl.togglePause()}>
          {ctrl.paused ? '▶ Continuar' : '❚❚ Pausar'}
        </button>
        <button class="btn ghost" disabled={!running} onClick={() => ctrl.finishNow()} title="Simula até o fim instantaneamente">
          » Concluir agora
        </button>
      </div>
      <div class="actions">
        {level.track !== 'sandbox' && (
          <button class="btn ghost" onClick={() => ctrl.setBriefing(true)}>
            Briefing
          </button>
        )}
        <button class="btn ghost" onClick={() => ctrl.resetGraph()} title="Volta a fase ao estado inicial">
          Reiniciar
        </button>
        {level.track !== 'sandbox' && ctrl.attempts > 0 && (
          <button class="btn ghost" onClick={() => ctrl.showSolution()}>
            Ver solução
          </button>
        )}
        <button class="btn ghost" onClick={() => ctrl.setGlossary(true)}>
          Glossário
        </button>
        <AccountButton />
      </div>
    </header>
  );
}

function Palette() {
  const ctrl = useController();
  const touch = useTouchUI();
  const level = ctrl.level!;
  const tool = ctrl.tool;
  return (
    <div class="panel palette">
      <h3>Peças</h3>
      <div class="palette-items">
        {level.palette.map((item) => {
          const left = ctrl.paletteRemaining(item);
          const active = tool.type === 'place' && tool.item === item;
          return (
            <button
              class={`palette-item kind-${item.kind} ${active ? 'active' : ''}`}
              disabled={!ctrl.canEdit || left <= 0}
              onClick={() => ctrl.setTool(active ? { type: 'select' } : { type: 'place', item })}
              title={`${KIND_LABEL[item.kind]}: ${touch ? 'toque e depois toque no chão' : 'clique e depois clique no chão'}`}
            >
              <span class={`kind-dot kind-${item.kind}`} />
              <span class="pi-label">{item.label}</span>
              <span class="pi-count">×{left}</span>
            </button>
          );
        })}
      </div>
      {tool.type === 'place' &&
        (touch ? <p class="muted small">Toque no chão para escolher o lugar.</p> : <p class="muted small">Clique no chão para colocar. <kbd>Esc</kbd> cancela.</p>)}
      {level.track === 'sandbox' && ctrl.access === 'guest' && (
        <p class="sandbox-limit small">
          Sandbox limitado para visitantes.{' '}
          <button class="linklike" onClick={() => auth.open('register', { reason: 'Com uma conta, o sandbox libera até 20 filas, 10 tópicos, 20 consumidores e 10 funções Lambda.' })}>
            Crie uma conta
          </button>{' '}
          para liberar todas as peças e salvar seus sandboxes.
        </p>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<GoalResult['status'], string> = { ok: 'cumprido', fail: 'falhou', pending: 'em andamento' };

function Goals() {
  const ctrl = useController();
  useTicker(ctrl.mode === 'run', 250);
  const goals = ctrl.liveGoals();
  return (
    <div class="panel goals">
      <h3>Objetivos</h3>
      <ul>
        {goals.map((g, i) => (
          <li key={i} class={`goal ${g.status}`}>
            <span class={`status-dot ${g.status}`} aria-label={STATUS_LABEL[g.status]} />
            <span class="goal-label">{g.label}</span>
            {g.detail && <span class="goal-detail">{g.detail}</span>}
          </li>
        ))}
      </ul>
      {ctrl.level!.stars.p95 !== undefined || ctrl.level!.stars.apiCalls !== undefined ? (
        <div class="star-targets muted small">
          <div>★ cumprir os objetivos</div>
          <div>★ {ctrl.level!.stars.p95 !== undefined ? `latência p95 ≤ ${ctrl.level!.stars.p95}s` : 'automática'}</div>
          <div>★ {ctrl.level!.stars.apiCalls !== undefined ? `≤ ${ctrl.level!.stars.apiCalls} chamadas de API` : 'automática'}</div>
        </div>
      ) : null}
    </div>
  );
}

function ObjectiveCard() {
  const ctrl = useController();
  const [showHint, setShowHint] = useState(false);
  const level = ctrl.level!;
  return (
    <div class="panel objective">
      <h3>Missão</h3>
      <p>{level.objective}</p>
      {showHint ? (
        <p class="hint"><b>Dica:</b> {level.hint}</p>
      ) : (
        <button class="btn tiny ghost" onClick={() => setShowHint(true)}>
          Mostrar dica
        </button>
      )}
    </div>
  );
}

function StageHint() {
  const ctrl = useController();
  const touch = useTouchUI();
  const tool = ctrl.tool;
  let text: string | null = null;
  if (tool.type === 'connect') text = touch ? 'Toque na peça de destino da conexão.' : 'Clique na peça de destino da conexão (Esc cancela).';
  else if (tool.type === 'place')
    text = touch ? `Toque no chão para escolher o lugar: ${tool.item.label}.` : `Clique no chão para colocar: ${tool.item.label}.`;
  else if (ctrl.mode === 'run' && ctrl.paused) text = 'Pausado.';
  const toast = ctrl.toast;
  return (
    <>
      {text && <div class="stage-hint">{text}</div>}
      {toast && (
        <div key={toast.id} class={`toast ${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
      <Legend />
    </>
  );
}

function Legend() {
  return (
    <div class="legend">
      <span>
        <i class="lg poison" /> venenosa
      </span>
      <span>
        <i class="lg dim" /> atrasada (delay)
      </span>
      <span>
        <i class="lg pad-green" /> processando
      </span>
      <span>
        <i class="lg pad-blue" /> long polling
      </span>
    </div>
  );
}

function Metrics() {
  const ctrl = useController();
  useTicker(ctrl.mode === 'run', 200);
  const sim = ctrl.sim;
  const m = sim?.metrics;
  const item = (label: string, value: string | number, bad = false, title?: string) => (
    <div class={`metric ${bad ? 'bad' : ''}`} title={title}>
      <span class="metric-value">{value}</span>
      <span class="metric-label">{label}</span>
    </div>
  );
  if (!sim || !m) {
    return (
      <div class="metrics idle">
        <span class="muted">Monte a arquitetura e clique em <b>▶ Rodar</b>. As métricas aparecem aqui.</span>
      </div>
    );
  }
  const apiTitle = Object.entries(m.api)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return (
    <div class="metrics">
      {item('tempo', `${fmtTime(sim.now)} / ${sim.options.duration}s`)}
      {item('produzidos', m.produced)}
      {item('processados', m.processed)}
      {item('perdidos', m.lost, m.lost > 0)}
      {item('duplicados', m.duplicatesProcessed, m.duplicatesProcessed > 0)}
      {item('fora de ordem', m.outOfOrder, m.outOfOrder > 0)}
      {item('na DLQ', m.movedToDlq)}
      {item('respostas vazias', m.emptyReceives, false, 'ReceiveMessage que voltou sem mensagens (também é cobrado)')}
      {item('chamadas de API', m.apiCalls, false, apiTitle)}
      {item('latência p95', `${m.latencyPercentile(95).toFixed(1)}s`)}
    </div>
  );
}

function EventLog() {
  const ctrl = useController();
  const [verbose, setVerbose] = useState(false);
  const [open, setOpen] = useState(true);
  useTicker(ctrl.mode === 'run', 300);
  const sim = ctrl.sim;
  const lines: LogLine[] = [];
  if (sim) {
    const source = verbose ? sim.recent : sim.notable;
    for (let i = source.length - 1; i >= 0 && lines.length < 60; i--) {
      const l = describeEvent(source.at(i), ctrl.graph, verbose);
      if (l) lines.push(l);
    }
  }
  return (
    <div class={`panel log ${open ? '' : 'collapsed'}`}>
      <div class="row between">
        <h3>
          <button class="linklike" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? '▾' : '▸'} Log de eventos
          </button>
        </h3>
        <label class="small muted">
          <input type="checkbox" checked={verbose} onChange={(e) => setVerbose((e.target as HTMLInputElement).checked)} /> mostrar tudo
        </label>
      </div>
      {open && (
        <ol class="log-lines" aria-live="off">
          {lines.length === 0 && <li class="muted">Nada importante ainda.</li>}
          {lines.map((l, i) => (
            <li key={i} class={`log-${l.kind}`}>
              <span class="log-t">{fmtTime(l.t)}</span> {l.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Sandbox de quem tem conta com alterações não salvas: pergunta antes de descartar. */
function hasUnsaved(ctrl: Controller): boolean {
  return ctrl.sandboxDirty && auth.status === 'signed-in';
}

function confirmLeave(ctrl: Controller): boolean {
  return !hasUnsaved(ctrl) || confirm('Sair sem salvar as alterações deste sandbox?');
}

function useUnsavedGuard() {
  const ctrl = useController();
  const unsaved = hasUnsaved(ctrl);
  // só registra enquanto há algo a perder: um `beforeunload` sempre ligado deixa a saída da página
  // mais lenta e tira a página do cache de voltar/avançar do navegador
  useEffect(() => {
    if (!unsaved) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [unsaved]);
}

/** Espaço tocado rápido roda/pausa; segurado mais que isso é o modo de mover a câmera (ver scene.ts). */
const SPACE_TAP_MS = 250;

function useKeyboard() {
  const ctrl = useController();
  useEffect(() => {
    let spaceDownAt: number | null = null;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea')) return;
      if (e.key === 'Escape') {
        if (ctrl.showBriefing) ctrl.setBriefing(false);
        else if (ctrl.tool.type !== 'select') ctrl.setTool({ type: 'select' });
        else ctrl.select(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && ctrl.selection && ctrl.canEdit) {
        ctrl.deleteNode(ctrl.selection.id);
      } else if (e.key === ' ' && !target.closest('button')) {
        // a decisão fica para o keyup: toque rápido roda/pausa, segurar move a câmera
        e.preventDefault();
        if (!e.repeat) spaceDownAt = performance.now();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' || spaceDownAt === null) return;
      const held = performance.now() - spaceDownAt;
      spaceDownAt = null;
      if (held >= SPACE_TAP_MS) return;
      if (ctrl.mode === 'build') ctrl.run();
      else if (ctrl.mode === 'run') ctrl.togglePause();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [ctrl]);
}

// ───────────── celular e tablet: palco cheio, painéis numa gaveta ─────────────

/** Ações do dedo no palco (o que Esc, Delete e o inspetor fazem no desktop) e o botão de recentralizar. */
function TouchActions() {
  const ctrl = useController();
  const touch = useTouchUI();
  const tool = ctrl.tool;
  const node = ctrl.selectedNode;
  let actions: preact.ComponentChildren = null;
  // a barra de ações é do toque (no desktop, Esc/Del fazem o mesmo); o recentralizar é para todos
  if (!touch) actions = null;
  else if (tool.type === 'place') {
    actions = (
      <>
        {ctrl.pendingPlace && (
          <button class="btn primary" onClick={() => ctrl.confirmPlace()}>
            ✓ Colocar aqui
          </button>
        )}
        <button class="btn" onClick={() => ctrl.cancel()}>
          ✕ Cancelar
        </button>
      </>
    );
  } else if (tool.type === 'connect') {
    actions = (
      <button class="btn" onClick={() => ctrl.cancel()}>
        ✕ Cancelar
      </button>
    );
  } else if (node && ctrl.canEdit) {
    actions = (
      <>
        <button class="btn primary" onClick={() => ctrl.startConnect(node.id)}>
          ⟶ Conectar
        </button>
        {!node.locked && (
          <button class="btn danger" onClick={() => ctrl.deleteNode(node.id)}>
            Excluir
          </button>
        )}
        <button class="btn" onClick={() => ctrl.select(null)} aria-label="Fechar seleção">
          ✕
        </button>
      </>
    );
  }
  return (
    <>
      {actions && <div class="touch-actions">{actions}</div>}
      <button class="btn recenter-btn" onClick={() => ctrl.recenterView()} aria-label="Recentralizar a câmera" title="Recentralizar">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>
    </>
  );
}

/**
 * No celular a fase ocupa a tela exata (100dvh) e a barra de cima precisa ficar sempre visível.
 * Dois jeitos de ela sumir: (1) o teclado virtual, ao editar um campo do inspetor, rola a página
 * para mostrar o campo e o navegador (sobretudo o Safari do iPhone) nem sempre desfaz a rolagem
 * quando o teclado fecha; (2) zoom de página com pinça ou toque duplo fora do palco, bloqueado no
 * CSS (`touch-action` em `.compact-level`). Aqui a página volta ao topo quando o foco sai de um
 * campo e quando a área visível volta ao tamanho cheio.
 */
function usePinnedViewport() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('pinned-viewport');
    const reset = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
      // o próprio #app também pode ter sido rolado pelo foco (overflow escondido ainda rola)
      const app = document.getElementById('app');
      if (app && app.scrollTop) app.scrollTop = 0;
    };
    const onFocusOut = (e: FocusEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) setTimeout(reset, 50);
    };
    const vv = window.visualViewport;
    const onViewport = () => {
      // teclado fechou: a área visível voltou à altura da janela
      if (vv && vv.height >= window.innerHeight - 1) reset();
    };
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', onViewport);
    window.addEventListener('scroll', onViewport, { passive: true });
    return () => {
      root.classList.remove('pinned-viewport');
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewport);
      window.removeEventListener('scroll', onViewport);
    };
  }, []);
}

type SheetTab = 'montar' | 'missao' | 'metricas' | 'peca';
type SheetSize = 'peek' | 'half' | 'full';

function CompactLevel() {
  const ctrl = useController();
  const level = ctrl.level!;
  usePinnedViewport();
  return (
    <div class="level-screen compact-level">
      <CompactTopBar />
      <main class="stage">
        <SceneHost />
        <StageHint />
        <TouchActions />
      </main>
      <Sheet key={level.id} />
      {ctrl.showBriefing && <Briefing />}
      {ctrl.result && <ResultModal />}
    </div>
  );
}

function CompactTopBar() {
  const ctrl = useController();
  const level = ctrl.level!;
  const running = ctrl.mode === 'run';
  const [menu, setMenu] = useState(false);
  const close = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  return (
    <header class="topbar compact">
      <button class="btn ghost icon" onClick={() => confirmLeave(ctrl) && ctrl.openMenu()} aria-label="Voltar ao menu">
        ←
      </button>
      <h1 title={level.title}>{level.title}</h1>
      <div class="controls">
        {ctrl.mode === 'build' ? (
          <button class="btn run" onClick={() => ctrl.run()}>
            ▶ Rodar
          </button>
        ) : (
          <button class="btn" onClick={() => ctrl.toBuild()}>
            ✎ Construir
          </button>
        )}
        {running && (
          <button class="btn icon" onClick={() => ctrl.togglePause()} aria-label={ctrl.paused ? 'Continuar' : 'Pausar'}>
            {ctrl.paused ? '▶' : '❚❚'}
          </button>
        )}
        <button
          class="btn"
          onClick={() => ctrl.setSpeed(SPEEDS[(SPEEDS.findIndex((x) => x === ctrl.speed) + 1) % SPEEDS.length]!)}
          aria-label={`Velocidade ${ctrl.speed}×. Toque para mudar`}
        >
          {String(ctrl.speed).replace('.', ',')}×
        </button>
        <button class="btn ghost icon" onClick={() => setMenu(!menu)} aria-label="Mais opções" aria-expanded={menu}>
          ⋯
        </button>
      </div>
      {menu && (
        <>
          <button class="menu-scrim" aria-label="Fechar menu" onClick={() => setMenu(false)} />
          <div class="more-menu" role="menu">
            {level.track !== 'sandbox' && <button class="btn ghost" onClick={close(() => ctrl.setBriefing(true))}>Briefing</button>}
            <button class="btn ghost" disabled={!running} onClick={close(() => ctrl.finishNow())}>
              » Concluir agora
            </button>
            <button class="btn ghost" onClick={close(() => ctrl.resetGraph())}>
              Reiniciar a fase
            </button>
            {level.track !== 'sandbox' && ctrl.attempts > 0 && (
              <button class="btn ghost" onClick={close(() => ctrl.showSolution())}>
                Ver solução
              </button>
            )}
            <button class="btn ghost" onClick={close(() => ctrl.setGlossary(true))}>
              Glossário
            </button>
            <div class="more-account" onClick={() => setMenu(false)}>
              <AccountButton />
            </div>
          </div>
        </>
      )}
    </header>
  );
}

/** Gaveta com os painéis da fase: embaixo (em pé) ou à direita (deitado). O palco encolhe junto. */
function Sheet() {
  const ctrl = useController();
  const level = ctrl.level!;
  const hasPalette = level.palette.length > 0;
  const [tab, setTab] = useState<SheetTab>(hasPalette ? 'montar' : 'missao');
  const [size, setSize] = useState<SheetSize>('peek');
  const selectedId = ctrl.selection?.id ?? null;
  const toolType = ctrl.tool.type;

  // selecionar uma peça abre o inspetor; escolher peça ou conexão recolhe para liberar o palco
  useEffect(() => {
    if (selectedId) {
      setTab('peca');
      setSize((s) => (s === 'peek' ? 'half' : s));
    } else setTab((t) => (t === 'peca' ? (hasPalette ? 'montar' : 'missao') : t));
  }, [selectedId, hasPalette]);
  useEffect(() => {
    if (toolType !== 'select') setSize('peek');
  }, [toolType]);

  const tabs: { id: SheetTab; label: string }[] = [
    ...(hasPalette ? [{ id: 'montar' as const, label: 'Peças' }] : []),
    { id: 'missao', label: 'Missão' },
    { id: 'metricas', label: 'Métricas' },
    ...(selectedId ? [{ id: 'peca' as const, label: 'Peça' }] : []),
  ];
  const pick = (id: SheetTab) => {
    if (id === tab && size !== 'peek') setSize('peek');
    else {
      setTab(id);
      if (size === 'peek') setSize('half');
    }
  };

  return (
    <aside class={`sheet sheet-${size}`}>
      <div class="sheet-bar" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id && size !== 'peek'} class={tab === t.id && size !== 'peek' ? 'active' : ''} onClick={() => pick(t.id)}>
            {t.label}
          </button>
        ))}
        <button class="sheet-grow" aria-label={size === 'full' ? 'Reduzir painel' : 'Ampliar painel'} onClick={() => setSize(size === 'full' ? 'half' : 'full')}>
          {size === 'full' ? '⌄' : '⌃'}
        </button>
      </div>
      {size !== 'peek' && (
        <div class="sheet-body">
          {tab === 'montar' && (
            <>
              {level.track === 'sandbox' && <SandboxFile />}
              <Palette />
            </>
          )}
          {tab === 'missao' && (
            <>
              {level.goals.length > 0 && <Goals />}
              <ObjectiveCard />
            </>
          )}
          {tab === 'metricas' && (
            <>
              <Metrics />
              <EventLog />
            </>
          )}
          {tab === 'peca' && <Inspector />}
        </div>
      )}
    </aside>
  );
}
