import type { NodeKind } from '../sim/types';

/**
 * Meia-largura (x) e meia-profundidade (z) do espaço que cada peça ocupa no chão, contando a
 * base. Usado para não deixar peças se sobreporem; o desenho 3D (render/nodes.ts) segue estas medidas.
 */
export const FOOTPRINT: Record<NodeKind, { hx: number; hz: number }> = {
  producer: { hx: 1.05, hz: 1.0 },
  topic: { hx: 1.1, hz: 1.1 },
  queue: { hx: 1.95, hz: 0.65 },
  consumer: { hx: 1.1, hz: 1.05 },
  lambda: { hx: 1.5, hz: 1.5 },
};

/** Folga mínima entre as bases de duas peças. */
const GAP = 0.3;

export function footprintsOverlap(a: NodeKind, ax: number, az: number, b: NodeKind, bx: number, bz: number): boolean {
  const fa = FOOTPRINT[a];
  const fb = FOOTPRINT[b];
  return Math.abs(ax - bx) < fa.hx + fb.hx + GAP && Math.abs(az - bz) < fa.hz + fb.hz + GAP;
}
