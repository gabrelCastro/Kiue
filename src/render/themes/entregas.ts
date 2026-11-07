import { InstancedMesh, Mesh, Object3D } from 'three';
import type { GraphNode } from '../../sim/types';
import { LIFT } from '../layout';
import { THEME_MODEL_DATA } from '../models.entregas.gen';
import { modelGeometry, modelGeometryAt, registerModels } from '../models';
import { contactShadow, mat, part, pedestal, shade } from '../pieces';
import { SCENE, SERVICE } from '../../theme';
import { approach, CARDBOARD, consumerBase, crateInArms, EYES, FOLLOW, liftArmsFx, LIT, lit, PRACA_H, robot, robotMaterials, statusLights } from './common';
import type { ConsumerBuild, LambdaBuild, ProducerBuild, ThemeKit, WorkerPose, WorkerRig } from './kit';
import { buildYard } from './funcao';


/*
 * Tema Entregas. Produtor = caminhão de pedidos (models/entregas_produtor.scad), com um robô que
 * desce a caixa até a esteira e a ergue a cada envio. Consumidor = vagas de carrinhos-robô
 * (models/entregas_vaga.scad + rover.scad): cada worker é um carrinho na sua vaga, e a caixa pousa
 * na caçamba dele.
 */

registerModels(THEME_MODEL_DATA);

interface Rover {
  pose: WorkerPose;
  root: Object3D;
  yaw: number;
  roll: number;
  size: number;
  phase: number;
}

/**
 * Carrinhos, um por worker, em InstancedMesh (6 chamadas de desenho por consumidor):
 *  - trabalhando: na vaga, de frente, sacudindo (motor ligado, a caixa na caçamba);
 *  - buscando: virado para a esquerda (de onde vêm as mensagens), indo e voltando;
 *  - parado: na vaga, de frente;
 *  - desligado: a vaga fica vazia;
 *  - caído: tombado de lado.
 */
class RoverRig implements WorkerRig {
  readonly meshes: InstancedMesh[];
  private readonly rovers: Rover[];
  private readonly cells: { x: number; y: number; z: number }[];

  constructor(cells: { x: number; y: number; z: number }[], colors: { body: string; bumper: string }) {
    this.cells = cells;
    const n = cells.length;
    const geo = (name: string) => modelGeometry(`rover/${name}`);
    this.meshes = [
      new InstancedMesh(geo('corpo'), mat(colors.body), n),
      new InstancedMesh(geo('parachoque'), mat(colors.bumper), n),
      new InstancedMesh(geo('rodas'), mat(SCENE.ink), n),
      new InstancedMesh(geo('cacamba'), mat(SCENE.metal), n),
      new InstancedMesh(geo('visor'), mat(SCENE.ink), n),
      new InstancedMesh(geo('olhos'), lit(EYES), n),
    ];
    for (const m of this.meshes) m.frustumCulled = false;
    this.rovers = cells.map((_, j) => ({ pose: 'idle', root: new Object3D(), yaw: 0, roll: 0, size: 1, phase: j * 1.1 }));
    this.apply(0);
  }

  setPose(j: number, pose: WorkerPose): void {
    const r = this.rovers[j];
    if (r) r.pose = pose;
  }

  update(dt: number, t: number): void {
    const k = 1 - Math.exp(-dt * FOLLOW);
    for (const r of this.rovers) {
      const yaw = r.pose === 'poll' ? -Math.PI / 2 : 0;
      r.yaw = approach(r.yaw, yaw, k);
      r.roll = approach(r.roll, r.pose === 'down' ? 1.35 : 0, k);
      r.size = approach(r.size, r.pose === 'off' ? 0.001 : 1, k);
    }
    this.apply(t);
  }

