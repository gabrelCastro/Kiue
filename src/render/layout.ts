import { CubicBezierCurve3, LineCurve3, Vector3, type Curve } from 'three';
import type { GraphNode } from '../sim/types';

/** As peças (menos a fila) são modeladas em escala 1 e ampliadas por este fator. */
export const NODE_SCALE = 1.3;
export const QUEUE_LEN = 3.6;
export const QUEUE_HEIGHT = 1.1;
export const QUEUE_DEPTH = 1.0;
/** Altura do pedestal: o conteúdo das peças começa acima dele. */
export const LIFT = 0.16;
/** Raio (escala 1) do anel de invocações em volta da Lambda. */
export const LAMBDA_RING = 1.25;
export const PORT_Y = 0.6;
const PORT_DX = 0.8 * NODE_SCALE;
/** Quantas mensagens por camada e quantas camadas cabem dentro da fila. */
export const QUEUE_COLS = 9;
export const QUEUE_LAYERS = 4;
/** Altura de um pacote (mensagem); as camadas na fila se empilham por ela. */
export const TOKEN_H = 0.22;

export function outPort(n: GraphNode): Vector3 {
  const dx = n.kind === 'queue' ? QUEUE_LEN / 2 : PORT_DX;
  return new Vector3(n.x + dx, PORT_Y, n.z);
}

export function inPort(n: GraphNode): Vector3 {
  const dx = n.kind === 'queue' ? QUEUE_LEN / 2 : PORT_DX;
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
  const p0 = new Vector3(from.x, PORT_Y, from.z + dir * (QUEUE_DEPTH / 2 + 0.1));
  const p3 = new Vector3(to.x, PORT_Y, to.z - dir * (QUEUE_DEPTH / 2 + 0.1));
  if (p0.distanceTo(p3) < 0.5) return new LineCurve3(p0, p3);
  const d = Math.max(0.8, Math.abs(p3.z - p0.z) * 0.5);
  return new CubicBezierCurve3(p0, p0.clone().add(new Vector3(0, 0, dir * d)), p3.clone().add(new Vector3(0, 0, -dir * d)), p3);
}

/** Posição de uma mensagem parada dentro da fila (índice 0 = cabeça, à direita). */
export function queueSlot(n: GraphNode, i: number, out: Vector3): boolean {
  const layer = Math.floor(i / QUEUE_COLS);
  if (layer >= QUEUE_LAYERS) return false;
  const col = i % QUEUE_COLS;
  // os pacotes assentam na esteira e se empilham de verdade (sem vão entre as camadas)
  out.set(n.x + QUEUE_LEN / 2 - 0.3 - col * 0.36, LIFT + 0.065 + TOKEN_H / 2 + layer * (TOKEN_H + 0.02), n.z);
  return true;
}

/** Posição de uma invocação ativa, num anel em volta da Lambda. */
export function lambdaSlot(n: GraphNode, j: number, count: number, out: Vector3): void {
  const a = (j / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
  const r = LAMBDA_RING * NODE_SCALE;
  out.set(n.x + Math.cos(a) * r, 1.1, n.z + Math.sin(a) * r);
}

/** Posição do "slot" de um worker sobre o consumidor. */
export function workerSlot(n: GraphNode, j: number, count: number, out: Vector3): void {
  const perRow = Math.min(3, count);
  const row = Math.floor(j / 3);
  const col = j % 3;
  const rows = Math.ceil(count / 3);
  const s = 0.45 * NODE_SCALE;
  out.set(n.x + (col - (perRow - 1) / 2) * s, (LIFT + 1.0) * NODE_SCALE, n.z + (row - (rows - 1) / 2) * s);
}
