import { api } from '../api/http';
import type { SandboxRef } from '../game/controller';
import type { Graph } from '../sim/types';

export interface SandboxSummary extends SandboxRef {
  nodeCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SandboxDoc extends SandboxSummary {
  graph: Graph;
}

type Listener = () => void;

/** Lista de sandboxes salvos da conta, observável como os outros stores. */
export class SandboxStore {
  /** `null` até a primeira carga. */
  list: SandboxSummary[] | null = null;
  limit = 0;
  error: string | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  async refresh(): Promise<void> {
    try {
      const r = await api<{ sandboxes: SandboxSummary[]; limit: number }>('GET', '/sandboxes');
      this.list = r.sandboxes;
      this.limit = r.limit;
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Não foi possível carregar seus sandboxes.';
    }
    this.changed();
  }

  /** Esquece a lista (ao sair da conta). */
  reset(): void {
    this.list = null;
    this.error = null;
    this.changed();
  }

  async get(id: string): Promise<SandboxDoc> {
    return (await api<{ sandbox: SandboxDoc }>('GET', `/sandboxes/${encodeURIComponent(id)}`)).sandbox;
  }

  async create(name: string, graph: Graph): Promise<SandboxDoc> {
    const { sandbox } = await api<{ sandbox: SandboxDoc }>('POST', '/sandboxes', { name, graph });
    this.upsert(sandbox);
    return sandbox;
  }

  /** Salva por cima da revisão aberta; 409 `conflict` se outra aba salvou antes. */
  async update(id: string, revision: number, patch: { name?: string; graph?: Graph }): Promise<SandboxDoc> {
    const { sandbox } = await api<{ sandbox: SandboxDoc }>('PUT', `/sandboxes/${encodeURIComponent(id)}`, { ...patch, revision });
    this.upsert(sandbox);
    return sandbox;
  }

  async remove(id: string): Promise<void> {
    await api('DELETE', `/sandboxes/${encodeURIComponent(id)}`);
    if (this.list) this.list = this.list.filter((s) => s.id !== id);
    this.changed();
  }

  private upsert(doc: SandboxDoc): void {
    if (this.list) {
      const { graph: _graph, ...summary } = doc;
      this.list = [summary, ...this.list.filter((s) => s.id !== doc.id)];
    }
    this.changed();
  }
}

export const sandboxes = new SandboxStore();
