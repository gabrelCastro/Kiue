import { defaultConsumer, defaultLambda, defaultProducer, defaultQueue, defaultTopic } from '../sim/defaults';
import type { Simulation } from '../sim/engine';
import type { ConfigByKind, FilterPolicy, Graph, GraphNode, NodeKind } from '../sim/types';
import type { Concept } from './catalog';
import { evaluateGoal, evaluateRun, type GoalResult, type RunResult } from './goals';
import { addEdge, connectionError, findNode, newId, removeNode, validateGraph } from './graph';
import type { Level, PaletteItem } from './level-types';
import { LEVELS, levelById } from './levels';
import { createSimulation, solutionGraph } from './run';
import { loadProgress, saveProgress, type Progress } from './save';

export type Mode = 'build' | 'run' | 'done';
export type Tool = { type: 'select' } | { type: 'place'; item: PaletteItem } | { type: 'connect'; from: string };
export type Selection = { kind: 'node'; id: string } | null;

export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info' | 'warn';
}

export const SPEEDS = [1, 2, 4, 8] as const;
const MIN_DISTANCE = 2.2;
const GRID_LIMIT_X = 12;
const GRID_LIMIT_Z = 8;

const DEFAULTS: { [K in NodeKind]: () => ConfigByKind[K] } = {
  producer: () => defaultProducer(),
  topic: () => defaultTopic(),
  queue: () => defaultQueue(),
  consumer: () => defaultConsumer(),
  lambda: () => defaultLambda(),
};

/** Estado global do jogo. A UI assina mudanças; o renderer lê a cada frame. */
export class Controller {
  screen: 'menu' | 'level' = 'menu';
  level: Level | null = null;
  graph: Graph = { nodes: [], edges: [] };
  /** Incrementa a cada mudança estrutural do grafo (o renderer reconstrói a cena). */
  graphVersion = 0;
  mode: Mode = 'build';
  speed: number = 2;
  paused = false;
  tool: Tool = { type: 'select' };
  selection: Selection = null;
  sim: Simulation | null = null;
  /** Indica que a simulação está rodando em tempo real (efeitos visuais ligados). */
  live = false;
  result: RunResult | null = null;
  attempts = 0;
  usedSolution = false;
  toast: Toast | null = null;
  showBriefing = false;
  showGlossary = false;
  progress: Progress = loadProgress();

  private listeners = new Set<() => void>();
  private simListeners = new Set<(sim: Simulation | null) => void>();
  private toastSeq = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onSimChange(fn: (sim: Simulation | null) => void): () => void {
    this.simListeners.add(fn);
    return () => this.simListeners.delete(fn);
  }

  notify(): void {
    for (const l of this.listeners) l();
  }

  private graphChanged(): void {
    this.graphVersion++;
    this.notify();
  }

  private setSim(sim: Simulation | null) {
    this.sim = sim;
    for (const l of this.simListeners) l(sim);
  }

