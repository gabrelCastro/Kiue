import type { Group } from 'three';
import type { GraphNode } from '../../sim/types';
import { THEME_MODEL_DATA } from '../models.industria.gen';
import { registerModels } from '../models';
import { mat } from '../pieces';
import { SCENE, SERVICE } from '../../theme';
import { buildYard } from './funcao';
import type { LambdaBuild } from './kit';

/*
 * Função sob demanda do tema Indústria, à parte do kit: o kit vem junto com a cena (vitrine da
 * home), e este pedaço (pátio, robozinho) só é baixado quando a montagem tem uma função.
 */

registerModels(THEME_MODEL_DATA);

export function industriaLambda(model: Group, node: GraphNode<'lambda'>): LambdaBuild {
    // robôs do elevador (models/industria_funcao.scad): sobem do piso e fecham as caixas na prensinha
    return buildYard(
      model,
      node,
      'industria_funcao',
      [
        { name: 'piso', mat: mat(SCENE.white) },
        { name: 'faixas', mat: mat(SCENE.accent) },
        { name: 'pocos', mat: mat(SCENE.dark) },
        { name: 'metal', mat: mat(SCENE.metal) },
        { name: 'prensa', mat: mat(SCENE.metal), at: 'all' },
        { name: 'colunas_f', mat: mat(SCENE.metal), at: 'front' },
        { name: 'colunas_b', mat: mat(SCENE.metal), at: 'back' },
        { name: 'travessa_f', mat: mat(SERVICE.lambda), at: 'front' },
        { name: 'travessa_b', mat: mat(SERVICE.lambda), at: 'back' },
        { name: 'cones', mat: mat(SCENE.accent), at: 'locked' },
      ],
      {
        arrival: 'lift',
        hat: { name: 'industria_funcao/capacete', mat: mat(SCENE.accent) },
        work: { kind: 'piston', mat: mat(SCENE.metal), rest: 30, stroke: 5 },
        stationTop: 16.6,
        source: [-100, 18, 20.1],
      },
    );
  }
