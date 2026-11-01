import { Color, InstancedMesh, Mesh, Object3D, type Material, type MeshBasicMaterial } from 'three';
import { LAMBDA_BAYS, LAMBDA_DECK_H, lambdaBay } from './layout';
import { modelGeometry, modelGeometryAt } from './models';

/*
 * Estação da Lambda (models/lambda.scad): 20 alçapões num anel em volta da torre. Cada instância
 * da função é um robô que sobe do alçapão quando a Lambda escala e afunda quando ela encolhe;
 * alçapões além do MaximumConcurrency ficam com a tampa travada.
 *
 * Robôs e luzes são InstancedMesh (uma chamada de desenho por parte, com 1 ou 20 robôs). A luz de
 * cada alçapão tem cor própria por instância (ocioso, buscando, processando, recusado).
 */

/** Quanto o robô afunda quando a vaga está desligada: abaixo do topo da plataforma, some. */
const SINK = 0.3;
/** Velocidade de subir/descer (1/ms). */
const RISE = 0.006;
/** O robô fica 0,3 mm dentro do alçapão (ver o .scad). */
const ROBOT_BASE = 0.005;

export class LambdaStation {
  /** Malhas a pôr no grupo da peça. */
  readonly objects: Object3D[] = [];
  private readonly robots: InstancedMesh[];
  private readonly lights: InstancedMesh;
  /** Altura de cada robô: 0 = escondido no alçapão, 1 = em pé na plataforma. */
  private readonly height: number[];
  private readonly busy: boolean[];
  private readonly dummy = new Object3D();

  /** @param cap vagas que a função pode usar (MaximumConcurrency ou o teto do jogo) */
  constructor(
    private readonly cap: number,
    materials: { bay: Material; lock: Material; light: MeshBasicMaterial; body: Material; stripe: Material; detail: Material },
  ) {
    const all = Array.from({ length: LAMBDA_BAYS }, (_, j) => lambdaBay(j));
    const at = (bays: typeof all) => bays.map((b) => ({ x: b.x, y: LAMBDA_DECK_H, z: b.z }));
    this.objects.push(new Mesh(modelGeometryAt('lambda/baia', at(all)), materials.bay));
    const locked = all.slice(cap);
    if (locked.length) this.objects.push(new Mesh(modelGeometryAt('lambda/trava', at(locked)), materials.lock));

    this.lights = new InstancedMesh(modelGeometry('lambda/luz'), materials.light, LAMBDA_BAYS);
    all.forEach((b, j) => {
      this.dummy.position.set(b.x, LAMBDA_DECK_H, b.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.lights.setMatrixAt(j, this.dummy.matrix);
      this.lights.setColorAt(j, new Color(j < cap ? '#b4b4bb' : '#e9ebed'));
    });

    this.robots = [
      new InstancedMesh(modelGeometry('lambda/robo_corpo'), materials.body, cap),
      new InstancedMesh(modelGeometry('lambda/robo_faixa'), materials.stripe, cap),
      new InstancedMesh(modelGeometry('lambda/robo_detalhe'), materials.detail, cap),
    ];
    for (const m of [...this.robots, this.lights]) m.frustumCulled = false;
    this.objects.push(this.lights, ...this.robots);
    this.height = Array.from({ length: cap }, () => 0);
    this.busy = Array.from({ length: cap }, () => false);
  }

  /** Cor da luz do alçapão `j` (estado do worker). */
  setLight(j: number, color: Color): void {
    if (j >= LAMBDA_BAYS) return;
    this.lights.setColorAt(j, color);
    if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
  }

  setBusy(j: number, busy: boolean): void {
    if (j < this.cap) this.busy[j] = busy;
  }

  /**
   * Sobe os robôs das vagas ativas e afunda os outros. `dt` em ms (0 = vai direto para a pose),
   * `t` em s (o robô trabalhando balança de leve).
   */
  update(active: number, dt: number, t: number): void {
    const k = dt <= 0 ? 1 : 1 - Math.exp(-dt * RISE);
    const [body, stripe, detail] = this.robots;
    for (let j = 0; j < this.cap; j++) {
      const target = j < active ? 1 : 0;
      this.height[j] += (target - this.height[j]) * k;
      if (Math.abs(target - this.height[j]) < 0.002) this.height[j] = target;
      const b = lambdaBay(j);
      const bob = this.busy[j] && this.height[j] > 0.99 ? 0.012 * Math.abs(Math.sin(t * 9 + j)) : 0;
      // o visor do robô (+X no modelo) olha para fora do anel
      this.dummy.position.set(b.x, LAMBDA_DECK_H + ROBOT_BASE - SINK * (1 - this.height[j]) + bob, b.z);
      this.dummy.rotation.set(0, b.angle, 0);
      this.dummy.updateMatrix();
      body.setMatrixAt(j, this.dummy.matrix);
      stripe.setMatrixAt(j, this.dummy.matrix);
      detail.setMatrixAt(j, this.dummy.matrix);
    }
    for (const m of this.robots) m.instanceMatrix.needsUpdate = true;
  }

  /** Algum robô ainda está subindo ou descendo (a cena precisa ser redesenhada). */
  moving(active: number): boolean {
    return this.height.some((h, j) => h !== (j < active ? 1 : 0));
  }
}
