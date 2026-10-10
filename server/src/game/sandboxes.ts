import { newId } from '../auth/tokens';
import { HttpError } from '../errors';
import type { SandboxRecord, SandboxRepo, SandboxSummary } from '../repos';

export const SANDBOX_LIMITS = {
  /** Sandboxes por conta. */
  perUser: 30,
  nameMax: 60,
  nodes: 100,
  edges: 300,
  /** Tamanho do grafo serializado. */
  graphBytes: 96 * 1024,
} as const;

const KINDS = new Set(['producer', 'topic', 'queue', 'consumer', 'lambda']);
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const COORD_MAX = 100;

export interface SandboxDoc extends SandboxSummary {
  graph: unknown;
}

const invalid = (message: string, field = 'graph') => new HttpError('validation', message, 400, field);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Confere a estrutura do grafo e devolve uma cópia só com os campos conhecidos. As regras do jogo
 * (que conexão é válida, que configuração faz sentido) ficam no cliente, que já as aplica ao montar;
 * o servidor garante forma, tamanho e referências, para não guardar lixo nem documentos enormes.
 */
export function parseGraph(raw: unknown): { graph: { nodes: unknown[]; edges: unknown[] }; nodeCount: number; json: string } {
  if (!isObject(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw invalid('O grafo precisa ter peças e conexões.');
  if (raw.nodes.length > SANDBOX_LIMITS.nodes) throw invalid(`No máximo ${SANDBOX_LIMITS.nodes} peças por sandbox.`);
  if (raw.edges.length > SANDBOX_LIMITS.edges) throw invalid(`No máximo ${SANDBOX_LIMITS.edges} conexões por sandbox.`);

  const ids = new Set<string>();
  const nodes = raw.nodes.map((n, i) => {
    if (!isObject(n)) throw invalid(`Peça ${i + 1} inválida.`);
    const { id, kind, name, x, z, locked, config } = n;
    if (typeof id !== 'string' || !ID.test(id)) throw invalid(`Peça ${i + 1}: id inválido.`);
    if (ids.has(id)) throw invalid(`Peça repetida: ${id}.`);
    ids.add(id);
    if (typeof kind !== 'string' || !KINDS.has(kind)) throw invalid(`Peça ${id}: tipo desconhecido.`);
    if (typeof name !== 'string' || name.length > SANDBOX_LIMITS.nameMax) throw invalid(`Peça ${id}: nome inválido.`);
    for (const c of [x, z]) if (typeof c !== 'number' || !Number.isFinite(c) || Math.abs(c) > COORD_MAX) throw invalid(`Peça ${id}: posição inválida.`);
    if (!isObject(config)) throw invalid(`Peça ${id}: configuração inválida.`);
    return { id, kind, name, x, z, ...(locked === true ? { locked } : {}), config };
  });

  const edgeIds = new Set<string>();
  const edges = raw.edges.map((e, i) => {
    if (!isObject(e)) throw invalid(`Conexão ${i + 1} inválida.`);
    const { id, from, to, locked, filterPolicy, dlq } = e;
    if (typeof id !== 'string' || !ID.test(id) || edgeIds.has(id)) throw invalid(`Conexão ${i + 1}: id inválido.`);
    edgeIds.add(id);
    if (typeof from !== 'string' || !ids.has(from) || typeof to !== 'string' || !ids.has(to)) throw invalid(`Conexão ${id} aponta para uma peça que não existe.`);
    if (filterPolicy !== undefined && filterPolicy !== null && !isObject(filterPolicy)) throw invalid(`Conexão ${id}: filter policy inválida.`);
    if (dlq !== undefined && dlq !== null && (typeof dlq !== 'string' || !ids.has(dlq))) throw invalid(`Conexão ${id}: DLQ inválida.`);
    return { id, from, to, ...(locked === true ? { locked } : {}), ...(filterPolicy !== undefined ? { filterPolicy } : {}), ...(dlq !== undefined ? { dlq } : {}) };
  });

  const graph = { nodes, edges };
  const json = JSON.stringify(graph);
  if (Buffer.byteLength(json) > SANDBOX_LIMITS.graphBytes) throw invalid('Sandbox grande demais para salvar.');
  return { graph, nodeCount: nodes.length, json };
}

function parseName(raw: unknown): string {
  if (typeof raw !== 'string') throw invalid('Dê um nome ao sandbox.', 'name');
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name) throw invalid('Dê um nome ao sandbox.', 'name');
  if (name.length > SANDBOX_LIMITS.nameMax) throw invalid(`Use no máximo ${SANDBOX_LIMITS.nameMax} caracteres.`, 'name');
  return name;
}

const notFound = () => new HttpError('not_found', 'Sandbox não encontrado. Ele pode ter sido excluído.', 404);

/** Sandboxes salvos por conta, com controle de versão otimista (`revision`) contra sobrescrita. */
export class SandboxService {
  constructor(
    private readonly repo: SandboxRepo,
    private readonly now: () => number = Date.now,
  ) {}

  list(userId: string): SandboxSummary[] {
    return this.repo.list(userId);
  }

  get(userId: string, id: string): SandboxDoc {
    const r = this.repo.find(userId, id);
    if (!r) throw notFound();
    return toDoc(r);
  }

  create(userId: string, body: Record<string, unknown>): SandboxDoc {
    const name = parseName(body.name);
    const { json, nodeCount } = parseGraph(body.graph);
    if (this.repo.count(userId) >= SANDBOX_LIMITS.perUser) {
      throw new HttpError('quota_exceeded', `Você já tem ${SANDBOX_LIMITS.perUser} sandboxes salvos. Exclua algum para salvar outro.`, 409);
    }
    const now = this.now();
    const record: SandboxRecord = { id: newId(), userId, name, graph: json, nodeCount, revision: 1, createdAt: now, updatedAt: now };
    this.repo.insert(record);
    return toDoc(record);
  }

  /**
   * Salva por cima. `revision` é a versão que o cliente abriu: se outra aba ou aparelho salvou
   * depois, a escrita é recusada (409) em vez de apagar o trabalho do outro lado.
   */
  update(userId: string, id: string, body: Record<string, unknown>): SandboxDoc {
    const current = this.repo.find(userId, id);
    if (!current) throw notFound();
    if (!Number.isInteger(body.revision)) throw invalid('Informe a revisão que você está editando.', 'revision');
    const name = body.name === undefined ? current.name : parseName(body.name);
    const parsed = body.graph === undefined ? { json: current.graph, nodeCount: current.nodeCount } : parseGraph(body.graph);
    const ok = this.repo.update(userId, id, body.revision as number, { name, graph: parsed.json, nodeCount: parsed.nodeCount, updatedAt: this.now() });
    if (!ok) throw new HttpError('conflict', 'Este sandbox foi alterado em outra aba ou aparelho depois que você o abriu.', 409);
    return this.get(userId, id);
  }

  delete(userId: string, id: string): void {
    if (!this.repo.delete(userId, id)) throw notFound();
  }
}

function toDoc(r: SandboxRecord): SandboxDoc {
  return { id: r.id, name: r.name, nodeCount: r.nodeCount, revision: r.revision, createdAt: r.createdAt, updatedAt: r.updatedAt, graph: JSON.parse(r.graph) };
}
