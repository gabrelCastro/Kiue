export interface LevelProgress {
  stars: number;
  quizCorrect?: number;
}

export type Progress = Record<string, LevelProgress>;

const KEY = 'kiue:progress:v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // sem storage (aba privada, etc.): o progresso só vale nesta sessão
  }
}

/** Junta dois progressos ficando com o melhor de cada fase (a mesma regra do servidor). */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out: Progress = { ...a };
  for (const [id, p] of Object.entries(b)) {
    const prev = out[id];
    if (!prev) {
      out[id] = p;
      continue;
    }
    const quiz = Math.max(prev.quizCorrect ?? -1, p.quizCorrect ?? -1);
    out[id] = quiz >= 0 ? { stars: Math.max(prev.stars, p.stars), quizCorrect: quiz } : { stars: Math.max(prev.stars, p.stars) };
  }
  return out;
}

/** Para onde vai o progresso: este navegador (visitante) ou a conta (quem cuida da sincronização troca). */
export interface ProgressSink {
  /** `changed` traz só as fases que mudaram; `all` é o progresso inteiro já atualizado. */
  save(all: Progress, changed: Progress): void;
  clear(): void;
}

export const localProgress: ProgressSink = {
  save: (all) => saveProgress(all),
  clear: () => saveProgress({}),
};
