import { useState } from 'preact/hooks';
import { KIND_LABEL, MESSAGE_TYPES, typeInfo } from '../game/catalog';
import type { Controller } from '../game/controller';
import { dlqCandidates, findNode, subscriptionDlqCandidates } from '../game/graph';
import { snippetsFor } from '../game/realworld';
import type { FilterPolicy, GraphEdge, GraphNode } from '../sim/types';
import { NumberField, Select, Toggle } from './fields';
import { useController } from './hooks';

const RETENTION_OPTIONS = [
  { value: 60, label: '1 minuto (mínimo)' },
  { value: 300, label: '5 minutos' },
  { value: 3600, label: '1 hora' },
  { value: 86400, label: '1 dia' },
  { value: 345600, label: '4 dias (padrão)' },
  { value: 1209600, label: '14 dias (máximo)' },
];

export function Inspector() {
  const ctrl = useController();
  const [tab, setTab] = useState<'config' | 'real'>('config');
  const node = ctrl.selectedNode;

  if (!node) {
    return (
      <div class="panel inspector empty">
        <h3>Inspetor</h3>
        <p class="muted">Clique numa peça para ver e mudar a configuração dela.</p>
        <ul class="tips">
          <li><b>Clique</b> numa peça para selecionar; <b>arraste</b> para mover.</li>
          <li><b>Segure <kbd>Espaço</kbd></b> e arraste (ou use o botão direito) para mover a câmera; a <b>roda</b> dá zoom.</li>
          <li><kbd>Esc</kbd> cancela, <kbd>Del</kbd> remove, toque em <kbd>Espaço</kbd> roda/pausa.</li>
        </ul>
      </div>
    );
  }

  return (
    <div class="panel inspector">
      <div class="inspector-head">
        <span class={`kind-dot kind-${node.kind}`} />
        <div>
          <div class="muted small">{KIND_LABEL[node.kind]}</div>
          {ctrl.canEdit && node.kind !== 'producer' ? (
            <input class="name-input" value={node.name} onChange={(e) => ctrl.rename(node.id, (e.target as HTMLInputElement).value)} />
          ) : (
            <h3>{node.name}</h3>
          )}
        </div>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'config'} class={tab === 'config' ? 'active' : ''} onClick={() => setTab('config')}>
          Configurar
        </button>
        <button role="tab" aria-selected={tab === 'real'} class={tab === 'real' ? 'active' : ''} onClick={() => setTab('real')}>
          Na vida real
        </button>
      </div>
      <div class="inspector-body">
        {tab === 'config' ? <NodeConfig ctrl={ctrl} node={node} /> : <RealWorld ctrl={ctrl} node={node} />}
      </div>
    </div>
  );
}

function NodeConfig({ ctrl, node }: { ctrl: Controller; node: GraphNode }) {
  const disabled = !ctrl.canEdit;
  return (
    <div class="config">
      {node.kind === 'queue' && <QueueConfig ctrl={ctrl} node={node as GraphNode<'queue'>} disabled={disabled} />}
      {node.kind === 'topic' && <TopicConfig ctrl={ctrl} node={node as GraphNode<'topic'>} disabled={disabled} />}
      {node.kind === 'consumer' && <ConsumerConfig ctrl={ctrl} node={node as GraphNode<'consumer'>} disabled={disabled} />}
      {node.kind === 'producer' && <ProducerConfig ctrl={ctrl} node={node as GraphNode<'producer'>} disabled={disabled} />}
      {node.kind === 'lambda' && <LambdaConfig ctrl={ctrl} node={node as GraphNode<'lambda'>} disabled={disabled} />}
      <Connections ctrl={ctrl} node={node} />
      {ctrl.canEdit && (
        <div class="row gap">
          {node.kind !== 'consumer' && node.kind !== 'lambda' && (
            <button class="btn primary" onClick={() => ctrl.startConnect(node.id)} disabled={ctrl.tool.type === 'connect'}>
              {ctrl.tool.type === 'connect' ? 'Clique no destino…' : '⟶ Conectar'}
            </button>
          )}
          {!node.locked && (
            <button class="btn danger" onClick={() => ctrl.deleteNode(node.id)}>
              Remover peça
            </button>
          )}
        </div>
      )}
      {disabled && <p class="muted small">Pare a simulação (Construir) para editar.</p>}
    </div>
  );
}

function Locked({ text }: { text: string }) {
  return <p class="locked-hint">{text}</p>;
}

