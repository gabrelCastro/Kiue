// Vocabulário do jogo: conceitos liberáveis, tipos de mensagem e suas cores.

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
  | 'producer';

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
];

export interface MessageType {
  value: string;
  label: string;
  color: string;
}

export const MESSAGE_TYPES: MessageType[] = [
  { value: 'pedido', label: 'Pedido', color: '#2dd4bf' },
  { value: 'livro', label: 'Livro', color: '#60a5fa' },
  { value: 'eletronico', label: 'Eletrônico', color: '#facc15' },
  { value: 'roupa', label: 'Roupa', color: '#f87171' },
  { value: 'comida', label: 'Comida', color: '#4ade80' },
];

export const POISON_COLOR = '#3b0764';

export function typeInfo(value: string): MessageType {
  return MESSAGE_TYPES.find((t) => t.value === value) ?? { value, label: value, color: '#a1a1aa' };
}

/** Cores por MessageGroupId (usadas quando a fase destaca grupos). */
export const GROUP_COLORS = ['#f472b6', '#38bdf8', '#a3e635', '#fb923c', '#c084fc', '#facc15'];

export function groupColor(groupId: string | null): string | null {
  if (!groupId) return null;
  const idx = groupId.charCodeAt(groupId.length - 1) - 65;
  return GROUP_COLORS[((idx % GROUP_COLORS.length) + GROUP_COLORS.length) % GROUP_COLORS.length];
}

export const KIND_LABEL = {
  producer: 'Produtor',
  topic: 'Tópico SNS',
  queue: 'Fila SQS',
  consumer: 'Consumidor',
} as const;
