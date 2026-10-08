export interface LevelProgress {
  stars: number;
  quizCorrect?: number;
}

export type Progress = Record<string, LevelProgress>;

const KEY = 'sqslearn:progress:v1';

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
