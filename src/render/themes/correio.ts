import { Mesh } from 'three';
import type { GraphNode } from '../../sim/types';
import { LIFT } from '../layout';
import { THEME_MODEL_DATA } from '../models.correio.gen';
import { modelGeometryAt, registerModels } from '../models';
import { contactShadow, mat, part, pedestal, shade } from '../pieces';
import { SCENE, SERVICE } from '../../theme';
import { CARDBOARD, consumerBase, liftArmsFx, PRACA_H, robot, robotMaterials, statusLights, VendorRig } from './common';
import type { ConsumerBuild, ProducerBuild, ThemeKit } from './kit';

/*
 * Tema Correio. Produtor = bancada de empacotamento (models/correio_produtor.scad): um robô atrás
 * da mesa fecha as caixas e solta na rampa; a cada envio ele "bate" a fita. Consumidor = guichês
 * (models/correio_guiche.scad): um atendente por worker atrás do balcão, plaquinha com a luz.
 */

registerModels(THEME_MODEL_DATA);

export const correio: ThemeKit = {
  producer(model): ProducerBuild {
    const color = SERVICE.producer;
    contactShadow(model, 1.6, 1.5);
    const base = pedestal(model, 1.6, 1.5, color);
    const table = part('correio_produtor/mesa', mat(SCENE.white));
    model.add(
      part('correio_produtor/chao', mat(shade(color, 0.5))),
      table,
      part('correio_produtor/faixa', mat(color)),
      part('correio_produtor/metal', mat(SCENE.metal)),
      part('correio_produtor/detalhe', mat(SCENE.ink)),
      part('correio_produtor/papelao', mat(CARDBOARD)),
      part('correio_produtor/saida', mat(color)),
    );
    // o empacotador, atrás da mesa e de frente para o jogador
    const { root, arms } = robot(robotMaterials());
    root.position.set(-0.14, LIFT, -0.36);
    root.scale.setScalar(1.35);
    model.add(root);
    return { body: table, baseColor: SCENE.white, pickables: [table, base], labelY: 1.0, send: liftArmsFx(root, arms, 0.1, -0.45, 380) };
  },

  consumer(model, node: GraphNode<'consumer'>): ConsumerBuild {
    const { baseColor, base, body, cells } = consumerBase(model, node, 'correio_guiche');
    model.add(
      new Mesh(modelGeometryAt('correio_guiche/balcao', cells), mat(baseColor)),
      new Mesh(modelGeometryAt('correio_guiche/tampo', cells), mat(SCENE.white)),
      new Mesh(modelGeometryAt('correio_guiche/haste', cells), mat(SCENE.metal)),
      new Mesh(modelGeometryAt('correio_guiche/placa', cells), mat(SCENE.ink)),
    );
    const workerPads = statusLights(model, cells, 'correio_guiche/luz');
    const clerks = new VendorRig(cells, robotMaterials());
    model.add(...clerks.meshes);
    return { body, baseColor, pickables: [body, base], labelY: 0.9, workerPads, workers: clerks };
  },

  // a caixa pousa na bandeja do balcão (y = −13 mm no .scad; tampo a 6 + 16 mm)
  workerSpot: { x: 0, y: PRACA_H + 0.17, z: 0.13 },
};
