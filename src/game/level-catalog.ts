import type { Track } from './level-types';

/** O que o menu precisa saber de cada fase. É público: o conteúdo das fases fechadas vem da API. */
export interface LevelMeta {
  id: string;
  track: Track;
  index: number;
  title: string;
  concept: string;
}

/** Todas as fases das trilhas, na ordem de jogo. */
export const CATALOG: readonly LevelMeta[] = [
  { id: 'i01', track: 'iniciante', index: 1, title: 'Primeiro pedido', concept: 'Fila SQS' },
  { id: 'i02', track: 'iniciante', index: 2, title: 'Black Friday', concept: 'Fila como buffer' },
  { id: 'i03', track: 'iniciante', index: 3, title: 'A fila não para de crescer', concept: 'Consumidores concorrentes' },
  { id: 'i04', track: 'iniciante', index: 4, title: 'Muitos interessados', concept: 'SNS fan-out' },
  { id: 'i05', track: 'iniciante', index: 5, title: 'Só o que importa', concept: 'Filter policy' },
  { id: 'i06', track: 'iniciante', index: 6, title: 'Mensagem venenosa', concept: 'DLQ e maxReceiveCount' },
  { id: 'i07', track: 'iniciante', index: 7, title: 'Timeout curto demais', concept: 'Visibility timeout' },
  { id: 'i08', track: 'iniciante', index: 8, title: 'Cobrança duplicada', concept: 'At-least-once e idempotência' },
  { id: 'i09', track: 'iniciante', index: 9, title: 'Em ordem, por favor', concept: 'Fila FIFO' },
  { id: 'i10', track: 'iniciante', index: 10, title: 'A conta chegou', concept: 'Long polling e custo' },
  { id: 'c01', track: 'certificacao', index: 1, title: 'Fan-out em ordem', concept: 'SNS FIFO → SQS FIFO' },
  { id: 'c02', track: 'certificacao', index: 2, title: 'Janela de manutenção', concept: 'Retenção de mensagens' },
  { id: 'c03', track: 'certificacao', index: 3, title: 'Espere antes de processar', concept: 'Delay queue' },
  { id: 'c04', track: 'certificacao', index: 4, title: 'Lote grande, timeout curto', concept: 'Batch × visibility timeout' },
  { id: 'c05', track: 'certificacao', index: 5, title: 'Retry no FIFO', concept: 'Deduplicação FIFO' },
  { id: 'c06', track: 'certificacao', index: 6, title: 'Lote parcial', concept: 'SQS + Lambda' },
  { id: 'c07', track: 'certificacao', index: 7, title: 'Proteja o banco', concept: 'MaximumConcurrency' },
  { id: 'c08', track: 'certificacao', index: 8, title: 'Processamento imprevisível', concept: 'ChangeMessageVisibility' },
  { id: 'c09', track: 'certificacao', index: 9, title: 'Webhook fora do ar', concept: 'Retries do SNS e DLQ da assinatura' },
  { id: 'c10', track: 'certificacao', index: 10, title: 'Um grupo só', concept: 'Paralelismo no FIFO' },
  { id: 'c11', track: 'certificacao', index: 11, title: 'Nota fiscal anexada', concept: 'Tamanho de mensagem' },
  { id: 'c12', track: 'certificacao', index: 12, title: 'Exame final', concept: 'Tudo junto' },
];

export const SANDBOX_META: LevelMeta = { id: 'sandbox', track: 'sandbox', index: 0, title: 'Sandbox', concept: 'Livre' };

const BY_ID = new Map<string, LevelMeta>([...CATALOG, SANDBOX_META].map((m) => [m.id, m]));

export function metaById(id: string): LevelMeta | undefined {
  return BY_ID.get(id);
}

/** Fase seguinte na ordem do catálogo (a próxima da trilha, ou a primeira da trilha seguinte). */
export function nextMeta(id: string): LevelMeta | undefined {
  const i = CATALOG.findIndex((m) => m.id === id);
  return i >= 0 ? CATALOG[i + 1] : undefined;
}