function QueueConfig({ ctrl, node, disabled }: { ctrl: Controller; node: GraphNode<'queue'>; disabled: boolean }) {
  const c = node.config;
  const set = (patch: Partial<typeof c>) => ctrl.updateConfig<'queue'>(node.id, patch);
  const dlqs = dlqCandidates(ctrl.graph, node.id);
  const locked: string[] = [];
  if (!ctrl.hasConcept('visibility')) locked.push(`visibility timeout de ${c.visibilityTimeout}s`);
  return (
    <>
      {ctrl.hasConcept('fifo') ? (
        <Select
          label="Tipo da fila"
          value={c.fifo ? 'fifo' : 'standard'}
          options={[
            { value: 'standard', label: 'Standard — at-least-once, ordem best-effort' },
            { value: 'fifo', label: 'FIFO — ordem por grupo, exactly-once' },
          ]}
          disabled={disabled}
          onChange={(v) => set({ fifo: v === 'fifo' })}
          help="Na AWS o tipo é escolhido na criação e não muda depois; o nome de filas FIFO termina em .fifo."
        />
      ) : (
        <p class="kv">
          Tipo: <b>{c.fifo ? 'FIFO' : 'Standard'}</b>
        </p>
      )}
      {c.fifo && ctrl.hasConcept('dedup') && (
        <Toggle
          label="Content-based deduplication"
          checked={c.contentDedup}
          disabled={disabled}
          onChange={(v) => set({ contentDedup: v })}
          help="Usa o hash SHA-256 do corpo como ID de deduplicação quando o produtor não manda MessageDeduplicationId."
        />
      )}
      {ctrl.hasConcept('visibility') && (
        <NumberField
          label="Visibility timeout"
          value={c.visibilityTimeout}
          min={0}
          max={120}
          unit="s"
          disabled={disabled}
          onChange={(v) => set({ visibilityTimeout: v })}
          help="Quanto tempo a mensagem fica invisível depois de recebida. Precisa ser maior que o tempo de processamento (do lote inteiro). Na AWS: 0 s a 12 h."
        />
      )}
      {ctrl.hasConcept('dlq') ? (
        <>
          <Select
            label="Dead-letter queue (DLQ)"
            value={c.dlq ?? ''}
            options={[{ value: '', label: '— nenhuma —' }, ...dlqs.map((q) => ({ value: q.id, label: q.name }))]}
            disabled={disabled}
            onChange={(v) => set({ dlq: v || null })}
            help={dlqs.length ? 'Para onde vão as mensagens que falham demais.' : `Coloque outra fila ${c.fifo ? 'FIFO' : 'Standard'} para usar como DLQ.`}
          />
          {c.dlq && (
            <NumberField
              label="maxReceiveCount"
              value={c.maxReceiveCount}
              min={1}
              max={10}
              disabled={disabled}
              onChange={(v) => set({ maxReceiveCount: v })}
              help="Depois de ser recebida esse número de vezes sem ser apagada, a mensagem vai para a DLQ."
            />
          )}
        </>
      ) : null}
      {ctrl.hasConcept('delay') && (
        <NumberField
          label="Delay (DelaySeconds)"
          value={c.delaySeconds}
          min={0}
          max={60}
          unit="s"
          disabled={disabled}
          onChange={(v) => set({ delaySeconds: v })}
          help="Esconde cada mensagem nova antes da primeira entrega. Na AWS: até 900 s."
        />
      )}
      {ctrl.hasConcept('retention') ? (
        <Select
          label="Retenção (MessageRetentionPeriod)"
          value={RETENTION_OPTIONS.some((o) => o.value === c.retention) ? c.retention : 345600}
          options={RETENTION_OPTIONS}
          disabled={disabled}
          onChange={(v) => set({ retention: v })}
          help="Mensagens mais velhas que isso são apagadas, mesmo sem nunca terem sido lidas."
        />
      ) : null}
      {locked.length > 0 && <Locked text={`Nesta fase: ${locked.join(', ')}.`} />}
    </>
  );
}

