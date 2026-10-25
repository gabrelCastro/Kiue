import { BufferAttribute, BufferGeometry } from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODEL_DATA } from './models.gen';

/*
 * Malhas das peças modeladas em OpenSCAD (models/*.scad → scripts/models.mjs → models.gen.ts).
 *
 * O OpenSCAD trabalha em mm com Z para cima e a frente em −Y; o jogo usa Y para cima e a frente
 * em +z. 100 mm = 1 unidade do jogo. Então (x, y, z) do .scad vira (x, z, −y) / 100.
 */

/** Ângulo a partir do qual uma aresta fica viva (normais separadas); abaixo disso, suavizada. */
const CREASE = (35 * Math.PI) / 180;

const cache = new Map<string, BufferGeometry>();

function decode(name: string): BufferGeometry {
  const entry = MODEL_DATA[name];
  if (!entry) throw new Error(`modelo desconhecido: ${name}`);
  const bin = atob(entry.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const n = entry.v;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = view.getInt16(i * 6, true);
    const y = view.getInt16(i * 6 + 2, true);
    const z = view.getInt16(i * 6 + 4, true);
    pos[i * 3] = x / 10000;
    pos[i * 3 + 1] = z / 10000;
    pos[i * 3 + 2] = -y / 10000;
  }
  const count = (bytes.length - n * 6) / 2;
  const index = new Uint16Array(count);
  for (let i = 0; i < count; i++) index[i] = view.getUint16(n * 6 + i * 2, true);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(new BufferAttribute(index, 1));
  // quinas vivas nos chanfros, superfícies curvas lisas
  return toCreasedNormals(geo, CREASE);
}

/**
 * Geometria de uma parte ("consumidor/corpo"), já em unidades do jogo. Cada chamada devolve uma
 * cópia: a luz é assada nas cores dos vértices de cada peça (bake.ts).
 */
export function modelGeometry(name: string): BufferGeometry {
  let geo = cache.get(name);
  if (!geo) {
    geo = decode(name);
    cache.set(name, geo);
  }
  return geo.clone();
}

/** Várias cópias da mesma parte, deslocadas, numa geometria só (uma chamada de desenho). */
export function modelGeometryAt(name: string, offsets: { x: number; y: number; z: number }[]): BufferGeometry {
  const parts = offsets.map((o) => modelGeometry(name).translate(o.x, o.y, o.z));
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}
