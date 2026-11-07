import { Mesh, type Group, type Material } from 'three';
import { lambdaCap } from '../../sim/engine';
import type { GraphNode } from '../../sim/types';
import { bakedMaterial } from '../bake';
import { modelGeometry } from '../models';
import { contactShadow, matLive, shade } from '../pieces';
import { SERVICE } from '../../theme';
import { lit, robotMaterials } from './common';
import type { LambdaBuild } from './kit';
import { backRow, frontRow, stationOf, YardRig, type YardStyle } from './yard';

/*
 * Monta a função sob demanda de um tema: o pátio (models/<tema>_funcao.scad, sobre o comum
 * models/patio.scad) e os ajudantes (yard.ts). A função não tem pedestal: o pátio é a base, e as
 * partes vão direto no modelo (sem o LIFT de part()).
 */

export interface YardPiece {
  /** Parte do modelo do tema (sem o prefixo). */
  name: string;
  mat: Material;
  /** Uma cópia por posto: em todos, só na fileira da frente / do fundo, ou só nos travados. */
  at?: 'all' | 'front' | 'back' | 'locked';
}

export function buildYard(model: Group, node: GraphNode<'lambda'>, prefix: string, pieces: YardPiece[], style: Omit<YardStyle, 'prefix'>): LambdaBuild {
  const baseColor = shade(SERVICE.lambda, 0.55);
  contactShadow(model, 2.5, 1.95);
  const body = new Mesh(modelGeometry(`${prefix}/base`), matLive(baseColor));
  model.add(body);
  const cap = lambdaCap(node.config);
  const all = Array.from({ length: 20 }, (_, i) => i);
  // postos além da concorrência máxima: os dos últimos workers (os mais à direita)
  const locked = all.filter((j) => j >= cap).map(stationOf);
  const where = { all, front: frontRow(all), back: backRow(all), locked };
  for (const p of pieces) {
    const at = p.at ? where[p.at] : null;
    if (at && !at.length) continue;
    const geo = at ? YardRig.perStation(`${prefix}/${p.name}`, at) : modelGeometry(`${prefix}/${p.name}`);
    model.add(new Mesh(geo, p.mat));
  }
  const bot = robotMaterials();
  const rig = new YardRig({ prefix, ...style }, cap, { body: bot.body, visor: bot.visor, eyes: lit('#ffffff'), light: bakedMaterial('#ffffff') });
  model.add(...rig.objects);
  return { body, baseColor, pickables: [body], labelY: 0.75, rig };
}
