import { defaultConsumer, defaultProducer, defaultQueue, defaultTopic } from '../sim/defaults';
import type {
  ConfigByKind,
  ConsumerConfig,
  FilterPolicy,
  Graph,
  GraphNode,
  NodeKind,
  ProducerConfig,
  QueueConfig,
  SimOptions,
  TopicConfig,
} from '../sim/types';
import type { Concept } from './catalog';
import { findNode } from './graph';
import type { Goal, StarTargets } from './goals';

export type Track = 'iniciante' | 'certificacao' | 'sandbox';

export interface PaletteItem {
  kind: NodeKind;
  label: string;
  name: string; // prefixo do nome das peças criadas
  count: number;
  config?: Partial<ConfigByKind[NodeKind]>;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface Level {
  id: string;
  track: Track;
  index: number;
  title: string;
  concept: string;
  story: string;
  objective: string;
  hint: string;
  lesson: string[];
  quiz: QuizQuestion[];
  concepts: Concept[];
  palette: PaletteItem[];
  graph: Graph;
  /** Transforma o grafo inicial na solução de referência (testada automaticamente). */
  solve: (g: Graph) => void;
  sim: Partial<SimOptions>;
  goals: Goal[];
  stars: StarTargets;
  highlightGroups?: boolean;
}

// ───────────── construtores de peças ─────────────

export function P(id: string, name: string, x: number, z: number, c: Partial<ProducerConfig> = {}): GraphNode {
  return { id, kind: 'producer', name, x, z, locked: true, config: defaultProducer(c) };
}

export function T(id: string, name: string, x: number, z: number, c: Partial<TopicConfig> = {}, locked = true): GraphNode {
  return { id, kind: 'topic', name, x, z, locked, config: defaultTopic(c) };
}

export function Q(id: string, name: string, x: number, z: number, c: Partial<QueueConfig> = {}, locked = true): GraphNode {
  return { id, kind: 'queue', name, x, z, locked, config: defaultQueue(c) };
}

export function C(id: string, name: string, x: number, z: number, c: Partial<ConsumerConfig> = {}, locked = true): GraphNode {
  return { id, kind: 'consumer', name, x, z, locked, config: defaultConsumer(c) };
}

export function E(from: string, to: string, filterPolicy?: FilterPolicy, locked = false) {
  return { id: `e-${from}-${to}`, from, to, filterPolicy, locked };
}

// ───────────── utilitários para soluções ─────────────

export function add(g: Graph, node: GraphNode): void {
  g.nodes.push({ ...node, locked: false });
}

export function link(g: Graph, from: string, to: string, filterPolicy?: FilterPolicy): void {
  g.edges.push(E(from, to, filterPolicy));
}

export function unlink(g: Graph, from: string, to: string): void {
  g.edges = g.edges.filter((e) => !(e.from === from && e.to === to));
}

export function configure<K extends NodeKind>(g: Graph, id: string, c: Partial<ConfigByKind[K]>): void {
  const n = findNode(g, id);
  if (!n) throw new Error(`nó ${id} não existe`);
  Object.assign(n.config, c);
}
