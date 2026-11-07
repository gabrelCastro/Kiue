import type { VisualTheme } from './visual-themes';
import type { Track } from './level-types';

/** O que o menu precisa saber de cada fase. É público: o conteúdo das fases fechadas vem da API. */
export interface LevelMeta {
  id: string;
  track: Track;
  index: number;
  title: string;
  concept: string;
  /** Tema visual da fase (sem tema: o visual de hoje, Indústria). */
  theme?: VisualTheme;
}

/**
 * Todas as fases das trilhas, na ordem de jogo. O tema visual de cada uma combina com o que ela
 * ensina: Fazenda e Robôs gigantes mostram vários workers trabalhando (concorrência, visibilidade),
 * Correio a separação e a ordem das encomendas (filtros, FIFO), Entregas os pedidos que chegam de
 * fora (picos, duplicatas), Fábrica de brinquedos a linha que produz e às vezes erra (DLQ, atraso).
 * O Exame final fica no visual de sempre (Indústria).
 */
export const CATALOG: readonly LevelMeta[] = [
  { id: 'i01', track: 'iniciante', index: 1, title: 'Primeiro pedido', concept: 'Fila de mensagens', theme: 'correio' },
  { id: 'i02', track: 'iniciante', index: 2, title: 'Black Friday', concept: 'Fila como buffer', theme: 'entregas' },
  { id: 'i03', track: 'iniciante', index: 3, title: 'A fila não para de crescer', concept: 'Consumidores concorrentes', theme: 'fazenda' },
  { id: 'i04', track: 'iniciante', index: 4, title: 'Muitos interessados', concept: 'Fan-out com tópico', theme: 'fabrica' },
  { id: 'i05', track: 'iniciante', index: 5, title: 'Só o que importa', concept: 'Filter policy', theme: 'correio' },
  { id: 'i06', track: 'iniciante', index: 6, title: 'Mensagem venenosa', concept: 'DLQ e máximo de recebimentos', theme: 'fabrica' },
  { id: 'i07', track: 'iniciante', index: 7, title: 'Timeout curto demais', concept: 'Visibility timeout', theme: 'gigantes' },
  { id: 'i08', track: 'iniciante', index: 8, title: 'Cobrança duplicada', concept: 'At-least-once e idempotência', theme: 'entregas' },
  { id: 'i09', track: 'iniciante', index: 9, title: 'Em ordem, por favor', concept: 'Fila FIFO', theme: 'fabrica' },
  { id: 'i10', track: 'iniciante', index: 10, title: 'A conta chegou', concept: 'Long polling e custo', theme: 'fazenda' },
  { id: 'c01', track: 'certificacao', index: 1, title: 'Fan-out em ordem', concept: 'Tópico FIFO → fila FIFO', theme: 'correio' },
  { id: 'c02', track: 'certificacao', index: 2, title: 'Janela de manutenção', concept: 'Retenção de mensagens', theme: 'fazenda' },
  { id: 'c03', track: 'certificacao', index: 3, title: 'Espere antes de processar', concept: 'Delay queue', theme: 'fabrica' },
  { id: 'c04', track: 'certificacao', index: 4, title: 'Lote grande, timeout curto', concept: 'Batch × visibility timeout', theme: 'gigantes' },
  { id: 'c05', track: 'certificacao', index: 5, title: 'Retry no FIFO', concept: 'Deduplicação FIFO', theme: 'entregas' },
  { id: 'c06', track: 'certificacao', index: 6, title: 'Lote parcial', concept: 'Fila + função sob demanda', theme: 'fabrica' },
  { id: 'c07', track: 'certificacao', index: 7, title: 'Proteja o banco', concept: 'Concorrência máxima', theme: 'gigantes' },
  { id: 'c08', track: 'certificacao', index: 8, title: 'Processamento imprevisível', concept: 'Estender a visibilidade', theme: 'correio' },
  { id: 'c09', track: 'certificacao', index: 9, title: 'Webhook fora do ar', concept: 'Novas tentativas do tópico e DLQ da assinatura', theme: 'entregas' },
  { id: 'c10', track: 'certificacao', index: 10, title: 'Um grupo só', concept: 'Paralelismo no FIFO', theme: 'fazenda' },
  { id: 'c11', track: 'certificacao', index: 11, title: 'Nota fiscal anexada', concept: 'Tamanho de mensagem', theme: 'correio' },
  { id: 'c13', track: 'certificacao', index: 12, title: 'Manhã fria', concept: 'Cold start e provisioned concurrency', theme: 'gigantes' },
  { id: 'c14', track: 'certificacao', index: 13, title: 'Lotes de verdade', concept: 'Batching window', theme: 'fabrica' },
  { id: 'c15', track: 'certificacao', index: 14, title: 'Sem fila no meio', concept: 'Tópico → função e destino de falha', theme: 'entregas' },
  { id: 'c12', track: 'certificacao', index: 15, title: 'Exame final', concept: 'Tudo junto' },
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