  private apply(t: number): void {
    this.rovers.forEach((r, j) => {
      const c = this.cells[j];
      const shake = r.pose === 'work' ? 0.003 * Math.abs(Math.sin(t * 14 + r.phase)) : 0;
      const shuttle = r.pose === 'poll' ? 0.03 * Math.sin(t * 2.4 + r.phase) : 0;
      r.root.position.set(c.x + shuttle, c.y + shake, c.z);
      r.root.rotation.set(0, r.yaw, r.roll, 'YXZ');
      r.root.scale.setScalar(r.size);
      r.root.updateMatrixWorld(true);
      for (const m of this.meshes) m.setMatrixAt(j, r.root.matrixWorld);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}

export const entregas: ThemeKit = {
  producer(model): ProducerBuild {
    const color = SERVICE.producer;
    contactShadow(model, 1.6, 1.5);
    const base = pedestal(model, 1.6, 1.5, color);
    const box = part('entregas_produtor/bau', mat(SCENE.white));
    const cab = part('entregas_produtor/cabine', mat(color));
    model.add(
      part('entregas_produtor/chao', mat(shade(color, 0.5))),
      box,
      cab,
      part('entregas_produtor/faixa', mat(color)),
      part('entregas_produtor/rodas', mat(SCENE.ink)),
      part('entregas_produtor/vidros', mat(SCENE.ink)),
      part('entregas_produtor/farois', lit(LIT)),
      part('entregas_produtor/metal', mat(SCENE.metal)),
      part('entregas_produtor/detalhe', mat(SCENE.ink)),
      part('entregas_produtor/papelao', mat(CARDBOARD)),
      part('entregas_produtor/saida', mat(color)),
    );
    // o robô que desce do caminhão com a caixa, virado para a esteira (+x)
    const { root, arms } = robot(robotMaterials());
    root.position.set(0.24, LIFT, 0.22);
    root.rotation.y = Math.PI / 2;
    root.scale.setScalar(1.2);
    crateInArms(arms);
    model.add(root);
    return { body: box, baseColor: SCENE.white, pickables: [box, cab, base], labelY: 1.0, send: liftArmsFx(root, arms, -0.15, 0.9) };
  },

  consumer(model, node: GraphNode<'consumer'>): ConsumerBuild {
    const { baseColor, base, body, cells } = consumerBase(model, node, 'entregas_vaga');
    model.add(new Mesh(modelGeometryAt('entregas_vaga/faixa', cells), mat(SCENE.white)), new Mesh(modelGeometryAt('entregas_vaga/poste', cells), mat(SCENE.metal)));
    // a luz do poste de recarga é a luz de estado
    const workerPads = statusLights(model, cells, 'entregas_vaga/luz');
    const rovers = new RoverRig(cells, { body: SCENE.white, bumper: baseColor });
    model.add(...rovers.meshes);
    return { body, baseColor, pickables: [body, base], labelY: 0.8, workerPads, workers: rovers };
  },

  lambda(model, node: GraphNode<'lambda'>): LambdaBuild {
    // entregadores de aplicativo (models/entregas_funcao.scad): chegam de moto, pegam o pedido no
    // balcão e guardam no baú
    const color = SERVICE.lambda;
    return buildYard(
      model,
      node,
      'entregas_funcao',
      [
        { name: 'asfalto', mat: mat(SCENE.dark) },
        { name: 'branco', mat: mat(SCENE.white) },
        { name: 'corpo', mat: mat(color) },
        { name: 'detalhe', mat: mat(SCENE.ink) },
        { name: 'janela', mat: lit(LIT) },
        { name: 'metal', mat: mat(SCENE.metal) },
        { name: 'vaga_f', mat: mat(SCENE.white), at: 'front' },
        { name: 'vaga_b', mat: mat(SCENE.white), at: 'back' },
        { name: 'cones', mat: mat(SCENE.accent), at: 'locked' },
      ],
      {
        arrival: 'vehicle',
        vehicle: {
          parts: [
            { name: 'moto_branco', mat: mat(SCENE.white) },
            { name: 'moto_bau', mat: mat(color) },
            { name: 'moto_rodas', mat: mat(SCENE.ink) },
            { name: 'moto_metal', mat: mat(SCENE.metal) },
          ],
          lamp: { name: 'moto_farol', mat: lit('#ffffff') },
          park: 'station',
          yawOffset: 0,
          riderZ: 6,
          riderScale: 0.9,
        },
        hat: { name: 'entregas_funcao/capacete', mat: mat(color) },
        itemOnVehicle: 11,
        stationTop: 27.7,
        source: [-84, 33, 8.9],
      },
    );
  },

  // a caixa pousa na caçamba do carrinho (y = +6 mm no .scad, atrás da cabine; a 6 + 15 mm do pedestal)
  workerSpot: { x: 0, y: PRACA_H + 0.153, z: -0.06 },
};