  flash(text: string, kind: Toast['kind'] = 'info'): void {
    this.toast = { id: ++this.toastSeq, text, kind };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = null;
      this.notify();
    }, kind === 'error' ? 5000 : 3500);
    this.notify();
  }

  // ───────────── navegação ─────────────

  openMenu(): void {
    this.screen = 'menu';
    this.level = null;
    this.setSim(null);
    this.live = false;
    this.notify();
  }

  isUnlocked(level: Level): boolean {
    if (level.track === 'sandbox') return true;
    const track = LEVELS.filter((l) => l.track === level.track);
    const idx = track.indexOf(level);
    if (level.track === 'certificacao' && idx === 0) return (this.progress['i05']?.stars ?? 0) > 0;
    return idx === 0 || (this.progress[track[idx - 1].id]?.stars ?? 0) > 0;
  }

  startLevel(id: string): void {
    const level = levelById(id);
    if (!level) return;
    this.level = level;
    this.screen = 'level';
    this.attempts = 0;
    this.usedSolution = false;
    this.resetGraph();
    this.showBriefing = level.track !== 'sandbox';
  }

  resetGraph(): void {
    if (!this.level) return;
    this.graph = structuredClone(this.level.graph);
    this.toBuild();
    this.selection = null;
    this.graphChanged();
  }

  showSolution(): void {
    if (!this.level) return;
    this.graph = solutionGraph(this.level);
    this.usedSolution = true;
    this.toBuild();
    this.selection = null;
    this.flash('Solução de referência carregada. Rode para ver funcionando e leia o inspetor de cada peça.', 'info');
    this.graphChanged();
  }

  setBriefing(open: boolean): void {
    this.showBriefing = open;
    this.notify();
  }

  setGlossary(open: boolean): void {
    this.showGlossary = open;
    this.notify();
  }

  // ───────────── construção ─────────────

  get canEdit(): boolean {
    return this.mode === 'build';
  }

  hasConcept(c: Concept): boolean {
    return this.level?.concepts.includes(c) ?? false;
  }

  paletteRemaining(item: PaletteItem): number {
    if (!this.level) return 0;
    const initialIds = new Set(this.level.graph.nodes.map((n) => n.id));
    const used = this.graph.nodes.filter((n) => n.kind === item.kind && !initialIds.has(n.id)).length;
    const sameKind = this.level.palette.filter((p) => p.kind === item.kind);
    // várias entradas do mesmo tipo dividem o uso na ordem da paleta
    let left = used;
    for (const p of sameKind) {
      const take = Math.min(left, p.count);
      if (p === item) return p.count - take;
      left -= take;
    }
    return 0;
  }

  setTool(tool: Tool): void {
    if (!this.canEdit) return;
    if (tool.type === 'place' && this.paletteRemaining(tool.item) <= 0) {
      this.flash('Não há mais peças desse tipo disponíveis nesta fase.', 'warn');
      return;
    }
    this.tool = tool;
    this.notify();
  }

  select(sel: Selection): void {
    this.selection = sel;
    if (this.tool.type === 'connect') this.tool = { type: 'select' };
    this.notify();
  }

  get selectedNode(): GraphNode | undefined {
    return this.selection?.kind === 'node' ? findNode(this.graph, this.selection.id) : undefined;
  }

  private positionError(x: number, z: number, ignoreId?: string): string | null {
    if (Math.abs(x) > GRID_LIMIT_X || Math.abs(z) > GRID_LIMIT_Z) return 'Fora da área de construção.';
    const close = this.graph.nodes.some((n) => n.id !== ignoreId && Math.hypot(n.x - x, (n.z - z) * 1.4) < MIN_DISTANCE * (n.kind === 'queue' ? 1.3 : 1));
    return close ? 'Muito perto de outra peça.' : null;
  }

  canPlaceAt(x: number, z: number, ignoreId?: string): boolean {
    return this.positionError(x, z, ignoreId) === null;
  }

  placeAt(x: number, z: number): void {
    if (this.tool.type !== 'place' || !this.canEdit) return;
    const item = this.tool.item;
    const err = this.positionError(x, z);
    if (err) {
      this.flash(err, 'warn');
      return;
    }
    const id = newId(this.graph, item.kind[0]);
    const node = {
      id,
      kind: item.kind,
      name: this.uniqueName(item.name),
      x,
      z,
      config: { ...DEFAULTS[item.kind](), ...(item.config ?? {}) },
    } as GraphNode;
    this.graph.nodes.push(node);
    this.selection = { kind: 'node', id };
    if (this.paletteRemaining(item) <= 0) this.tool = { type: 'select' };
    this.graphChanged();
  }

  private uniqueName(base: string): string {
    const names = new Set(this.graph.nodes.map((n) => n.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) {
      const sep = /\s/.test(base) ? ' ' : '-';
      const name = `${base}${sep}${i}`;
      if (!names.has(name)) return name;
    }
  }

  moveNode(id: string, x: number, z: number): boolean {
    const n = findNode(this.graph, id);
    if (!n || n.locked || !this.canEdit) return false;
    if (n.x === x && n.z === z) return true;
    if (this.positionError(x, z, id)) return false;
    n.x = x;
    n.z = z;
    this.graphChanged();
    return true;
  }

  deleteNode(id: string): void {
    const n = findNode(this.graph, id);
    if (!n || !this.canEdit) return;
    if (n.locked) {
      this.flash('Esta peça faz parte do cenário e não pode ser removida.', 'warn');
      return;
    }
    removeNode(this.graph, id);
    if (this.selection?.id === id) this.selection = null;
    this.graphChanged();
  }

  startConnect(from: string): void {
    if (!this.canEdit) return;
    this.tool = { type: 'connect', from };
    this.notify();
  }

  /** Clique em uma peça na cena. */
  clickNode(id: string): void {
    if (this.tool.type === 'connect') {
      const from = this.tool.from;
      this.tool = { type: 'select' };
      if (from !== id) this.connect(from, id);
      else this.notify();
      return;
    }
    this.select({ kind: 'node', id });
  }

  connect(from: string, to: string): boolean {
    if (!this.canEdit) return false;
    const err = connectionError(this.graph, from, to);
    if (err) {
      this.flash(err, 'error');
      return false;
    }
    addEdge(this.graph, from, to);
    this.graphChanged();
    return true;
  }

  disconnect(edgeId: string): void {
    const e = this.graph.edges.find((x) => x.id === edgeId);
    if (!e || !this.canEdit) return;
    if (e.locked) {
      this.flash('Esta conexão faz parte do cenário.', 'warn');
      return;
    }
    this.graph.edges = this.graph.edges.filter((x) => x !== e);
    this.graphChanged();
  }

  updateConfig<K extends NodeKind>(id: string, patch: Partial<ConfigByKind[K]>): void {
    const n = findNode(this.graph, id);
    if (!n || !this.canEdit) return;
    const before = n.config as unknown as Record<string, unknown>;
    const next = { ...before, ...patch } as Record<string, unknown>;
    // mudar Standard ↔ FIFO invalida ligações e DLQs incompatíveis
    if (n.kind === 'queue' && 'fifo' in patch && patch.fifo !== before.fifo) {
      next.dlq = null;
      for (const q of this.graph.nodes) {
        if (q.kind === 'queue' && (q as GraphNode<'queue'>).config.dlq === id) (q as GraphNode<'queue'>).config.dlq = null;
      }
      this.dropIncompatibleEdges(id);
    }
    n.config = next as unknown as GraphNode['config'];
    if (n.kind === 'topic' && 'fifo' in patch) this.dropIncompatibleEdges(id);
    this.graphChanged();
  }

  private dropIncompatibleEdges(id: string) {
    const before = this.graph.edges.length;
    this.graph.edges = this.graph.edges.filter((e) => {
      if (e.from !== id && e.to !== id) return true;
      const from = findNode(this.graph, e.from);
      const to = findNode(this.graph, e.to);
      if (from?.kind !== 'topic' || to?.kind !== 'queue') return true;
      return (from as GraphNode<'topic'>).config.fifo === (to as GraphNode<'queue'>).config.fifo;
    });
    if (this.graph.edges.length < before)
      this.flash('Assinaturas incompatíveis foram removidas: tópico e fila precisam ser ambos FIFO ou ambos Standard.', 'warn');
  }

  rename(id: string, name: string): void {
    const n = findNode(this.graph, id);
    if (!n || !this.canEdit) return;
    n.name = name.slice(0, 40);
    this.graphChanged();
  }

  setFilter(edgeId: string, policy: FilterPolicy | null): void {
    const e = this.graph.edges.find((x) => x.id === edgeId);
    if (!e || !this.canEdit) return;
    e.filterPolicy = policy;
    this.graphChanged();
  }

  setEdgeDlq(edgeId: string, dlq: string | null): void {
    const e = this.graph.edges.find((x) => x.id === edgeId);
    if (!e || !this.canEdit) return;
    e.dlq = dlq;
    this.graphChanged();
  }

  // ───────────── execução ─────────────

  run(): void {
    if (!this.level) return;
    const issues = validateGraph(this.graph);
    if (issues.errors.length) {
      this.flash(issues.errors[0], 'error');
      return;
    }
    if (issues.warnings.length) this.flash(`Atenção: ${issues.warnings[0]}`, 'warn');
    this.tool = { type: 'select' };
    this.result = null;
    this.mode = 'run';
    this.paused = false;
    this.live = true;
    this.attempts++;
    this.setSim(createSimulation(this.level, this.graph));
    this.notify();
  }

  toBuild(): void {
    this.mode = 'build';
    this.result = null;
    this.live = false;
    this.setSim(null);
    this.notify();
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.paused = false;
    this.notify();
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.notify();
  }

  finishNow(): void {
    if (!this.sim || this.mode !== 'run') return;
    this.live = false;
    this.sim.runToEnd();
    this.complete();
  }

  /** Chamado a cada frame com o tempo real decorrido (ms). */
  frame(dtMs: number): void {
    if (this.mode !== 'run' || !this.sim || this.paused) return;
    this.sim.advance(Math.min(dtMs, 100) * this.speed);
    if (this.sim.finished) this.complete();
  }

  private complete(): void {
    if (!this.sim || !this.level) return;
    this.mode = 'done';
    this.live = false;
    if (this.level.track === 'sandbox') {
      this.result = null;
      this.flash('Simulação concluída.', 'info');
      this.notify();
      return;
    }
    this.result = evaluateRun(this.level.goals, this.level.stars, this.sim, this.graph);
    if (this.result.passed) {
      const prev = this.progress[this.level.id];
      const stars = Math.max(prev?.stars ?? 0, this.result.stars);
      this.progress = { ...this.progress, [this.level.id]: { ...prev, stars } };
      saveProgress(this.progress);
    }
    this.notify();
  }

  recordQuiz(correct: number): void {
    if (!this.level) return;
    const prev = this.progress[this.level.id] ?? { stars: 0 };
    this.progress = { ...this.progress, [this.level.id]: { ...prev, quizCorrect: Math.max(prev.quizCorrect ?? 0, correct) } };
    saveProgress(this.progress);
    this.notify();
  }

  private idleSim: { version: number; sim: Simulation } | null = null;

  liveGoals(): GoalResult[] {
    if (!this.level) return [];
    if (this.result) return this.result.goals;
    if (this.sim) return this.level.goals.map((g) => evaluateGoal(g, this.sim!, this.graph, false));
    if (this.idleSim?.version !== this.graphVersion) {
      this.idleSim = { version: this.graphVersion, sim: createSimulation(this.level, this.graph) };
    }
    const idle = this.idleSim.sim;
    return this.level.goals.map((g) => ({ ...evaluateGoal(g, idle, this.graph, false), status: 'pending', detail: '' }));
  }

  resetProgress(): void {
    this.progress = {};
    saveProgress(this.progress);
    this.notify();
  }
}
