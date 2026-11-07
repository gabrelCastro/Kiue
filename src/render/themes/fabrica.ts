import { Mesh } from 'three';
import type { GraphNode } from '../../sim/types';
import { LIFT } from '../layout';
import { THEME_MODEL_DATA } from '../models.fabrica.gen';
import { modelGeometry, modelGeometryAt, registerModels } from '../models';
import { contactShadow, mat, part, pedestal, shade } from '../pieces';
import { CATEGORY, SCENE, SERVICE } from '../../theme';
import { CARDBOARD, consumerBase, LiftFx, LIT, lit, PRACA_H, robotMaterials, statusLights, VendorRig } from './common';
import type { ConsumerBuild, LambdaBuild, ProducerBuild, ThemeKit } from './kit';
import { buildYard } from './funcao';
import { bakedMaterial } from '../bake';


/*
 * Tema Fábrica de brinquedos. Produtor = fabriquinha com cara (models/fabrica_produtor.scad): as
 * janelas são os olhos, a porta é a boca, e a chaminé solta uma baforada a cada envio. Consumidor
 * = mesinhas (models/fabrica_mesa.scad): um robô por worker abrindo a caixa na mesinha.
 */

registerModels(THEME_MODEL_DATA);

/** Boca da chaminé (fabrica_produtor.scad CHIM, CHIM_TOP), em unidades do jogo. */
const CHIMNEY = { x: -0.44, y: 0.79, z: -0.26 };

export const fabrica: ThemeKit = {
  producer(model): ProducerBuild {
    const color = SERVICE.producer;
    contactShadow(model, 1.6, 1.5);
    const base = pedestal(model, 1.6, 1.5, color);
    const walls = part('fabrica_produtor/paredes', mat(SCENE.white));
    const roof = part('fabrica_produtor/telhado', mat(color));
    model.add(
      part('fabrica_produtor/chao', mat(shade(color, 0.5))),
      walls,
      roof,
      part('fabrica_produtor/janelas', lit(LIT)),
      part('fabrica_produtor/rosto', mat(SCENE.ink)),
      part('fabrica_produtor/metal', mat(SCENE.metal)),
      part('fabrica_produtor/papelao', mat(CARDBOARD)),
      part('fabrica_produtor/saida', mat(color)),
    );
    // fumaça: cresce e sobe numa baforada a cada mensagem enviada
    const smoke = new Mesh(modelGeometry('fabrica_produtor/fumaca'), mat(SCENE.light));
    smoke.position.set(CHIMNEY.x, LIFT + CHIMNEY.y, CHIMNEY.z);
    smoke.userData.dynamic = true;
    model.add(smoke);
    const send = new LiftFx(600, (puff, now) => {
      smoke.scale.setScalar(1 + 0.45 * puff + 0.04 * Math.sin(now * 0.003));
      smoke.position.y = LIFT + CHIMNEY.y + 0.06 * puff;
    });
    return { body: walls, baseColor: SCENE.white, pickables: [walls, roof, base], labelY: 1.25, send };
  },

  consumer(model, node: GraphNode<'consumer'>): ConsumerBuild {
    const { baseColor, base, body, cells } = consumerBase(model, node, 'fabrica_mesa');
    model.add(
      new Mesh(modelGeometryAt('fabrica_mesa/tampo', cells), mat(SCENE.white)),
      new Mesh(modelGeometryAt('fabrica_mesa/borda', cells), mat(baseColor)),
      new Mesh(modelGeometryAt('fabrica_mesa/pe', cells), mat(SCENE.metal)),
    );
    // o "brinquedo" aceso na beira da mesa é a luz de estado
    const workerPads = statusLights(model, cells, 'fabrica_mesa/luz');
    // o robô fica atrás da mesinha (mesa em y = −8 mm, robô em y = +12 mm no .scad)
    const makers = new VendorRig(cells, robotMaterials(), { behind: 0.12 });
    model.add(...makers.meshes);
    return { body, baseColor, pickables: [body, base], labelY: 0.9, workerPads, workers: makers };
  },

  lambda(model, node: GraphNode<'lambda'>): LambdaBuild {
    // robôs montados na hora (models/fabrica_funcao.scad): a cabine monta o robô, ele monta o brinquedo
    const color = SERVICE.lambda;
    return buildYard(
      model,
      node,
      'fabrica_funcao',
      [
        { name: 'piso', mat: mat(SCENE.white) },
        { name: 'tapete', mat: mat(shade(color, 0.62)) },
        { name: 'metal', mat: mat(SCENE.metal) },
        { name: 'corpo', mat: mat(color) },
        { name: 'celula', mat: mat(SCENE.dark) },
        { name: 'detalhe', mat: mat(SCENE.ink) },
        { name: 'pecas_a', mat: mat(CATEGORY.azulClaro) },
        { name: 'pecas_b', mat: mat(CATEGORY.ambar) },
        { name: 'pecas_c', mat: mat(CATEGORY.violeta) },
        { name: 'vidro', mat: bakedMaterial('#dff3ff', { transparent: true, opacity: 0.35 }) },
        { name: 'bancada', mat: mat('#b0864f'), at: 'all' },
        { name: 'pernas', mat: mat(SCENE.metal), at: 'all' },
        { name: 'cones', mat: mat(SCENE.accent), at: 'locked' },
      ],
      { arrival: 'pod', hat: { name: 'fabrica_funcao/helice', mat: mat(SCENE.accent) }, stationTop: 19.6, source: [-100, 18, 11.7] },
    );
  },

  // a caixa pousa no tampo da mesinha (centro em y = −8 mm; tampo a 6 + 18 mm)
  workerSpot: { x: 0, y: PRACA_H + 0.18, z: 0.08 },
};
