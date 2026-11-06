import type { Access } from '../game/access';
import { CHAPTERS, chapterForLevel, chapterMeta, FREE_CHAPTER_IDS } from './catalog';
import { FREE_CHAPTERS } from './free';
import type { Chapter, ChapterMeta } from './types';

export type StudyTab = 'apostila' | 'glossario' | 'revisao';

/** Para onde vão os capítulos marcados como lidos: este navegador (visitante) ou a conta. */
export interface ReadSink {
  save(ids: string[]): void;
}

const READ_KEY = 'kiue:study-read:v1';

/** Lidos de visitante, guardados neste navegador. */
export function loadLocalRead(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && !!chapterMeta(id)) : [];
  } catch {
    return [];
  }
}

export function saveLocalRead(ids: Iterable<string>): void {
  try {
    const list = [...ids];
    if (list.length) localStorage.setItem(READ_KEY, JSON.stringify(list));
    else localStorage.removeItem(READ_KEY);
  } catch {
    // sem storage: vale só nesta sessão
  }
}

/**
 * Estado da sessão de estudos: aba e capítulo abertos, o painel dentro da fase, os capítulos já
 * carregados e os lidos. Mora no Controller (`ctrl.study`) e avisa a UI pelo mesmo `notify`.
 */
export class StudyState {
  tab: StudyTab = 'apostila';
  /** Capítulo aberto na apostila. */
  chapterId = CHAPTERS[0].id;
  /** Capítulo aberto no painel "Estudar" dentro da fase (null = fechado). */
  panel: string | null = null;
  read = new Set<string>();
  readSink: ReadSink = { save: () => saveLocalRead(this.read) };
  /** Capítulo sendo buscado no servidor. */
  loading: string | null = null;
  /** Busca um capítulo fechado (a API, para quem tem conta). */
  fetchChapter: (id: string) => Promise<Chapter> = () => Promise.reject(new Error('Este capítulo não está disponível agora.'));
  /** Alguém tentou abrir um capítulo que pede conta. */
  onAccountRequired: (chapter: ChapterMeta) => void = () => {};
  private chapters = new Map<string, Chapter>(FREE_CHAPTERS.map((c) => [c.id, c]));
  private fetching = new Map<string, Promise<Chapter>>();
  private failed = new Map<string, string>();

  constructor(
    private readonly notify: () => void,
    private readonly access: () => Access,
  ) {
    this.read = new Set(loadLocalRead());
  }

  /** Texto do capítulo, se já estiver aqui. */
  chapter(id: string): Chapter | undefined {
    return this.chapters.get(id);
  }

  /** Erro da última busca do capítulo (para mostrar com "tentar de novo"). */
  error(id: string): string | undefined {
    return this.failed.get(id);
  }

  requiresAccount(id: string): boolean {
    return this.access() === 'guest' && !FREE_CHAPTER_IDS.has(id);
  }

  /** Garante o texto do capítulo (busca no servidor se preciso). Null se pede conta ou falhou. */
  async ensure(id: string): Promise<Chapter | null> {
    const have = this.chapters.get(id);
    if (have) return have;
    if (this.requiresAccount(id) || !chapterMeta(id)) return null;
    let pending = this.fetching.get(id);
    if (!pending) {
      const access = this.access();
      this.loading = id;
      this.failed.delete(id);
      this.notify();
      pending = this.fetchChapter(id).finally(() => {
        this.fetching.delete(id);
        if (this.loading === id) this.loading = null;
      });
      this.fetching.set(id, pending);
      pending.then(
        (ch) => {
          // se a conta saiu enquanto buscava, o conteúdo não fica
          if (this.access() === access) this.chapters.set(id, ch);
          this.notify();
        },
        (e) => {
          this.failed.set(id, e instanceof Error ? e.message : 'Não foi possível carregar o capítulo.');
          this.notify();
        },
      );
    }
    try {
      return await pending;
    } catch {
      return null;
    }
  }

  setTab(tab: StudyTab): void {
    this.tab = tab;
    this.notify();
  }

  /** Abre um capítulo na apostila (e busca o texto, se puder). */
  select(id: string): void {
    if (!chapterMeta(id)) return;
    this.chapterId = id;
    this.tab = 'apostila';
    this.notify();
    void this.ensure(id);
  }

  /** Abre o painel "Estudar" no capítulo ligado à fase. */
  openPanel(levelId: string | null, chapterId?: string): void {
    const id = chapterId ?? (levelId ? chapterForLevel(levelId)?.id : undefined) ?? this.chapterId;
    this.panel = id;
    this.notify();
    void this.ensure(id);
  }

  closePanel(): void {
    if (this.panel === null) return;
    this.panel = null;
    this.notify();
  }

  markRead(id: string): void {
    if (this.read.has(id) || !chapterMeta(id)) return;
    this.read.add(id);
    this.readSink.save([id]);
    this.notify();
  }

  /** Troca o conjunto de lidos (a conta chegou do servidor, ou saiu). */
  setRead(ids: Iterable<string>): void {
    this.read = new Set([...ids].filter((id) => chapterMeta(id)));
    this.notify();
  }

  /** Saiu da conta: os capítulos fechados saem da memória. */
  dropLocked(): void {
    for (const id of [...this.chapters.keys()]) if (!FREE_CHAPTER_IDS.has(id)) this.chapters.delete(id);
    this.fetching.clear();
    this.failed.clear();
    this.loading = null;
  }
}
