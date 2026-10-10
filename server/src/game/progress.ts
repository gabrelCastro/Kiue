import { HttpError } from '../errors';
import type { ProgressRecord, ProgressRepo } from '../repos';

/** O mesmo formato que o jogo guarda no navegador. */
export interface LevelProgress {
  stars: number;
  quizCorrect?: number;
}
export type Progress = Record<string, LevelProgress>;

const LEVEL_ID = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_ENTRIES = 200;
const MAX_STARS = 3;
const MAX_QUIZ = 50;

const invalid = (message: string) => new HttpError('validation', message, 400, 'progress');

function isInt(v: unknown, max: number): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
}

/** Aceita `{ progress: { [fase]: { stars, quizCorrect? } } }`. */
export function parseProgress(body: Record<string, unknown>): Progress {
  const raw = body.progress;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('Envie o progresso como um objeto por fase.');
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_ENTRIES) throw invalid('Fases demais de uma vez.');
  const out: Progress = {};
  for (const [id, value] of entries) {
    if (!LEVEL_ID.test(id)) throw invalid(`Fase inválida: ${id.slice(0, 40)}`);
    if (!value || typeof value !== 'object') throw invalid(`Progresso inválido na fase ${id}.`);
    const { stars, quizCorrect } = value as Record<string, unknown>;
    if (!isInt(stars, MAX_STARS)) throw invalid(`Estrelas inválidas na fase ${id}.`);
    if (quizCorrect !== undefined && quizCorrect !== null && !isInt(quizCorrect, MAX_QUIZ)) throw invalid(`Acertos de quiz inválidos na fase ${id}.`);
    out[id] = typeof quizCorrect === 'number' ? { stars, quizCorrect } : { stars };
  }
  return out;
}

/**
 * Progresso por conta. A escrita é uma mesclagem que fica com o melhor resultado de cada fase: pode
 * ser repetida, chegar fora de ordem ou vir de dois aparelhos ao mesmo tempo sem perder nada.
 */
export class ProgressService {
  constructor(
    private readonly repo: ProgressRepo,
    private readonly now: () => number = Date.now,
  ) {}

  get(userId: string): Progress {
    const out: Progress = {};
    for (const r of this.repo.list(userId)) out[r.levelId] = r.quizCorrect === null ? { stars: r.stars } : { stars: r.stars, quizCorrect: r.quizCorrect };
    return out;
  }

  merge(userId: string, body: Record<string, unknown>): Progress {
    const now = this.now();
    const records: ProgressRecord[] = Object.entries(parseProgress(body)).map(([levelId, p]) => ({
      levelId,
      stars: p.stars,
      quizCorrect: p.quizCorrect ?? null,
      updatedAt: now,
    }));
    this.repo.mergeBest(userId, records);
    return this.get(userId);
  }

  clear(userId: string): void {
    this.repo.clear(userId);
  }
}
