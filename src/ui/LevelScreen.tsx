import { useEffect, useRef, useState } from 'preact/hooks';
import { KIND_LABEL } from '../game/catalog';
import { SPEEDS } from '../game/controller';
import type { GoalResult } from '../game/goals';
import { auth } from '../auth/store';
import { AccountButton } from './auth/AccountButton';
import { loadScene } from './scene-loader';
import { Briefing } from './Briefing';
import { describeEvent, fmtTime, type LogLine } from './format';
import { useController, useTicker } from './hooks';
import { Inspector } from './Inspector';
import { ResultModal } from './Result';

export function LevelScreen() {
  const ctrl = useController();
  const level = ctrl.level!;
  useKeyboard();

  return (
    <div class="level-screen">
      <TopBar />
      <aside class="left">
        {level.palette.length > 0 && <Palette />}
        {level.goals.length > 0 && <Goals />}
        <ObjectiveCard />
      </aside>
      <main class="stage">
        <SceneHost />
        <StageHint />
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
      dispose = () => view.dispose();
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
      <button class="btn ghost" onClick={() => ctrl.openMenu()} title="Voltar ao menu">
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
              title={`${KIND_LABEL[item.kind]}: clique e depois clique no chão`}
            >
              <span class={`kind-dot kind-${item.kind}`} />
              <span class="pi-label">{item.label}</span>
              <span class="pi-count">×{left}</span>
            </button>
          );
        })}
      </div>
      {tool.type === 'place' && <p class="muted small">Clique no chão para colocar. <kbd>Esc</kbd> cancela.</p>}
      {level.track === 'sandbox' && ctrl.access === 'guest' && (
        <p class="sandbox-limit small">
          Sandbox limitado para visitantes.{' '}
          <button class="linklike" onClick={() => auth.open('register', { reason: 'Com uma conta, o sandbox libera até 20 filas, 10 tópicos, 20 consumidores e 10 funções Lambda.' })}>
            Crie uma conta
          </button>{' '}
          para liberar todas as peças.
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
  const tool = ctrl.tool;
  let text: string | null = null;
  if (tool.type === 'connect') text = 'Clique na peça de destino da conexão (Esc cancela).';
  else if (tool.type === 'place') text = `Clique no chão para colocar: ${tool.item.label}.`;
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

function useKeyboard() {
  const ctrl = useController();
  useEffect(() => {
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
        e.preventDefault();
        if (ctrl.mode === 'build') ctrl.run();
        else if (ctrl.mode === 'run') ctrl.togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl]);
}