function TopicConfig({ ctrl, node, disabled }: { ctrl: Controller; node: GraphNode<'topic'>; disabled: boolean }) {
  const c = node.config;
  const set = (patch: Partial<typeof c>) => ctrl.updateConfig<'topic'>(node.id, patch);
  return (
    <>
      {ctrl.hasConcept('fifo') ? (
        <Select
          label="Tipo do tópico"
          value={c.fifo ? 'fifo' : 'standard'}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'fifo', label: 'FIFO — ordem por grupo, só filas FIFO' },
          ]}
          disabled={disabled}
          onChange={(v) => set({ fifo: v === 'fifo' })}
          help="Tópico FIFO só entrega para filas SQS FIFO (e fila FIFO só assina tópico FIFO)."
        />
      ) : (
        <p class="kv">
          Tipo: <b>{c.fifo ? 'FIFO' : 'Standard'}</b>
        </p>
      )}
      {c.fifo && ctrl.hasConcept('dedup') && (
        <Toggle
          label="Content-based deduplication"
          checked={c.contentDedup}
          disabled={disabled}
          onChange={(v) => set({ contentDedup: v })}
        />
      )}
    </>
  );
}

function ConsumerConfig({ ctrl, node, disabled }: { ctrl: Controller; node: GraphNode<'consumer'>; disabled: boolean }) {
  const c = node.config;
  const set = (patch: Partial<typeof c>) => ctrl.updateConfig<'consumer'>(node.id, patch);
  const fixed: string[] = [];
  if (!ctrl.hasConcept('workers')) fixed.push(`${c.workers} worker${c.workers > 1 ? 's' : ''}`);
  if (!ctrl.hasConcept('processing')) fixed.push(`~${c.processingTime}s por mensagem`);
  if (!ctrl.hasConcept('batch')) fixed.push(`lote de ${c.batchSize}`);
  if (!ctrl.hasConcept('longpoll')) fixed.push(c.waitTime > 0 ? `long polling ${c.waitTime}s` : 'short polling');
  if (!ctrl.hasConcept('idempotency')) fixed.push(c.idempotent ? 'idempotente' : 'não idempotente');
  return (
    <>
      {c.interest && (
        <p class="kv">
          Interessado em: {c.interest.map((t) => <span class="type-chip" style={{ '--c': typeInfo(t).color }}>{typeInfo(t).label}</span>)}
        </p>
      )}
      {c.outages.length > 0 && (
        <p class="kv">Manutenção: {c.outages.map((o) => `${o.from}s–${o.to}s`).join(', ')}</p>
      )}
      {ctrl.hasConcept('workers') && (
        <NumberField label="Workers (instâncias)" value={c.workers} min={1} max={9} disabled={disabled} onChange={(v) => set({ workers: v })} help="Quantos loops de consumo rodam em paralelo." />
      )}
      {ctrl.hasConcept('processing') && (
        <>
          <NumberField label="Tempo de processamento" value={c.processingTime} min={0.1} max={10} step={0.1} unit="s" disabled={disabled} onChange={(v) => set({ processingTime: v })} />
          <NumberField label="Taxa de erro" value={Math.round(c.failRate * 100)} min={0} max={50} unit="%" disabled={disabled} onChange={(v) => set({ failRate: v / 100 })} />
        </>
      )}
      {ctrl.hasConcept('batch') && (
        <NumberField
          label="Tamanho do lote (MaxNumberOfMessages)"
          value={c.batchSize}
          min={1}
          max={10}
          disabled={disabled}
          onChange={(v) => set({ batchSize: v })}
          help="Quantas mensagens cada ReceiveMessage pode trazer (1 a 10). Lotes economizam chamadas."
        />
      )}
      {ctrl.hasConcept('longpoll') && (
        <NumberField
          label="Wait time (WaitTimeSeconds)"
          value={c.waitTime}
          min={0}
          max={20}
          unit="s"
          disabled={disabled}
          onChange={(v) => set({ waitTime: v })}
          help={c.waitTime === 0 ? 'Short polling: responde na hora, mesmo vazio. Cada resposta vazia é cobrada.' : 'Long polling: espera até chegar mensagem (máx. 20 s).'}
        />
      )}
      {ctrl.hasConcept('idempotency') && (
        <Toggle
          label="Consumidor idempotente"
          checked={c.idempotent}
          disabled={disabled}
          onChange={(v) => set({ idempotent: v })}
          help="Guarda o ID de cada pedido processado e ignora repetições."
        />
      )}
      {ctrl.hasConcept('heartbeat') && (
        <Toggle
          label="Heartbeat (ChangeMessageVisibility)"
          checked={c.heartbeat}
          disabled={disabled}
          onChange={(v) => set({ heartbeat: v })}
          help="Enquanto processa, estende o visibility timeout das mensagens recebidas antes que ele expire."
        />
      )}
      {c.httpOnly && <p class="kv muted small">Endpoint HTTPS de terceiros: recebe chamadas do SNS, não lê filas.</p>}
      {fixed.length > 0 && <Locked text={`Nesta fase: ${fixed.join(', ')}.`} />}
    </>
  );
}

