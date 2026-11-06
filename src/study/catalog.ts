import type { Chapter, ChapterMeta, ChapterSource } from './types';

/**
 * Catálogo público da apostila (vai no bundle): títulos, resumos e ligações com as fases. O texto
 * dos capítulos abertos fica em `src/study/free.ts`; o dos demais, só no servidor (`content/study.ts`),
 * igual às fases.
 */
export const CHAPTERS: readonly ChapterMeta[] = [
  {
    id: 'cap01',
    num: 1,
    title: 'Por que filas',
    summary: 'Desacoplar quem produz de quem processa, absorver picos e a diferença entre pull e push.',
    minutes: 6,
    levels: ['i01', 'i02'],
    terms: ['Fila (queue)', 'Delete (apagar)', 'Receive (receber)'],
  },
  {
    id: 'cap02',
    num: 2,
    title: 'Consumidores concorrentes',
    summary: 'Vários consumidores na mesma fila dividem o trabalho: como escalar sem perder mensagens.',
    minutes: 5,
    levels: ['i03'],
    terms: ['Consumidores concorrentes'],
  },
  {
    id: 'cap03',
    num: 3,
    title: 'Tópicos, fan-out e filtros',
    summary: 'Publicar uma vez e entregar para vários sistemas, cada um com a sua fila e o seu filtro.',
    minutes: 7,
    levels: ['i04', 'i05'],
    terms: ['Tópico (topic)', 'Assinatura (subscription)', 'Fan-out', 'Filter policy', 'Raw message delivery'],
  },
  {
    id: 'cap04',
    num: 4,
    title: 'Visibility timeout e heartbeat',
    summary: 'O que acontece entre receber e apagar uma mensagem, e como não processar duas vezes por demora.',
    minutes: 7,
    levels: ['i07', 'c08'],
    terms: ['Visibility timeout', 'Em voo (in flight)', 'Receipt handle', 'Estender a visibilidade'],
  },
  {
    id: 'cap05',
    num: 5,
    title: 'Falhas, mensagens venenosas e DLQ',
    summary: 'Mensagens que nunca dão certo, o máximo de recebimentos e como investigar e reprocessar.',
    minutes: 6,
    levels: ['i06'],
    terms: ['Dead-letter queue (DLQ)', 'Máximo de recebimentos', 'Mensagem venenosa (poison)'],
  },
  {
    id: 'cap06',
    num: 6,
    title: 'At-least-once e idempotência',
    summary: 'Por que a mesma mensagem pode chegar duas vezes e como fazer o efeito acontecer uma só.',
    minutes: 6,
    levels: ['i08'],
    terms: ['At-least-once', 'Idempotência', 'Fila Standard'],
  },
  {
    id: 'cap07',
    num: 7,
    title: 'Filas FIFO',
    summary: 'Ordem por grupo, deduplicação e o custo dessa garantia em vazão e paralelismo.',
    minutes: 8,
    levels: ['i09', 'c01', 'c05', 'c10'],
    terms: ['Fila FIFO', 'ID do grupo (group ID)', 'ID de deduplicação', 'Deduplicação por conteúdo', 'Tópico FIFO', 'Cotas FIFO'],
  },
  {
    id: 'cap08',
    num: 8,
    title: 'Polling, lotes e custo',
    summary: 'Short e long polling, lotes de até 10 e o que de fato aparece na conta.',
    minutes: 6,
    levels: ['i10', 'c04'],
    terms: ['Short polling', 'Long polling', 'Batch'],
  },
  {
    id: 'cap09',
    num: 9,
    title: 'Retenção, atraso e tamanho',
    summary: 'Quanto tempo a mensagem vive, como atrasar a entrega e o que fazer com payloads grandes.',
    minutes: 7,
    levels: ['c02', 'c03', 'c11'],
    terms: ['Retenção', 'Delay queue', 'Tamanho máximo', 'Claim check', 'Criptografia em repouso'],
  },
  {
    id: 'cap10',
    num: 10,
    title: 'Função sob demanda lendo uma fila',
    summary: 'O leitor da fila, lotes, falha parcial, a regra dos 6×, concorrência máxima e batching window.',
    minutes: 9,
    levels: ['c06', 'c07', 'c14'],
    terms: ['Função sob demanda', 'Leitor da fila (poller)', 'Falhas por item do lote', 'Concorrência máxima', 'Batching window', 'Regra dos 6×'],
  },
  {
    id: 'cap11',
    num: 11,
    title: 'Cold start e concorrência',
    summary: 'Instâncias novas, instâncias provisionadas, concorrência reservada e throttling.',
    minutes: 7,
    levels: ['c13'],
    terms: ['Cold start', 'Provisioned concurrency', 'Concorrência reservada', 'Throttling'],
  },
  {
    id: 'cap12',
    num: 12,
    title: 'Tópico → função e endpoints',
    summary: 'Invocação assíncrona, novas tentativas, destino de falha e a DLQ da assinatura.',
    minutes: 8,
    levels: ['c09', 'c15'],
    terms: ['Invocação assíncrona', 'Destino de falha (on-failure)', 'Política de entrega', 'DLQ da assinatura'],
  },
  {
    id: 'cap13',
    num: 13,
    title: 'Juntando tudo',
    summary: 'Um checklist para desenhar (e revisar) uma arquitetura de mensageria de ponta a ponta.',
    minutes: 6,
    levels: ['c12'],
    terms: ['Latência p95'],
  },
];

/** Capítulos que visitantes leem sem conta: os das fases abertas. */
export const FREE_CHAPTER_IDS: ReadonlySet<string> = new Set(['cap01', 'cap02']);

/** O formato dos ids (o servidor confere o mesmo). */
export const CHAPTER_ID = /^cap\d{2}$/;

export function chapterMeta(id: string): ChapterMeta | undefined {
  return CHAPTERS.find((c) => c.id === id);
}

/** Capítulo que ensina o assunto de uma fase. */
export function chapterForLevel(levelId: string): ChapterMeta | undefined {
  return CHAPTERS.find((c) => c.levels.includes(levelId));
}

/** Capítulo que explica um termo do glossário. */
export function chapterForTerm(term: string): ChapterMeta | undefined {
  return CHAPTERS.find((c) => c.terms.includes(term));
}

export function nextChapter(id: string): ChapterMeta | undefined {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  return i >= 0 ? CHAPTERS[i + 1] : undefined;
}

/** Junta o texto com o catálogo. */
export function defineChapter(src: ChapterSource): Chapter {
  const meta = chapterMeta(src.id);
  if (!meta) throw new Error(`capítulo ${src.id} não está no catálogo`);
  return { ...meta, blocks: src.blocks };
}
