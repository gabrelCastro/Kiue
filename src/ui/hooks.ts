import { createContext } from 'preact';
import { useContext, useEffect, useReducer } from 'preact/hooks';
import type { Controller } from '../game/controller';

export const ControllerContext = createContext<Controller | null>(null);

/** Retorna o controller e re-renderiza quando ele notifica mudanças. */
export function useController(): Controller {
  const ctrl = useContext(ControllerContext);
  if (!ctrl) throw new Error('Controller ausente');
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const unsubscribe = ctrl.subscribe(() => force(undefined));
    force(undefined); // pega mudanças entre a renderização e a inscrição
    return unsubscribe;
  }, [ctrl]);
  return ctrl;
}

/** Re-renderiza periodicamente enquanto `active` (para métricas ao vivo). */
export function useTicker(active: boolean, ms = 200): void {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force(undefined), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
