import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, type Material } from 'three';
import type { GraphNode } from '../../sim/types';
import { LIFT, workerCell } from '../layout';
import { modelGeometry, modelGeometryAt } from '../models';
import { contactShadow, mat, part, pedestal, shade } from '../pieces';
import { SCENE, SERVICE, WORKER } from '../../theme';
import type { ConsumerBuild, ProducerBuild, SendFx, ThemeKit, WorkerPose, WorkerRig } from './kit';

/*
 * Tema Fazenda. Produtor = horta com celeiro (models/fazenda_produtor.scad) e um robô fazendeiro
 * de chapéu que ergue o caixote a cada mensagem enviada. Consumidor = feira
 * (models/fazenda_feira.scad): cada worker é uma barraquinha com um robô vendedor (models/robo.scad).
 * Medidas dos .scad em mm / 100, antes do NODE_SCALE; o .scad tem a frente em −y, o jogo em +z.
 */

const WOOD = '#b0864f';
const SOIL = '#9a7448';
const LEAF = '#3f9a52';
const CARDBOARD = '#c8a165';
/** Olhos acesos dos robôs (iguais nos dois modos, como as janelas acesas). */
const EYES = '#e9f3ff';

/** Ombro do robô (robo.scad SHOULDER) e altura da praça da feira. */
const SHOULDER_Y = 0.2;
const PRACA_H = 0.06;
/** Vendedor atrás do balcão (y = +8 mm no .scad) e o tamanho dele. */
const VENDOR_Z = -0.08;
const VENDOR_SCALE = 0.85;
/** Fazendeiro (posto à direita da horta, virado para a saída) e o tamanho dele. */
const FARMER = { x: 0.24, z: 0.3, scale: 1.2 };
/** Quanto dura o "erguer o caixote" a cada mensagem (ms). */
const LIFT_MS = 520;
/** Velocidade com que os vendedores seguem a pose (1/ms). */
const FOLLOW = 0.008;

interface RobotMaterials {
  body: Material;
  visor: Material;
  eyes: Material;
  hat: Material;
}

function robotMaterials(): RobotMaterials {
  return { body: mat(SCENE.white), visor: mat(SCENE.ink), eyes: new MeshBasicMaterial({ color: EYES }), hat: mat(SCENE.accent) };
}

/** Um robô de chapéu montado com malhas comuns (o fazendeiro). Devolve o corpo e o pivô dos braços. */
function robot(mats: RobotMaterials): { root: Group; arms: Group } {
  const root = new Group();
  root.add(
    new Mesh(modelGeometry('robo/corpo'), mats.body),
    new Mesh(modelGeometry('robo/visor'), mats.visor),
    new Mesh(modelGeometry('robo/olhos'), mats.eyes),
    new Mesh(modelGeometry('robo/chapeu'), mats.hat),
  );
  const arms = new Group();
  arms.position.y = SHOULDER_Y;
  arms.add(new Mesh(modelGeometry('robo/bracos'), mats.body));
  root.add(arms);
  return { root, arms };
}

/** Fazendeiro: ergue o caixote a cada mensagem enviada e balança de leve no resto do tempo. */
class FarmerFx implements SendFx {
  private at = -Infinity;
  constructor(
    private readonly root: Object3D,
    private readonly arms: Object3D,
  ) {}
  trigger(now: number): void {
    if (now - this.at >= LIFT_MS) this.at = now;
  }
  update(now: number): void {
    const p = (now - this.at) / LIFT_MS;
    const lift = p < 1 ? Math.sin(Math.PI * p) : 0;
    this.arms.rotation.x = -0.15 - 0.9 * lift;
    this.root.position.y = LIFT + 0.012 * lift + 0.004 * Math.sin(now * 0.002);
  }
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

function approach(from: number, to: number, k: number): number {
  return from + (to - from) * k;
}

/**
 * Vendedores da feira, um por worker. Cada parte do robô é um InstancedMesh: 5 chamadas de desenho
 * por consumidor, com 1 ou 9 workers.
 *  - trabalhando: de frente, braços mexendo na caixa do balcão;
 *  - buscando: virado para a esquerda (de onde vêm as mensagens), acenando;
 *  - parado: de frente, braços baixos;
 *  - desligado: a barraca fica vazia (o robô some);
 *  - caído: tombado para trás.
 */
class VendorRig implements WorkerRig {
  readonly meshes: InstancedMesh[];
  private readonly vendors: Vendor[];

