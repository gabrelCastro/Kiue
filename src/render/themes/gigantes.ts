import { CylinderGeometry, InstancedMesh, Matrix4, Mesh, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { GraphNode } from '../../sim/types';
import { LIFT } from '../layout';
import { THEME_MODEL_DATA } from '../models.gigantes.gen';
import { modelGeometryAt, registerModels } from '../models';
import { contactShadow, mat, part, pedestal, shade } from '../pieces';
import { SCENE, SERVICE } from '../../theme';
import { CARDBOARD, consumerBase, crateInArms, EYES, FOLLOW, LiftFx, lit, PRACA_H, robot, robotMaterials, statusLights } from './common';
import type { ConsumerBuild, ProducerBuild, ThemeKit, WorkerPose, WorkerRig } from './kit';

/*
 * Tema Robôs gigantes. Produtor = robô-canhão (models/gigantes_produtor.scad): o cano recua a cada
 * mensagem disparada, e um ajudante carrega a escotilha. Consumidor = robô-polvo
 * (models/gigantes_polvo.scad): um robô suspenso no fundo, com um braço por worker indo até o
 * tapete de cada um.
 */

registerModels(THEME_MODEL_DATA);

/** Centro da cabeça do polvo (gigantes_polvo.scad HEAD = [0, 52, 78]), em unidades do jogo. */
const HEAD = new Vector3(0, LIFT + 0.78, -0.52);
const ARM_R = 0.028;

interface Arm {
  pose: WorkerPose;
  shoulder: Vector3;
  cell: Vector3;
  hand: Vector3;
  phase: number;
}

const UP = new Vector3(0, 1, 0);
const tmpDir = new Vector3();
const tmpMid = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();
const tmpS = new Vector3();

/**
 * Braços do polvo, um por worker: dois segmentos (ombro → cotovelo → mão) desenhados com
 * cilindros e juntas em InstancedMesh (3 chamadas de desenho para 1 ou 9 braços).
 *  - trabalhando: a mão bate de leve em cima da caixa;
 *  - buscando: a mão erguida, esticada para a esquerda (de onde vêm as mensagens);
 *  - parado: a mão parada acima do tapete;
 *  - desligado: o braço recolhido junto do corpo;
 *  - caído: o braço largado no chão.
 */
class OctoRig implements WorkerRig {
  readonly meshes: InstancedMesh[];
  private readonly arms: Arm[];

  constructor(cells: { x: number; y: number; z: number }[], color: string) {
    const n = cells.length;
    this.meshes = [
      new InstancedMesh(new CylinderGeometry(1, 1, 1, 10), mat(color), n * 2),
      new InstancedMesh(new SphereGeometry(1, 12, 8), mat(SCENE.metal), n * 2),
      new InstancedMesh(new SphereGeometry(1, 12, 8), mat(color), n),
    ];
    for (const m of this.meshes) m.frustumCulled = false;
    this.arms = cells.map((c, j) => {
      const cell = new Vector3(c.x, c.y, c.z);
      // o ombro sai do corpo na direção da célula
      const dir = new Vector3(c.x - HEAD.x, 0, c.z - HEAD.z).normalize();
      const shoulder = HEAD.clone().addScaledVector(dir, 0.13).add(new Vector3(0, -0.13, 0));
      return { pose: 'idle', shoulder, cell, hand: cell.clone().add(new Vector3(0, 0.32, 0)), phase: j * 1.4 };
    });
    this.apply();
  }

  setPose(j: number, pose: WorkerPose): void {
    const a = this.arms[j];
    if (a) a.pose = pose;
  }

  update(dt: number, t: number): void {
    const k = 1 - Math.exp(-dt * FOLLOW);
    for (const a of this.arms) a.hand.lerp(this.target(a, t), k);
    this.apply();
  }

  private target(a: Arm, t: number): Vector3 {
    const c = a.cell;
    switch (a.pose) {
      case 'work':
        return tmpMid.set(c.x, c.y + 0.25 + 0.02 * Math.sin(t * 9 + a.phase), c.z);
      case 'poll':
        return tmpMid.set(c.x - 0.14, c.y + 0.46 + 0.03 * Math.sin(t * 3 + a.phase), c.z);
      case 'idle':
        return tmpMid.set(c.x, c.y + 0.32 + 0.01 * Math.sin(t * 1.2 + a.phase), c.z);
      case 'off':
        return tmpMid.copy(a.shoulder).add(new Vector3(0, -0.1, 0.05));
      case 'down':
        return tmpMid.set(c.x + 0.1, c.y + 0.03, c.z + 0.1);
    }
  }

  private segment(i: number, from: Vector3, to: Vector3): void {
    tmpDir.subVectors(to, from);
    const len = Math.max(0.001, tmpDir.length());
    tmpQ.setFromUnitVectors(UP, tmpDir.normalize());
    tmpMid.addVectors(from, to).multiplyScalar(0.5);
    tmpM.compose(tmpMid, tmpQ, tmpS.set(ARM_R, len, ARM_R));
    this.meshes[0].setMatrixAt(i, tmpM);
  }

  private joint(mesh: InstancedMesh, i: number, at: Vector3, r: number): void {
    tmpM.compose(at, tmpQ.identity(), tmpS.setScalar(r));
    mesh.setMatrixAt(i, tmpM);
  }

  private apply(): void {
    const elbow = new Vector3();
    this.arms.forEach((a, j) => {
      // cotovelo no meio, puxado para cima (para baixo quando o braço cai)
      elbow.addVectors(a.shoulder, a.hand).multiplyScalar(0.5);
      elbow.y += a.pose === 'down' ? 0.05 : 0.16;
      this.segment(j * 2, a.shoulder, elbow);
      this.segment(j * 2 + 1, elbow, a.hand);
      this.joint(this.meshes[1], j * 2, a.shoulder, ARM_R * 1.6);
      this.joint(this.meshes[1], j * 2 + 1, elbow, ARM_R * 1.4);
      this.joint(this.meshes[2], j, a.hand, ARM_R * 1.9);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}

export const gigantes: ThemeKit = {
  producer(model): ProducerBuild {
    const color = SERVICE.producer;
    contactShadow(model, 1.6, 1.5);
    const base = pedestal(model, 1.6, 1.5, color);
    const body = part('gigantes_produtor/corpo', mat(SCENE.white));
    const barrel = part('gigantes_produtor/cano', mat(color));
    barrel.userData.dynamic = true; // recua a cada disparo
    model.add(
      part('gigantes_produtor/chao', mat(shade(color, 0.5))),
      body,
      barrel,
      part('gigantes_produtor/clara', mat(shade(color, 0.5))),
      part('gigantes_produtor/rosto', mat(SCENE.ink)),
      part('gigantes_produtor/olhos', lit(EYES)),
      part('gigantes_produtor/metal', mat(SCENE.metal)),
      part('gigantes_produtor/papelao', mat(CARDBOARD)),
      part('gigantes_produtor/saida', mat(color)),
      part('gigantes_produtor/detalhe', mat(SCENE.ink)),
    );
    // o ajudante, com a caixa erguida sobre a cabeça, perto da escotilha
    const helper = robot(robotMaterials());
    helper.root.position.set(-0.3, LIFT, -0.2);
    helper.root.rotation.y = 0.35;
    helper.root.scale.setScalar(1.25);
    helper.arms.rotation.x = -1.45;
    crateInArms(helper.arms, true);
    model.add(helper.root);
    const x0 = barrel.position.x;
    const send = new LiftFx(320, (kick) => {
      barrel.position.x = x0 - 0.06 * kick;
      helper.arms.rotation.x = -1.45 + 0.35 * kick;
    });
    return { body, baseColor: SCENE.white, pickables: [body, barrel, base], labelY: 0.95, send };
  },

  consumer(model, node: GraphNode<'consumer'>): ConsumerBuild {
    const { baseColor, base, body, cells } = consumerBase(model, node, 'gigantes_polvo');
    model.add(
      part('gigantes_polvo/poste', mat(SCENE.metal)),
      part('gigantes_polvo/cabeca', mat(SCENE.white)),
      part('gigantes_polvo/rosto', mat(SCENE.ink)),
      part('gigantes_polvo/olhos', lit(EYES)),
      new Mesh(modelGeometryAt('gigantes_polvo/tapete', cells), mat(SCENE.dark)),
    );
    // anel em volta do tapete: a luz de estado
    const workerPads = statusLights(model, cells, 'gigantes_polvo/luz');
    const arms = new OctoRig(cells, baseColor);
    model.add(...arms.meshes);
    return { body, baseColor, pickables: [body, base], labelY: 1.15, workerPads, workers: arms };
  },

  // a caixa pousa no tapete, no centro da célula
  workerSpot: { x: 0, y: PRACA_H + 0.018, z: 0 },
};

