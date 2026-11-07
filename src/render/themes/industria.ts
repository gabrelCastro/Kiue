import { Mesh, type Object3D } from 'three';
import type { GraphNode } from '../../sim/types';
import { BENCH_TOP, BOX_SPOT, LIFT, NODE_SCALE, TOKEN_H, workerCell } from '../layout';
import { modelGeometry, modelGeometryAt } from '../models';
import { contactShadow, mat, part, pedestal } from '../pieces';
import { ArmRig } from '../robots';
import { SCENE, SERVICE, WORKER } from '../../theme';
import type { ConsumerBuild, ProducerBuild, SendFx, ThemeKit } from './kit';

/*
 * Tema Indústria: o visual de sempre. Produtor = doca de expedição (models/produtor.scad) cujo
 * portão enrola a cada mensagem; consumidor = bancada com um braço robótico por worker
 * (models/consumidor.scad, render/robots.ts).
 */

// Pontos tirados dos .scad: (x, z, −y) / 100, acima do pedestal e antes do NODE_SCALE.
/** Topo do portão de enrolar do produtor (W/2 − DOOR_IN + 1,3; 0; DOOR_Z1). */
const DOOR_AT = { x: 0.533, y: 0.44, z: 0 };
/** Quanto o portão enrola (fração da altura) a cada mensagem enviada. */
export const DOOR_OPEN = 0.85;
/** Duração de uma abertura do portão (ms). */
export const DOOR_MS = 420;

/** Portão de enrolar: uma abertura por vez (com muitas mensagens, ele não fica abrindo sem parar). */
class DoorFx implements SendFx {
  private at = -Infinity;
  constructor(private readonly door: Object3D) {}
  trigger(now: number): void {
    if (now - this.at >= DOOR_MS) this.at = now;
  }
  update(now: number): void {
    const p = (now - this.at) / DOOR_MS;
    this.door.scale.y = 1 - (p < 1 ? DOOR_OPEN * Math.sin(Math.PI * p) : 0);
  }
}

export const industria: ThemeKit = {
  producer(model): ProducerBuild {
    const baseColor = SCENE.light;
    contactShadow(model, 1.6, 1.5);
    const base = pedestal(model, 1.6, 1.5, SERVICE.producer);
    const body = part('produtor/corpo', mat(baseColor));
    const roof = part('produtor/telhado', mat(SERVICE.producer));
    const door = part('produtor/portao', mat(SCENE.metal));
    door.position.set(DOOR_AT.x, LIFT + DOOR_AT.y, DOOR_AT.z);
    model.add(
      body,
      roof,
      door,
      part('produtor/detalhe', mat(SCENE.ink)),
      part('produtor/doca', mat(SCENE.dim)),
      part('produtor/janelas', mat('#fff1c2', { emissive: '#ffd56b' })),
      part('produtor/palete', mat('#9a7448')),
      part('produtor/caixas', mat('#c8a165')),
    );
    return { body, baseColor, pickables: [body, roof, base], labelY: 1.4, send: new DoorFx(door) };
  },

  consumer(model, node: GraphNode<'consumer'>): ConsumerBuild {
    const baseColor = SERVICE.consumer;
    contactShadow(model, 1.7, 1.6);
    const base = pedestal(model, 1.7, 1.6, baseColor);
    const body = part('consumidor/corpo', mat(baseColor));
    model.add(body, part('consumidor/detalhe', mat(SCENE.ink)), part('consumidor/tampo', mat(SCENE.white)));
    const workers = Math.max(1, node.config.workers);
    const cells = Array.from({ length: workers }, (_, j) => {
      const c = workerCell(j, workers);
      return { x: c.x, y: LIFT + BENCH_TOP, z: c.z };
    });
    // tapetes numa malha só; o anel de luz de cada worker é separado porque muda de cor
    model.add(new Mesh(modelGeometryAt('consumidor/celula', cells), mat(SCENE.dark)));
    const workerPads: Mesh[] = [];
    for (const c of cells) {
      const pad = new Mesh(modelGeometry('consumidor/luz'), mat(WORKER.idle));
      pad.position.set(c.x, c.y, c.z);
      model.add(pad);
      workerPads.push(pad);
    }
    const arms = new ArmRig(cells, { base: mat(SCENE.accent), arm: mat(SCENE.accent), fore: mat(SCENE.dark) }, (TOKEN_H * 1.05) / NODE_SCALE);
    model.add(...arms.meshes);
    return { body, baseColor, pickables: [body, base], labelY: 1.6, workerPads, workers: arms };
  },

  // a caixa pousa no tapete, à frente e à direita do centro (o braço fica no canto oposto)
  workerSpot: { x: BOX_SPOT, y: BENCH_TOP + 0.01, z: BOX_SPOT },
};
