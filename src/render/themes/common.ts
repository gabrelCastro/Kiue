import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, type Material } from 'three';
import type { GraphNode } from '../../sim/types';
import { LIFT, workerCell } from '../layout';
import { THEME_MODEL_DATA as ROBO_MODELS } from '../models.robo.gen';
import { modelGeometry, registerModels } from '../models';
import { contactShadow, mat, matLive, part, pedestal } from '../pieces';
import { SCENE, SERVICE, WORKER } from '../../theme';
import type { SendFx, WorkerPose, WorkerRig } from './kit';

/*
 * Peças comuns dos temas com robozinhos (models/robo.scad): o robô, o rig de "atendentes" (um robô
 * por worker que reage à pose), a animação de envio dos produtores e a base dos consumidores
 * (praça, pedestal, células da grade e luzes de estado). Os modelos do robô vêm num arquivo à parte,
 * baixado junto com o primeiro tema que o usa.
 */

registerModels(ROBO_MODELS);

/** Olhos acesos dos robôs (iguais nos dois modos, como as janelas acesas). */
export const EYES = '#e9f3ff';
export const CARDBOARD = '#c8a165';
/** Janela/farol aceso (como as janelas da doca). */
export const LIT = '#fff1c2';
/** Ombro do robô (robo.scad SHOULDER). */
const SHOULDER_Y = 0.2;
/** Altura da praça dos consumidores (comum_tema.scad C_PRACA). */
export const PRACA_H = 0.06;
/** Velocidade com que os workers seguem a pose (1/ms). */
export const FOLLOW = 0.008;

export interface RobotMaterials {
  body: Material;
  visor: Material;
  eyes: Material;
  hat: Material;
}

export function robotMaterials(): RobotMaterials {
  return { body: mat(SCENE.white), visor: mat(SCENE.ink), eyes: mat(EYES, { emissive: EYES }), hat: mat(SCENE.accent) };
}

/** Um robô montado com malhas comuns (o do produtor). Devolve o corpo e o pivô dos braços. */
export function robot(mats: RobotMaterials, opts: { hat?: boolean } = {}): { root: Group; arms: Group } {
  const root = new Group();
  root.add(new Mesh(modelGeometry('robo/corpo'), mats.body), new Mesh(modelGeometry('robo/visor'), mats.visor), new Mesh(modelGeometry('robo/olhos'), mats.eyes));
  if (opts.hat) root.add(new Mesh(modelGeometry('robo/chapeu'), mats.hat));
  const arms = new Group();
  arms.position.y = SHOULDER_Y;
  arms.add(new Mesh(modelGeometry('robo/bracos'), mats.body));
  root.add(arms);
  root.userData.dynamic = true; // mexe: fica fora da malha junta (merge.ts)
  return { root, arms };
}

/** Caixote nos braços do robô (pivô dos braços), para quem carrega a mensagem. */
export function crateInArms(arms: Object3D, raised = false): Mesh {
  const crate = new Mesh(new BoxGeometry(0.15, 0.11, 0.15), mat(CARDBOARD));
  if (raised) crate.position.set(0, 0.02, 0.17);
  else crate.position.set(0, -0.06, 0.15);
  arms.add(crate);
  return crate;
}

/**
 * Animação de envio genérica: a cada mensagem, `lift` vai de 0 a 1 e volta em `ms` (uma por vez,
 * para não ficar recomeçando com muitas mensagens). `apply` desenha o quadro.
 */
export class LiftFx implements SendFx {
  private at = -Infinity;
  constructor(
    private readonly ms: number,
    private readonly apply: (lift: number, now: number) => void,
  ) {
    apply(0, 0);
  }
  trigger(now: number): void {
    if (now - this.at >= this.ms) this.at = now;
  }
  update(now: number): void {
    const p = (now - this.at) / this.ms;
    this.apply(p < 1 ? Math.sin(Math.PI * p) : 0, now);
  }
}

/** Robô do produtor que ergue o que carrega a cada envio (e balança de leve no resto do tempo). */
export function liftArmsFx(root: Object3D, arms: Object3D, base: number, amount: number, ms = 520): LiftFx {
  const y = root.position.y;
  return new LiftFx(ms, (lift, now) => {
    arms.rotation.x = base - amount * lift;
    root.position.y = y + 0.012 * lift + 0.004 * Math.sin(now * 0.002);
  });
}

interface Vendor {
  pose: WorkerPose;
  root: Object3D;
  arms: Object3D;
  yaw: number;
  tilt: number;
  pitch: number;
  size: number;
  phase: number;
}

export function approach(from: number, to: number, k: number): number {
  return from + (to - from) * k;
}

/**
 * Robôs atendentes, um por worker (feira, guichês, mesinhas). Cada parte do robô é um
 * InstancedMesh: 4 ou 5 chamadas de desenho por consumidor, com 1 ou 9 workers.
 *  - trabalhando: de frente, braços mexendo na caixa;
 *  - buscando: virado para a esquerda (de onde vêm as mensagens), acenando;
 *  - parado: de frente, braços baixos;
 *  - desligado: o lugar fica vazio (o robô some);
 *  - caído: tombado para trás.
 */
