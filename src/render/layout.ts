import { CubicBezierCurve3, LineCurve3, Vector3, type Curve } from 'three';
import type { GraphNode } from '../sim/types';

export const QUEUE_LEN = 3;
export const PORT_Y = 0.45;
/** Quantas mensagens por camada e quantas camadas cabem dentro da fila. */
export const QUEUE_COLS = 9;
export const QUEUE_LAYERS = 3;

export function outPort(n: GraphNode): Vector3 {
  const dx = n.kind === 'queue' ? QUEUE_LEN / 2 : 0.8;
  return new Vector3(n.x + dx, PORT_Y, n.z);
}

export function inPort(n: GraphNode): Vector3 {
  const dx = n.kind === 'queue' ? QUEUE_LEN / 2 : 0.8;
  return new Vector3(n.x - dx, PORT_Y, n.z);
}

export function edgeCurve(from: GraphNode, to: GraphNode): Curve<Vector3> {
  const p0 = outPort(from);
  const p3 = inPort(to);
  const d = Math.max(1.2, Math.abs(p3.x - p0.x) * 0.5);
  return new CubicBezierCurve3(p0, p0.clone().add(new Vector3(d, 0, 0)), p3.clone().add(new Vector3(-d, 0, 0)), p3);
}

/** Ligação fila → DLQ: sai por baixo da fila e entra por cima da DLQ (eixo z). */
export function dlqCurve(from: GraphNode, to: GraphNode): Curve<Vector3> {
  const dir = Math.sign(to.z - from.z) || 1;
  const p0 = new Vector3(from.x, PORT_Y, from.z + dir * 0.55);
  const p3 = new Vector3(to.x, PORT_Y, to.z - dir * 0.55);
  if (p0.distanceTo(p3) < 0.5) return new LineCurve3(p0, p3);
  const d = Math.max(0.8, Math.abs(p3.z - p0.z) * 0.5);
  return new CubicBezierCurve3(p0, p0.clone().add(new Vector3(0, 0, dir * d)), p3.clone().add(new Vector3(0, 0, -dir * d)), p3);
}

/** Posição de uma mensagem parada dentro da fila (índice 0 = cabeça, à direita). */
export function queueSlot(n: GraphNode, i: number, out: Vector3): boolean {
  const layer = Math.floor(i / QUEUE_COLS);
  if (layer >= QUEUE_LAYERS) return false;
  const col = i % QUEUE_COLS;
  out.set(n.x + QUEUE_LEN / 2 - 0.3 - col * 0.3, 0.2 + layer * 0.3, n.z);
  return true;
}

/** Posição de uma invocação ativa, num anel em volta da Lambda. */
export function lambdaSlot(n: GraphNode, j: number, count: number, out: Vector3): void {
  const a = (j / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
  out.set(n.x + Math.cos(a) * 1.05, 1.0, n.z + Math.sin(a) * 1.05);
}

/** Posição do "slot" de um worker sobre o consumidor. */
export function workerSlot(n: GraphNode, j: number, count: number, out: Vector3): void {
  const perRow = Math.min(3, count);
  const row = Math.floor(j / 3);
  const col = j % 3;
  const rows = Math.ceil(count / 3);
  out.set(n.x + (col - (perRow - 1) / 2) * 0.45, 1.05, n.z + (row - (rows - 1) / 2) * 0.45);
}
