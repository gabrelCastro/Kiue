// Vocabulário do jogo: conceitos liberáveis, tipos de mensagem e suas cores.
import { CATEGORY, RAMP } from '../theme';

export type Concept =
  | 'visibility'
  | 'dlq'
  | 'filter'
  | 'idempotency'
  | 'fifo'
  | 'dedup'
  | 'longpoll'
  | 'batch'
  | 'workers'
  | 'retention'
  | 'delay'
  | 'processing'
  | 'producer'
  | 'lambda'
  | 'heartbeat'
  | 'snsdlq'
  | 'groups'
  | 'payload'
  | 'coldstart'
  | 'batchwindow'
  | 'onfailure';

export const ALL_CONCEPTS: Concept[] = [
  'visibility',
  'dlq',
  'filter',
  'idempotency',
  'fifo',
  'dedup',
  'longpoll',
  'batch',
  'workers',
  'retention',
  'delay',
  'processing',
  'producer',
  'lambda',
  'heartbeat',
  'snsdlq',
  'groups',
  'payload',
  'coldstart',
  'batchwindow',
  'onfailure',
];

export interface MessageType {
  value: string;
  label: string;
  color: string;
}

export const MESSAGE_TYPES: MessageType[] = [
  { value: 'pedido', label: 'Pedido', color: CATEGORY.ciano },
  { value: 'livro', label: 'Livro', color: CATEGORY.violeta },
  { value: 'eletronico', label: 'Eletrônico', color: CATEGORY.amarelo },
  { value: 'roupa', label: 'Roupa', color: CATEGORY.magenta },
  { value: 'comida', label: 'Comida', color: CATEGORY.bordo },
];

export const POISON_COLOR = RAMP.neutro[950];

export function typeInfo(value: string): MessageType {
  return MESSAGE_TYPES.find((t) => t.value === value) ?? { value, label: value, color: RAMP.neutro[400] };
}

/** Cores por MessageGroupId (usadas quando a fase destaca grupos); separáveis com daltonismo (src/theme.ts). */
export const GROUP_COLORS = [CATEGORY.magenta, CATEGORY.ciano, CATEGORY.verde, CATEGORY.laranja, CATEGORY.violeta, CATEGORY.amarelo];

export function groupColor(groupId: string | null): string | null {
  if (!groupId) return null;
  const idx = groupId.charCodeAt(groupId.length - 1) - 65;
  return GROUP_COLORS[((idx % GROUP_COLORS.length) + GROUP_COLORS.length) % GROUP_COLORS.length];
}

export const KIND_LABEL = {
  producer: 'Produtor',
  topic: 'Tópico',
  queue: 'Fila',
  consumer: 'Consumidor',
  lambda: 'Função sob demanda',
} as const;