export class VendorRig implements WorkerRig {
  readonly meshes: InstancedMesh[];
  private readonly vendors: Vendor[];
  private readonly scale: number;

  /** @param behind quanto o robô fica atrás do centro da célula (−z no jogo) */
  constructor(cells: { x: number; y: number; z: number }[], mats: RobotMaterials, opts: { hat?: boolean; scale?: number; behind?: number } = {}) {
    const n = cells.length;
    this.scale = opts.scale ?? 0.85;
    const geo = (name: string) => modelGeometry(`robo/${name}`);
    this.meshes = [
      new InstancedMesh(geo('corpo'), mats.body, n),
      new InstancedMesh(geo('visor'), mats.visor, n),
      new InstancedMesh(geo('olhos'), mats.eyes, n),
      new InstancedMesh(geo('bracos'), mats.body, n),
      ...(opts.hat ? [new InstancedMesh(geo('chapeu'), mats.hat, n)] : []),
    ];
    for (const m of this.meshes) m.frustumCulled = false;
    const behind = opts.behind ?? 0.08;
    this.vendors = cells.map((c, j) => {
      const root = new Object3D();
      root.position.set(c.x, c.y, c.z - behind);
      const arms = new Object3D();
      arms.position.y = SHOULDER_Y;
      root.add(arms);
      return { pose: 'idle', root, arms, yaw: 0, tilt: 0, pitch: 0.4, size: 1, phase: j * 1.3 };
    });
    this.apply(0);
  }

  setPose(j: number, pose: WorkerPose): void {
    const v = this.vendors[j];
    if (v) v.pose = pose;
  }

  update(dt: number, t: number): void {
    const k = 1 - Math.exp(-dt * FOLLOW);
    for (const v of this.vendors) {
      const target = this.target(v, t);
      v.yaw = approach(v.yaw, target.yaw, k);
      v.tilt = approach(v.tilt, target.tilt, k);
      v.pitch = approach(v.pitch, target.pitch, Math.min(1, k * 2));
      v.size = approach(v.size, target.size, k);
    }
    this.apply(t);
  }

  private target(v: Vendor, t: number): { yaw: number; tilt: number; pitch: number; size: number } {
    switch (v.pose) {
      case 'work':
        return { yaw: 0, tilt: 0, pitch: 0.35 + 0.18 * Math.sin(t * 8 + v.phase), size: 1 };
      case 'poll':
        return { yaw: -Math.PI / 2, tilt: 0, pitch: -1.3 + 0.35 * Math.sin(t * 5 + v.phase), size: 1 };
      case 'idle':
        return { yaw: 0.15 * Math.sin(t * 0.8 + v.phase), tilt: 0, pitch: 0.55, size: 1 };
      case 'off':
        return { yaw: 0, tilt: 0, pitch: 0.55, size: 0.001 };
      case 'down':
        return { yaw: 0, tilt: -1.35, pitch: 1.2, size: 1 };
    }
  }

  private apply(t: number): void {
    const arms = this.meshes[3];
    const bodyParts = this.meshes.filter((m) => m !== arms);
    this.vendors.forEach((v, j) => {
      v.root.rotation.set(v.tilt, v.yaw, 0, 'YXZ');
      v.root.scale.setScalar(this.scale * v.size);
      // trabalhando, o corpo acompanha os braços num balanço curto
      v.root.position.y = LIFT + PRACA_H + (v.pose === 'work' ? 0.004 * Math.abs(Math.sin(t * 8 + v.phase)) : 0);
      v.arms.rotation.x = v.pitch;
      v.root.updateMatrixWorld(true);
      for (const m of bodyParts) m.setMatrixAt(j, v.root.matrixWorld);
      arms.setMatrixAt(j, v.arms.matrixWorld);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Base de um consumidor de tema: sombra, pedestal, praça (o corpo, que fica vermelho quando o
 * consumidor cai), furo da entrada e as células dos workers na altura da praça.
 */
export function consumerBase(model: Group, node: GraphNode<'consumer'>, prefix: string) {
  const baseColor = SERVICE.consumer;
  contactShadow(model, 1.7, 1.6);
  const base = pedestal(model, 1.7, 1.6, baseColor);
  const body = part(`${prefix}/praca`, matLive(baseColor));
  model.add(body, part(`${prefix}/detalhe`, mat(SCENE.ink)));
  const workers = Math.max(1, node.config.workers);
  const cells = Array.from({ length: workers }, (_, j) => {
    const c = workerCell(j, workers);
    return { x: c.x, y: LIFT + PRACA_H, z: c.z };
  });
  return { baseColor, base, body, cells };
}

/** Luz de estado de cada worker (a cena pinta conforme o estado): uma malha por célula. */
export function statusLights(model: Group, cells: { x: number; y: number; z: number }[], name: string): Mesh[] {
  return cells.map((c) => {
    const pad = new Mesh(modelGeometry(name), matLive(WORKER.idle));
    pad.position.set(c.x, c.y, c.z);
    model.add(pad);
    return pad;
  });
}

/** Material aceso (janela, farol, olhos grandes): cor pura, sem luz assada. */
export function lit(color: string): MeshBasicMaterial {
  return mat(color, { emissive: color });
}
