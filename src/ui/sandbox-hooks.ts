import { useEffect, useReducer } from 'preact/hooks';
import { sandboxes, type SandboxStore } from '../account/sandboxes';

/** Re-renderiza quando a lista de sandboxes salvos muda. */
export function useSandboxes(): SandboxStore {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const unsubscribe = sandboxes.subscribe(() => force(undefined));
    force(undefined);
    return unsubscribe;
  }, []);
  return sandboxes;
}