function ProducerConfig({ ctrl, node, disabled }: { ctrl: Controller; node: GraphNode<'producer'>; disabled: boolean }) {
  const c = node.config;
  if (!ctrl.hasConcept('producer')) {
    return (
      <div class="kv-list">
        <p class="kv">Ritmo: <b>{c.rate}</b> pedidos/s{c.bursts.length ? ` (pico de ${c.bursts[0].multiplier}× aos ${c.bursts[0].at}s)` : ''}</p>
        <p class="kv">Total: <b>{c.total}</b> pedidos</p>
        <p class="kv">Tipos: {c.types.map((t) => <span class="type-chip" style={{ '--c': typeInfo(t.value).color }}>{typeInfo(t.value).label}</span>)}</p>
        {c.groups > 0 && <p class="kv">MessageGroupId: <b>{c.groups}</b> clientes</p>}
        {c.dedupId && <p class="kv">Envia MessageDeduplicationId</p>}
        {c.poisonRate > 0 && <p class="kv">Venenosas: <b>{Math.round(c.poisonRate * 100)}%</b></p>}
        {c.retryRate > 0 && <p class="kv">Retries de rede: <b>{Math.round(c.retryRate * 100)}%</b></p>}
        {c.largeRate > 0 && (
          <p class="kv">
            Anexos de <b>{c.largeKb} KB</b> em {Math.round(c.largeRate * 100)}% dos pedidos (os demais têm 2 KB)
          </p>
        )}
        {ctrl.hasConcept('groups') && (
          <NumberField
            label="Clientes distintos (MessageGroupId)"
            value={c.groups}
            min={1}
            max={6}
            disabled={disabled}
            onChange={(v) => ctrl.updateConfig<'producer'>(node.id, { groups: v })}
            help={c.groups === 1 ? 'Todos os pedidos usam o mesmo MessageGroupId: a fila FIFO entrega um por vez.' : 'Um MessageGroupId por cliente: grupos diferentes são processados em paralelo.'}
          />
        )}
        {ctrl.hasConcept('payload') && (
          <Toggle
            label="Extended Client (payload grande no S3)"
            checked={c.extendedClient}
            disabled={disabled}
            onChange={(v) => ctrl.updateConfig<'producer'>(node.id, { extendedClient: v })}
            help="Mensagens acima de 256 KB vão para um bucket S3; a fila recebe só a referência."
          />
        )}
        <Locked text={ctrl.hasConcept('groups') || ctrl.hasConcept('payload') ? 'O resto do produtor faz parte do cenário.' : 'O produtor faz parte do cenário desta fase.'} />
      </div>
    );
  }
  const set = (patch: Partial<typeof c>) => ctrl.updateConfig<'producer'>(node.id, patch);
  const toggleType = (value: string, on: boolean) => {
    const types = on ? [...c.types, { value, weight: 1 }] : c.types.filter((t) => t.value !== value);
    if (types.length) set({ types });
  };
  return (
    <>
      <NumberField label="Ritmo" value={c.rate} min={0.1} max={10} step={0.1} unit="/s" disabled={disabled} onChange={(v) => set({ rate: v })} />
      <NumberField label="Total de pedidos" value={c.total} min={1} max={500} disabled={disabled} onChange={(v) => set({ total: v })} />
      <div class="field">
        <span class="field-label">Tipos (atributo "tipo")</span>
        <div class="chips">
          {MESSAGE_TYPES.map((t) => (
            <label class="chip-check" style={{ '--c': t.color }}>
              <input type="checkbox" checked={c.types.some((x) => x.value === t.value)} disabled={disabled} onChange={(e) => toggleType(t.value, (e.target as HTMLInputElement).checked)} />
              {t.label}
            </label>
          ))}
        </div>
      </div>
      <NumberField label="Clientes (MessageGroupId)" value={c.groups} min={0} max={6} disabled={disabled} onChange={(v) => set({ groups: v })} help="0 = sem MessageGroupId (obrigatório para FIFO)." />
      <Toggle label="Enviar MessageDeduplicationId" checked={c.dedupId} disabled={disabled} onChange={(v) => set({ dedupId: v })} />
      <NumberField label="Mensagens venenosas" value={Math.round(c.poisonRate * 100)} min={0} max={50} unit="%" disabled={disabled} onChange={(v) => set({ poisonRate: v / 100 })} />
      <NumberField label="Retries de rede" value={Math.round(c.retryRate * 100)} min={0} max={50} unit="%" disabled={disabled} onChange={(v) => set({ retryRate: v / 100 })} />
    </>
  );
}

