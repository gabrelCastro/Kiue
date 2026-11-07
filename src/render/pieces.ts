import { Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bakedMaterial } from './bake';
import { LIFT } from './layout';
import { modelGeometry } from './models';
import { contactShadowTexture } from './textures';
import { SCENE } from '../theme';

/* Auxiliares das peças (nodes.ts e os kits de tema em themes/). */

/** Uma parte modelada no OpenSCAD, apoiada no pedestal. */
export function part(name: string, material: MeshBasicMaterial): Mesh {
  const m = new Mesh(modelGeometry(name), material);
  m.position.y = LIFT;
  return m;
}

/**
 * Material das peças: luz assada nos vértices (ver bake.ts). `emissive` (janela acesa, LED) vira
 * cor pura, sem sombreado; os demais campos de material físico antigos são ignorados.
 */
export function mat(color: string, extra: { flatShading?: boolean; emissive?: string; emissiveIntensity?: number; roughness?: number; metalness?: number } = {}) {
  if (extra.emissive) return new MeshBasicMaterial({ color });
  return bakedMaterial(color, { flat: extra.flatShading });
}

export function rounded(w: number, h: number, d: number, radius = 0.1) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2));
}

/** Mistura a cor da peça com `toward` (por padrão, a base do modo: claro de dia, grafite à noite). */
export function shade(color: string, amount: number, toward = SCENE.base): string {
  return `#${new Color(color).lerp(new Color(toward), amount).getHexString()}`;
}

/** Mancha de sombra suave sob a peça: assenta o modelo no chão sem custo de luz. */
export function contactShadow(group: Group, w: number, d: number): void {
  const blob = new Mesh(
    new PlaneGeometry(w * 1.6, d * 1.6),
    new MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  // deslocada para longe da luz (que vem da esquerda e da frente): faz o papel da sombra projetada
  blob.position.set(w * 0.16, 0.004, -d * 0.12);
  blob.renderOrder = -1;
  group.add(blob);
}

/**
 * Base de "peça de tabuleiro": uma placa clara na cor do serviço, com um filete mais forte em
 * volta. Dá unidade visual entre as peças e destaca cada uma do chão, sem brilho.
 */
export function pedestal(group: Group, w: number, d: number, color: string): Mesh {
  const glow = new Mesh(rounded(w + 0.08, 0.03, d + 0.08, 0.06), new MeshBasicMaterial({ color: shade(color, 0.35) }));
  glow.position.y = 0.015;
  const base = new Mesh(rounded(w, 0.14, d, 0.07), mat(shade(color, 0.86), { roughness: 0.8, metalness: 0 }));
  base.position.y = 0.09;
  group.add(glow, base);
  return base;
}