  constructor(cells: { x: number; y: number; z: number }[], mats: RobotMaterials) {
    const n = cells.length;
    const geo = (name: string) => modelGeometry(`robo/${name}`);
    this.meshes = [
      new InstancedMesh(geo('corpo'), mats.body, n),
      new InstancedMesh(geo('visor'), mats.visor, n),
      new InstancedMesh(geo('olhos'), mats.eyes, n),
      new InstancedMesh(geo('chapeu'), mats.hat, n),
      new InstancedMesh(geo('bracos'), mats.body, n),
    ];
    for (const m of this.meshes) m.frustumCulled = false;
    this.vendors = cells.map((c, j) => {
      const root = new Object3D();
      root.position.set(c.x, c.y, c.z + VENDOR_Z);
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
    const [body, visor, eyes, hat, armsMesh] = this.meshes;
    this.vendors.forEach((v, j) => {
      v.root.rotation.set(v.tilt, v.yaw, 0, 'YXZ');
      v.root.scale.setScalar(VENDOR_SCALE * v.size);
      // trabalhando, o corpo acompanha os braços num balanço curto
      v.root.position.y = LIFT + PRACA_H + (v.pose === 'work' ? 0.004 * Math.abs(Math.sin(t * 8 + v.phase)) : 0);
      v.arms.rotation.x = v.pitch;
      v.root.updateMatrixWorld(true);
      for (const m of [body, visor, eyes, hat]) m.setMatrixAt(j, v.root.matrixWorld);
      armsMesh.setMatrixAt(j, v.arms.matrixWorld);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}

export const fazenda: ThemeKit = {
  producer(model): ProducerBuild {
    const color = SERVICE.producer;
    contactShadow(model, 1.6, 1.5);
    const base = pedestal(model, 1.6, 1.5, color);
    const barn = part('fazenda_produtor/celeiro', mat(SCENE.white));
    const roof = part('fazenda_produtor/telhado', mat(color));
    model.add(
      part('fazenda_produtor/chao', mat(shade(color, 0.5))),
      barn,
      roof,
      part('fazenda_produtor/portao', mat(SCENE.white)),
      part('fazenda_produtor/detalhe', mat(SCENE.ink)),
      part('fazenda_produtor/silo', mat(SCENE.metal)),
      part('fazenda_produtor/terra', mat(SOIL)),
      part('fazenda_produtor/verde', mat(LEAF)),
      part('fazenda_produtor/esteira', mat(SCENE.metal)),
      part('fazenda_produtor/caixas', mat(CARDBOARD)),
    );
    // fazendeiro virado para a saída (+x), com o caixote nos braços
    const { root, arms } = robot(robotMaterials());
    root.position.set(FARMER.x, LIFT, FARMER.z);
    root.rotation.y = Math.PI / 2;
    root.scale.setScalar(FARMER.scale);
    const crate = new Mesh(new BoxGeometry(0.15, 0.11, 0.15), mat(CARDBOARD));
    crate.position.set(0, -0.06, 0.15);
    arms.add(crate);
    model.add(root);
    const send = new FarmerFx(root, arms);
    send.update(0);
    return { body: barn, baseColor: SCENE.white, pickables: [barn, roof, base], labelY: 1.0, send };
  },

  consumer(model, node: GraphNode<'consumer'>): ConsumerBuild {
    const baseColor = SERVICE.consumer;
    contactShadow(model, 1.7, 1.6);
    const base = pedestal(model, 1.7, 1.6, baseColor);
    const body = part('fazenda_feira/praca', mat(baseColor));
    model.add(body, part('fazenda_feira/detalhe', mat(SCENE.ink)));
    const workers = Math.max(1, node.config.workers);
    const cells = Array.from({ length: workers }, (_, j) => {
      const c = workerCell(j, workers);
      return { x: c.x, y: LIFT + PRACA_H, z: c.z };
    });
    // barraquinhas (balcão, toldo listrado e postes) numa malha por material
    model.add(
      new Mesh(modelGeometryAt('fazenda_feira/balcao', cells), mat(WOOD)),
      new Mesh(modelGeometryAt('fazenda_feira/toldo_a', cells), mat(baseColor)),
      new Mesh(modelGeometryAt('fazenda_feira/toldo_b', cells), mat(SCENE.white)),
      new Mesh(modelGeometryAt('fazenda_feira/poste', cells), mat(SCENE.metal)),
    );
    // a lanterna de cada barraca é a luz de estado do worker
    const workerPads: Mesh[] = cells.map((c) => {
      const pad = new Mesh(modelGeometry('fazenda_feira/luz'), mat(WORKER.idle));
      pad.position.set(c.x, c.y, c.z);
      model.add(pad);
      return pad;
    });
    const vendors = new VendorRig(cells, robotMaterials());
    model.add(...vendors.meshes);
    return { body, baseColor, pickables: [body, base], labelY: 1.0, workerPads, workers: vendors };
  },

  // a caixa pousa no balcão (frente da célula, y = −12 mm no .scad; tampo a 6 + 14 mm do pedestal)
  workerSpot: { x: 0, y: PRACA_H + 0.14, z: 0.12 },
};