function Connections({ ctrl, node }: { ctrl: Controller; node: GraphNode }) {
  const out = ctrl.graph.edges.filter((e) => e.from === node.id);
  const inc = ctrl.graph.edges.filter((e) => e.to === node.id);
  if (!out.length && !inc.length) return <p class="muted small">Sem conexões.</p>;
  return (
    <div class="connections">
      <div class="field-label">{node.kind === 'topic' ? 'Assinaturas' : 'Conexões'}</div>
      {inc.map((e) => (
        <EdgeRow key={e.id} ctrl={ctrl} edge={e} label={`← ${findNode(ctrl.graph, e.from)?.name ?? '?'}`} />
      ))}
      {out.map((e) => (
        <EdgeRow key={e.id} ctrl={ctrl} edge={e} label={`→ ${findNode(ctrl.graph, e.to)?.name ?? '?'}`} />
      ))}
    </div>
  );
}

function EdgeRow({ ctrl, edge, label }: { ctrl: Controller; edge: GraphEdge; label: string }) {
  const fromTopic = findNode(ctrl.graph, edge.from)?.kind === 'topic';
  return (
    <div class="edge-row">
      <div class="row between">
        <span>{label}</span>
        {ctrl.canEdit && !edge.locked && (
          <button class="btn tiny ghost" title="Remover conexão" onClick={() => ctrl.disconnect(edge.id)}>
            ✕
          </button>
        )}
        {edge.locked && <span class="muted small">fixa</span>}
      </div>
      {fromTopic && <FilterEditor ctrl={ctrl} edge={edge} />}
      {fromTopic && <SubscriptionDlq ctrl={ctrl} edge={edge} />}
    </div>
  );
}

function SubscriptionDlq({ ctrl, edge }: { ctrl: Controller; edge: GraphEdge }) {
  if (!ctrl.hasConcept('snsdlq')) {
    const dlq = edge.dlq ? findNode(ctrl.graph, edge.dlq) : undefined;
    return dlq ? <p class="muted small">DLQ da assinatura: {dlq.name}</p> : null;
  }
  const options = subscriptionDlqCandidates(ctrl.graph, edge).filter((q) => q.id !== edge.to);
  return (
    <Select
      label="DLQ da assinatura"
      value={edge.dlq ?? ''}
      options={[{ value: '', label: '— nenhuma (descarta após os retries) —' }, ...options.map((q) => ({ value: q.id, label: q.name }))]}
      disabled={!ctrl.canEdit}
      onChange={(v) => ctrl.setEdgeDlq(edge.id, v || null)}
      help={options.length ? 'Recebe as mensagens que o SNS não conseguiu entregar depois de todos os retries.' : 'Coloque uma fila SQS para usar como DLQ desta assinatura.'}
    />
  );
}

function LambdaConfig({ ctrl, node, disabled }: { ctrl: Controller; node: GraphNode<'lambda'>; disabled: boolean }) {
  const c = node.config;
  const set = (patch: Partial<typeof c>) => ctrl.updateConfig<'lambda'>(node.id, patch);
  const src = ctrl.graph.edges.find((e) => e.to === node.id);
  const queue = src ? findNode(ctrl.graph, src.from) : undefined;
  const vt = queue?.kind === 'queue' ? (queue as GraphNode<'queue'>).config.visibilityTimeout : null;
  const editable = ctrl.hasConcept('lambda');
  return (
    <>
      <p class="kv">
        ~{c.processingTime}s por mensagem · timeout da função <b>{c.timeout}s</b>
      </p>
      {c.dbLimit > 0 && (
        <p class="kv">
          Banco de dados aguenta <b>{c.dbLimit}</b> conexões simultâneas (uma por invocação)
        </p>
      )}
      {vt !== null && vt < c.timeout * 6 && (
        <p class="locked-hint">Visibility timeout da fila ({vt}s) é menor que 6× o timeout da função ({c.timeout * 6}s), como a AWS recomenda.</p>
      )}
      {ctrl.hasConcept('batch') ? (
        <NumberField
          label="Batch size"
          value={c.batchSize}
          min={1}
          max={10}
          disabled={disabled}
          onChange={(v) => set({ batchSize: v })}
          help="Mensagens por invocação. Na AWS vai até 10.000 (com batching window)."
        />
      ) : (
        <p class="kv">
          Batch size: <b>{c.batchSize}</b>
        </p>
      )}
      {editable ? (
        <>
          <Toggle
            label="Report batch item failures"
            checked={c.reportBatchItemFailures}
            disabled={disabled}
            onChange={(v) => set({ reportBatchItemFailures: v })}
            help="A função devolve só os IDs das mensagens que falharam; o resto do lote é apagado."
          />
          <NumberField
            label="Concorrência máxima (MaximumConcurrency)"
            value={c.maxConcurrency}
            min={0}
            max={20}
            disabled={disabled}
            onChange={(v) => set({ maxConcurrency: v === 1 ? 2 : v })}
            help={c.maxConcurrency === 0 ? 'Sem limite: escala enquanto houver fila (teto de 20 no jogo).' : 'Invocações simultâneas disparadas pela fila (mínimo 2 na AWS).'}
          />
        </>
      ) : (
        <Locked text="Configuração da função fixa nesta fase." />
      )}
    </>
  );
}

