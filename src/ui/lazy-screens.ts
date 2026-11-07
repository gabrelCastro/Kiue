import { useEffect, useState } from 'preact/hooks';

/*
 * A tela da fase (inspetor, resultado, painéis) e a de estudos ficam fora do JavaScript principal:
 * a home não precisa delas, e baixar e executar menos código a deixa aparecer antes. Elas são
 * baixadas em segundo plano logo depois (prefetchScreens), então o clique continua instantâneo.
 */

type LevelModule = typeof import('./LevelScreen');
type StudyModule = typeof import('./Study');

let levelModule: LevelModule | null = null;
let studyModule: StudyModule | null = null;
let levelPending: Promise<LevelModule> | null = null;
let studyPending: Promise<StudyModule> | null = null;

export function loadLevelScreen(): Promise<LevelModule> {
  return (levelPending ??= import('./LevelScreen').then((m) => (levelModule = m)));
}

export function loadStudyScreen(): Promise<StudyModule> {
  return (studyPending ??= import('./Study').then((m) => (studyModule = m)));
}

function useModule<T>(current: () => T | null, load: () => Promise<T>, wanted: boolean): T | null {
  const [mod, setMod] = useState<T | null>(current);
  useEffect(() => {
    if (!wanted || mod) return;
    let alive = true;
    void load().then((m) => alive && setMod(() => m));
    return () => {
      alive = false;
    };
  }, [wanted, mod]);
  return mod;
}

/** O módulo da tela da fase, quando ela é pedida (null enquanto baixa). */
export function useLevelScreen(wanted: boolean): LevelModule | null {
  return useModule(() => levelModule, loadLevelScreen, wanted);
}

/** O módulo da tela de estudos (também traz o painel lateral usado dentro da fase). */
export function useStudyScreen(wanted: boolean): StudyModule | null {
  return useModule(() => studyModule, loadStudyScreen, wanted);
}

/**
 * Baixa as telas no primeiro momento ocioso depois da home aparecer: a da fase primeiro (é o clique
 * mais provável), a de estudos em seguida. São pequenas (~19 e ~7 KB comprimidos).
 */
export function prefetchScreens(): void {
  const idle = (window as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200));
  idle(() => void loadLevelScreen().then(() => idle(() => void loadStudyScreen())), { timeout: 1500 });
}
