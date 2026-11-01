import type { InvocationRecord } from '../sim/metrics';
import { useController, useTicker } from './hooks';
import { OUTCOME, RAMP, WORKER } from '../theme';

/** Janela da linha do tempo (ms de simulação). */
const WINDOW = 20_000;
const ROW = 7;
const GAP = 2;
const WIDTH = 300;

const COLOR: Record<InvocationRecord['outcome'] | 'running' | 'init', string> = {
  init: WORKER.cold,
  running: RAMP.verde[300],
  ok: OUTCOME.ok,
  partial: OUTCOME.warn,
  error: OUTCOME.bad,
  timeout: OUTCOME.bad,
  db: RAMP.neutro[400],
  throttled: RAMP.vermelho[800],
};

interface Bar {
  row: number;
  from: number;
  to: number;
  color: string;
  title: string;
}

const OUTCOME_LABEL: Record<InvocationRecord['outcome'], string> = {
  ok: 'ok',
  partial: 'falha parcial (só as que falharam voltam)',
  error: 'erro: o lote inteiro volta para a fila',
  timeout: 'estourou o timeout: o lote volta para a fila',
  db: 'banco recusou a conexão',
  throttled: 'recusada (throttling): sem concorrência reservada livre',
};

/**
 * Linha do tempo das invocações da Lambda, no estilo do CloudWatch: uma faixa por instância, cada
 * invocação uma barra (azul-claro = cold start, depois a cor do resultado). Mostra os últimos 20 s.
 */
export function InvocationTimeline({ nodeId }: { nodeId: string }) {
  const ctrl = useController();
  useTicker(ctrl.mode === 'run', 250);
  const sim = ctrl.sim;
  const c = sim?.consumers.get(nodeId);
  if (!sim || !c?.lambda) return null;
  const now = sim.now;
  const from = Math.max(0, now - WINDOW);
  const x = (t: number) => ((Math.max(t, from) - from) / WINDOW) * WIDTH;
  const bars: Bar[] = [];
  const log = sim.metrics.invocationLog.get(nodeId) ?? [];
  for (const r of log) {
    if (r.end < from) continue;
    const s = (r.end - r.start) / 1000;
    if (r.initAt !== null) bars.push({ row: r.worker, from: r.initAt, to: r.start, color: COLOR.init, title: `instância ${r.worker + 1}: cold start de ${((r.start - r.initAt) / 1000).toFixed(1)}s` });
    bars.push({ row: r.worker, from: r.start, to: r.end, color: COLOR[r.outcome], title: `instância ${r.worker + 1}: lote de ${r.size}, ${s.toFixed(1)}s, ${OUTCOME_LABEL[r.outcome]}` });
  }
  // em andamento: inicializando ou rodando até agora
  c.workers.forEach((w, j) => {
    if (w.state === 'starting') bars.push({ row: j, from: w.start, to: now, color: COLOR.init, title: `instância ${j + 1}: iniciando (cold start)` });
    else if (w.state === 'processing') {
      if (w.initAt !== null && w.initAt >= from) bars.push({ row: j, from: w.initAt, to: w.invocationStart, color: COLOR.init, title: `instância ${j + 1}: cold start` });
      bars.push({ row: j, from: w.invocationStart, to: now, color: COLOR.running, title: `instância ${j + 1}: rodando, lote de ${w.batch.length}` });
    }
  });
  // só as faixas em uso: até a concorrência atual ou a maior instância que aparece na janela
  const used = bars.reduce((m, b) => Math.max(m, b.row + 1), 0);
  const rows = Math.max(1, Math.min(c.workers.length, Math.max(c.active, used)));
  const height = rows * (ROW + GAP);
  const inWindow = log.filter((r) => r.end >= from);
  const colds = inWindow.filter((r) => r.initAt !== null).length;
  return (
    <div class="timeline">
      <h4>Invocações (últimos 20 s)</h4>
      <p class="muted small">
        {inWindow.length} terminadas · {colds} com cold start · concorrência {c.active}/{c.workers.length}
      </p>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Linha do tempo das invocações de ${c.node.name}`}>
        {Array.from({ length: rows }, (_, j) => (
          // instâncias além da concorrência atual ficam apagadas
          <rect key={`r${j}`} x={0} y={j * (ROW + GAP)} width={WIDTH} height={ROW} fill={j < c.active ? RAMP.neutro[100] : RAMP.neutro[50]} />
        ))}
        {bars.map((b, i) => (
          <rect key={i} x={x(b.from)} y={b.row * (ROW + GAP)} width={Math.max(1, x(b.to) - x(b.from))} height={ROW} fill={b.color}>
            <title>{b.title}</title>
          </rect>
        ))}
      </svg>
      <div class="timeline-axis muted small">
        <span>−20 s</span>
        <span>agora</span>
      </div>
      <div class="timeline-legend small">
        <span>
          <i style={{ background: COLOR.init }} /> cold start
        </span>
        <span>
          <i style={{ background: COLOR.running }} /> rodando
        </span>
        <span>
          <i style={{ background: COLOR.ok }} /> ok
        </span>
        <span>
          <i style={{ background: COLOR.partial }} /> falha parcial
        </span>
        <span>
          <i style={{ background: COLOR.error }} /> erro ou timeout
        </span>
        {log.some((r) => r.outcome === 'throttled') && (
          <span>
            <i style={{ background: COLOR.throttled }} /> throttling
          </span>
        )}
      </div>
    </div>
  );
}
