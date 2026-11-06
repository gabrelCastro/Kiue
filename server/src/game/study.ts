import { CONTENT_CHAPTERS } from '../../../content/study';
import { CHAPTER_ID, chapterMeta } from '../../../src/study/catalog';
import { HttpError } from '../errors';
import type { StudyRepo } from '../repos';

/**
 * Apostila no servidor: o texto dos capítulos fechados (só para quem está logado; o bundle traz o
 * catálogo e os capítulos abertos) e os capítulos lidos de cada conta.
 */
export class StudyContent {
  private readonly bodies = new Map<string, string>();

  constructor(chapters = CONTENT_CHAPTERS) {
    for (const chapter of chapters) this.bodies.set(chapter.id, JSON.stringify({ chapter }));
  }

  /** Corpo JSON `{ chapter }` pronto para enviar. */
  body(id: string): string {
    const body = this.bodies.get(id);
    if (!body) throw new HttpError('not_found', 'Capítulo não encontrado.', 404);
    return body;
  }

  get ids(): string[] {
    return [...this.bodies.keys()];
  }
}

const MAX_READ = 100;
const invalid = (message: string) => new HttpError('validation', message, 400, 'read');

/** Aceita `{ read: ["cap01", ...] }` com ids de capítulos que existem no catálogo. */
export function parseRead(body: Record<string, unknown>): string[] {
  const raw = body.read;
  if (!Array.isArray(raw)) throw invalid('Envie os capítulos lidos como uma lista.');
  if (raw.length > MAX_READ) throw invalid('Capítulos demais de uma vez.');
  const ids = new Set<string>();
  for (const id of raw) {
    if (typeof id !== 'string' || !CHAPTER_ID.test(id) || !chapterMeta(id)) throw invalid(`Capítulo inválido: ${String(id).slice(0, 40)}`);
    ids.add(id);
  }
  return [...ids];
}

/** Capítulos lidos por conta. A escrita é uma união: pode repetir ou chegar fora de ordem. */
export class StudyService {
  constructor(
    private readonly repo: StudyRepo,
    private readonly now: () => number = Date.now,
  ) {}

  get(userId: string): string[] {
    return this.repo.list(userId);
  }

  add(userId: string, body: Record<string, unknown>): string[] {
    this.repo.add(userId, parseRead(body), this.now());
    return this.repo.list(userId);
  }
}
