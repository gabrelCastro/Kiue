// A cena 3D (three.js) é a maior parte do bundle e o menu não precisa dela: ela fica num chunk
// separado, que começa a baixar em segundo plano assim que o menu aparece.
let pending: Promise<typeof import('../render/scene')> | null = null;

export function loadScene(): Promise<typeof import('../render/scene')> {
  return (pending ??= import('../render/scene'));
}

/** Baixa a cena quando o navegador estiver ocioso. */
export function prefetchScene(): void {
  const idle = (window as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200));
  idle(() => void loadScene());
}
