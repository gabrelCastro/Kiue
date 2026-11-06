/*
 * Apostila: capítulos escritos como blocos tipados (nada de HTML ou Markdown cru vindo do servidor).
 * Dentro de um texto, `**assim**` vira negrito e `{{termo}}` vira um termo do glossário, com a
 * definição ao passar o mouse (ou ao tocar). O resto é texto puro.
 */

export type FlowKind = 'vis' | 'inv' | 'ok' | 'bad' | 'plain';

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'list'; items: string[] }
  /** Destaque: "Na prática" (dica), "Cuidado" (armadilha comum) ou "Na prova" (o que costuma cair). */
  | { t: 'note'; kind: 'pratica' | 'cuidado' | 'prova'; text: string }
  /** Diagrama de fluxo em blocos: estados ou peças, ligados por setas com rótulo. */
  | { t: 'flow'; steps: { label: string; kind?: FlowKind }[]; arrows?: string[] }
  | { t: 'table'; head: string[]; rows: string[][] };

export interface ChapterMeta {
  id: string;
  /** Número na ordem de leitura (1, 2, 3…). */
  num: number;
  title: string;
  /** Uma frase sobre o que o capítulo ensina (aparece no índice e no painel da fase). */
  summary: string;
  /** Minutos de leitura, aproximado. */
  minutes: number;
  /** Fases que treinam o assunto do capítulo. */
  levels: string[];
  /** Termos do glossário explicados aqui (o glossário aponta "ler no capítulo N"). */
  terms: string[];
}

export interface Chapter extends ChapterMeta {
  blocks: Block[];
}

/** Como um capítulo é escrito: o catálogo completa número, título e o resto. */
export interface ChapterSource {
  id: string;
  blocks: Block[];
}
