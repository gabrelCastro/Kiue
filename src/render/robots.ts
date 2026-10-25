import { InstancedMesh, Object3D, type Material } from 'three';
import { BOX_SPOT } from './layout';
import { modelGeometry } from './models';

/*
 * Braços robóticos da bancada do consumidor (models/consumidor.scad), um por worker.
 *
 * Cada braço tem três partes que se movem: base giratória (gira em y), braço (ombro) e antebraço
 * com a garra (cotovelo); ombro e cotovelo dobram em torno de z, no plano para onde a base aponta.
 * Todos os braços de um consumidor usam um InstancedMesh por parte: 3 chamadas de desenho por
 * consumidor, com 1 ou 9 workers. As medidas vêm do .scad (mm / 100, antes do NODE_SCALE).
 */

/** Pose de um worker: trabalhando na caixa, esticado para a fila, recolhido, desligado, caído. */
export type ArmPose = 'work' | 'poll' | 'idle' | 'off' | 'down';

/** Braço (ombro → cotovelo) e antebraço (cotovelo → ponta da garra). */
const L1 = 0.3;
const L2 = 0.32;
/** Pedestal do braço na célula, a partir do centro da célula (atrás e à esquerda). */
const ARM_BASE = { x: -0.15, z: -0.15 };
/** Altura do topo do pedestal acima do tampo (tapete 0,01 + pedestal 0,06). */
const PEDESTAL_TOP = 0.07;
/** Altura do ombro acima do topo do pedestal. */
const SHOULDER = 0.12;
/** Velocidade com que as juntas seguem o alvo (1/ms). */
const FOLLOW = 0.009;

interface Arm {
  pose: ArmPose;
  yaw: number;
  a1: number;
  a2: number;
  root: Object3D;
  upper: Object3D;
  fore: Object3D;
  /** Fase própria: braços vizinhos não balançam em sincronia. */
  phase: number;
}

/** Ângulos (a partir da vertical) de um braço de 2 elos cuja ponta alcança (h, v) a partir do ombro. */
function reach(h: number, v: number): [number, number] {
  const d = Math.min(Math.hypot(h, v), L1 + L2 - 1e-3);
  const cos2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  const a2 = Math.acos(Math.max(-1, Math.min(1, cos2)));
  // cotovelo para cima: o antebraço desce até a ponta
  const a1 = Math.atan2(h, v) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
  return [a1, a2];
}

function approach(from: number, to: number, k: number): number {
  return from + (to - from) * k;
}

/** Caminho mais curto entre dois ângulos. */
function approachAngle(from: number, to: number, k: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

export class ArmRig {
  readonly meshes: InstancedMesh[];
  private readonly arms: Arm[];
  private readonly boxTop: number;

  /**
   * @param cells centro de cada célula, na altura do tampo (sem o tapete)
   * @param boxHeight altura da caixa pousada (para a garra parar em cima dela)
   */
  constructor(cells: { x: number; y: number; z: number }[], materials: { base: Material; arm: Material; fore: Material }, boxHeight: number) {
    const n = cells.length;
    this.meshes = [
      new InstancedMesh(modelGeometry('consumidor/giro'), materials.base, n),
      new InstancedMesh(modelGeometry('consumidor/superior'), materials.arm, n),
      new InstancedMesh(modelGeometry('consumidor/antebraco'), materials.fore, n),
    ];
    // as instâncias se movem; a esfera de recorte da geometria não as acompanha
    for (const m of this.meshes) m.frustumCulled = false;
    this.boxTop = 0.01 + boxHeight - PEDESTAL_TOP - SHOULDER;
    this.arms = cells.map((c, j) => {
      const root = new Object3D();
      root.position.set(c.x + ARM_BASE.x, c.y + PEDESTAL_TOP, c.z + ARM_BASE.z);
      const upper = new Object3D();
      upper.position.y = SHOULDER;
      const fore = new Object3D();
      fore.position.y = L1;
      root.add(upper);
      upper.add(fore);
      const arm: Arm = { pose: 'idle', yaw: 0, a1: 0, a2: 0, root, upper, fore, phase: j * 1.7 };
      this.target(arm, 0, (yaw, a1, a2) => Object.assign(arm, { yaw, a1, a2 }));
      return arm;
    });
    this.apply();
  }

  setPose(j: number, pose: ArmPose): void {
    const arm = this.arms[j];
    if (arm) arm.pose = pose;
  }

  /** Avança as juntas em direção à pose de cada braço. `dt` em ms, `t` em s. */
  update(dt: number, t: number): void {
    const k = 1 - Math.exp(-dt * FOLLOW);
    for (const arm of this.arms) {
      this.target(arm, t, (yaw, a1, a2) => {
        arm.yaw = approachAngle(arm.yaw, yaw, k);
        arm.a1 = approach(arm.a1, a1, k);
        arm.a2 = approach(arm.a2, a2, k);
      });
    }
    this.apply();
  }

  private target(arm: Arm, t: number, set: (yaw: number, a1: number, a2: number) => void): void {
    // direção da caixa, a partir do pedestal
    const bx = BOX_SPOT - ARM_BASE.x;
    const bz = BOX_SPOT - ARM_BASE.z;
    const toBox = Math.atan2(-bz, bx);
    switch (arm.pose) {
      case 'work': {
        // garra em cima da caixa, batendo de leve (trabalhando)
        const [a1, a2] = reach(Math.hypot(bx, bz), this.boxTop + 0.02 + 0.018 * Math.sin(t * 9 + arm.phase));
        set(toBox, a1, a2);
        break;
      }
      case 'poll': {
        // erguido e inclinado para a esquerda, de onde vêm as mensagens (esticado, a garra
        // pararia em cima da caixa da célula vizinha), balançando devagar
        const [a1, a2] = reach(0.18 + 0.025 * Math.sin(t * 2.6 + arm.phase), 0.44);
        set(Math.PI, a1, a2);
        break;
      }
      case 'idle': {
        const [a1, a2] = reach(0.18, 0.2);
        set(toBox, a1, a2);
        break;
      }
      case 'off':
        set(toBox, 0.05, 0.3);
        break;
      case 'down':
        // tombado para trás, de costas para a caixa (não se confunde com "trabalhando")
        set(toBox + 2.4, 1.2, 1.0);
        break;
    }
  }

  private apply(): void {
    const [base, upperMesh, foreMesh] = this.meshes;
    this.arms.forEach((arm, j) => {
      arm.root.rotation.y = arm.yaw;
      arm.upper.rotation.z = -arm.a1;
      arm.fore.rotation.z = -arm.a2;
      arm.root.updateMatrixWorld(true);
      base.setMatrixAt(j, arm.root.matrixWorld);
      upperMesh.setMatrixAt(j, arm.upper.matrixWorld);
      foreMesh.setMatrixAt(j, arm.fore.matrixWorld);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
