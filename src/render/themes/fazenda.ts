import { Mesh } from 'three';
import type { GraphNode } from '../../sim/types';
import { LIFT } from '../layout';
import { THEME_MODEL_DATA } from '../models.fazenda.gen';
import { modelGeometryAt, registerModels } from '../models';
import { contactShadow, mat, part, pedestal, shade } from '../pieces';
import { SCENE, SERVICE } from '../../theme';
import { CARDBOARD, consumerBase, crateInArms, liftArmsFx, PRACA_H, robot, robotMaterials, statusLights, VendorRig } from './common';
import type { ConsumerBuild, ProducerBuild, ThemeKit } from './kit';

/*
 * Tema Fazenda. Produtor = horta com celeiro (models/fazenda_produtor.scad) e um robô fazendeiro
 * de chapéu que ergue o caixote a cada mensagem enviada. Consumidor = feira
 * (models/fazenda_feira.scad): cada worker é uma barraquinha com um robô vendedor de chapéu.
 * Medidas dos .scad em mm / 100, antes do NODE_SCALE; o .scad tem a frente em −y, o jogo em +z.
 */

registerModels(THEME_MODEL_DATA);

const WOOD = '#b0864f';
const SOIL = '#9a7448';
const LEAF = '#3f9a52';

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
    // fazendeiro de chapéu virado para a saída (+x), com o caixote nos braços
    const { root, arms } = robot(robotMaterials(), { hat: true });
    root.position.set(0.24, LIFT, 0.3);
    root.rotation.y = Math.PI / 2;
    root.scale.setScalar(1.2);
    crateInArms(arms);
    model.add(root);
    return { body: barn, baseColor: SCENE.white, pickables: [barn, roof, base], labelY: 1.0, send: liftArmsFx(root, arms, -0.15, 0.9) };
  },

  consumer(model, node: GraphNode<'consumer'>): ConsumerBuild {
    const { baseColor, base, body, cells } = consumerBase(model, node, 'fazenda_feira');
    // barraquinhas (balcão, toldo listrado e postes) numa malha por material
    model.add(
      new Mesh(modelGeometryAt('fazenda_feira/balcao', cells), mat(WOOD)),
      new Mesh(modelGeometryAt('fazenda_feira/toldo_a', cells), mat(baseColor)),
      new Mesh(modelGeometryAt('fazenda_feira/toldo_b', cells), mat(SCENE.white)),
      new Mesh(modelGeometryAt('fazenda_feira/poste', cells), mat(SCENE.metal)),
    );
    // a lanterna de cada barraca é a luz de estado do worker
    const workerPads = statusLights(model, cells, 'fazenda_feira/luz');
    const vendors = new VendorRig(cells, robotMaterials(), { hat: true });
    model.add(...vendors.meshes);
    return { body, baseColor, pickables: [body, base], labelY: 1.0, workerPads, workers: vendors };
  },

  // a caixa pousa no balcão (frente da célula, y = −12 mm no .scad; tampo a 6 + 14 mm do pedestal)
  workerSpot: { x: 0, y: PRACA_H + 0.14, z: 0.12 },
};
