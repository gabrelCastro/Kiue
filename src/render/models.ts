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

/** Modelos conhecidos: os do jogo base e os de cada tema já carregado (registerModels). */
const DATA: Record<string, { v: number; data: string }> = { ...MODEL_DATA };

/** Os kits de tema registram os próprios modelos quando são carregados (models.<tema>.gen.ts). */
export function registerModels(data: Record<string, { v: number; data: string }>): void {
  Object.assign(DATA, data);
}

function decode(name: string): BufferGeometry {
  const entry = DATA[name];
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
 * Geometria de uma parte ("consumidor/corpo"), já em unidades do jogo. A mesma instância é
 * compartilhada (não mexa nela): bake.ts assa a luz numa cópia, guardada por parte e pose.
 */
export function modelGeometry(name: string): BufferGeometry {
  let geo = cache.get(name);
  if (!geo) {
    geo = decode(name);
    geo.userData = { src: name, shared: true };
    cache.set(name, geo);
  }
  return geo;
}

/** Várias cópias da mesma parte, deslocadas, numa geometria só (uma chamada de desenho). */
export function modelGeometryAt(name: string, offsets: { x: number; y: number; z: number }[]): BufferGeometry {
  const key = `${name}@${offsets.map((o) => `${o.x.toFixed(4)},${o.y.toFixed(4)},${o.z.toFixed(4)}`).join(';')}`;
  let merged = cache.get(key);
  if (!merged) {
    const parts = offsets.map((o) => modelGeometry(name).clone().translate(o.x, o.y, o.z));
    merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    merged.userData = { src: key, shared: true };
    cache.set(key, merged);
  }
  return merged;
}