/** Editor da filter policy de uma assinatura SNS (atributo "tipo"). */
function FilterEditor({ ctrl, edge }: { ctrl: Controller; edge: GraphEdge }) {
  const types = producerTypes(ctrl);
  const rules = edge.filterPolicy?.tipo ?? [];
  const anythingBut = rules.find((r): r is { 'anything-but': string[] } => typeof r === 'object' && 'anything-but' in r);
  const mode: 'none' | 'only' | 'except' = !rules.length ? 'none' : anythingBut ? 'except' : 'only';
  const selected = anythingBut ? anythingBut['anything-but'] : (rules.filter((r) => typeof r === 'string') as string[]);
  const editable = ctrl.canEdit && ctrl.hasConcept('filter');

  const apply = (m: typeof mode, values: string[]) => {
    let policy: FilterPolicy | null = null;
    if (m === 'only' && values.length) policy = { tipo: values };
    if (m === 'except' && values.length) policy = { tipo: [{ 'anything-but': values }] };
    ctrl.setFilter(edge.id, policy);
  };

  if (!ctrl.hasConcept('filter')) {
    return mode === 'none' ? null : <p class="muted small">Filtro: {JSON.stringify(edge.filterPolicy)}</p>;
  }

  return (
    <div class="filter-editor">
      <Select
        label="Filter policy"
        value={mode}
        options={[
          { value: 'none', label: 'Sem filtro (recebe tudo)' },
          { value: 'only', label: 'Somente os tipos marcados' },
          { value: 'except', label: 'Tudo exceto os marcados (anything-but)' },
        ]}
        disabled={!editable}
        onChange={(m) => apply(m, m === 'none' ? [] : selected.length ? selected : [types[0]])}
      />
      {mode !== 'none' && (
        <div class="chips">
          {types.map((t) => (
            <label class="chip-check" style={{ '--c': typeInfo(t).color }}>
              <input
                type="checkbox"
                checked={selected.includes(t)}
                disabled={!editable}
                onChange={(e) => {
                  const on = (e.target as HTMLInputElement).checked;
                  apply(mode, on ? [...selected, t] : selected.filter((x) => x !== t));
                }}
              />
              {typeInfo(t).label}
            </label>
          ))}
        </div>
      )}
      {mode !== 'none' && <code class="policy">{JSON.stringify(edge.filterPolicy ?? {})}</code>}
    </div>
  );
}

function producerTypes(ctrl: Controller): string[] {
  const set = new Set<string>();
  for (const n of ctrl.graph.nodes) {
    if (n.kind === 'producer') for (const t of (n as GraphNode<'producer'>).config.types) set.add(t.value);
  }
  return set.size ? [...set] : MESSAGE_TYPES.map((t) => t.value);
}

function RealWorld({ ctrl, node }: { ctrl: Controller; node: GraphNode }) {
  const snippets = snippetsFor(ctrl.graph, node);
  return (
    <div class="realworld">
      <p class="muted small">O equivalente desta peça na AWS (CLI e SDK v3 para JavaScript):</p>
      {snippets.map((s) => (
        <div class="snippet">
          <div class="row between">
            <b>{s.title}</b>
            <button class="btn tiny ghost" onClick={() => navigator.clipboard?.writeText(s.code).then(() => ctrl.flash('Copiado!'))}>
              Copiar
            </button>
          </div>
          <pre>
            <code>{s.code}</code>
          </pre>
          {s.note && <p class="muted small">{s.note}</p>}
        </div>
      ))}
    </div>
  );
}
