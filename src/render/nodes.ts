import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  TorusGeometry,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LAMBDA_START_CONCURRENCY, lambdaCap } from '../sim/engine';
import type { GraphNode } from '../sim/types';
import { bakedMaterial, bakeTree } from './bake';
import { modelGeometry, modelGeometryAt } from './models';
import { beltTexture, contactShadowTexture } from './textures';
import { BENCH_TOP, LAMBDA_DECK_H, LIFT, NODE_SCALE, QUEUE_DEPTH, QUEUE_HEIGHT, QUEUE_LEN, TOKEN_H, workerCell } from './layout';
import { ArmRig } from './robots';
import { LambdaStation } from './station';
import { PALETTE, SCENE, SERVICE, WORKER } from '../theme';

/** Cor de cada serviço (src/theme.ts; as mesmas variáveis --producer, --sns... de styles.css). */
export const NODE_COLORS = SERVICE;

let lambdaTexture: CanvasTexture | null = null;
function lambdaGlyph(): CanvasTexture {
  if (lambdaTexture) return lambdaTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 104px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('λ', 64, 70);
  lambdaTexture = new CanvasTexture(canvas);
  return lambdaTexture;
}

/** Uma parte modelada no OpenSCAD, apoiada no pedestal. */
function part(name: string, material: MeshBasicMaterial): Mesh {
  const m = new Mesh(modelGeometry(name), material);
  m.position.y = LIFT;
  return m;
}

// Pontos tirados dos .scad: (x, z, −y) / 100, acima do pedestal e antes do NODE_SCALE.
/** Topo do portão de enrolar do produtor (W/2 − DOOR_IN + 1,3; 0; DOOR_Z1). */
const DOOR_AT = { x: 0.533, y: 0.44, z: 0 };
/** Quanto o portão enrola (fração da altura) a cada mensagem enviada. */
export const DOOR_OPEN = 0.85;

export interface NodeView {
  node: GraphNode;
  group: Group;
  pickables: Object3D[];
  label: HTMLDivElement;
  spinners: Object3D[];
  workerPads: Mesh[];
  body: Mesh;
  baseColor: string;
  /** Portão do produtor: enrola e desenrola a cada mensagem enviada. */
  door?: Object3D;
  /** Início (performance.now) da última abertura do portão. */
  doorAt: number;
  /** Braços robóticos do consumidor, um por worker. */
  arms?: ArmRig;
  /** Estação da Lambda: um robô por instância, que sobe quando ela escala. */
  station?: LambdaStation;
}

/**
 * Material das peças: luz assada nos vértices (ver bake.ts). `emissive` (janela acesa, LED) vira
 * cor pura, sem sombreado; os demais campos de material físico antigos são ignorados.
 */
function mat(color: string, extra: { flatShading?: boolean; emissive?: string; emissiveIntensity?: number; roughness?: number; metalness?: number } = {}) {
  if (extra.emissive) return new MeshBasicMaterial({ color });
  return bakedMaterial(color, { flat: extra.flatShading });
}

function rounded(w: number, h: number, d: number, radius = 0.1) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2));
}

/** Mistura a cor da peça com `toward` (por padrão, branco: tons claros para bases e detalhes). */
function shade(color: string, amount: number, toward = '#ffffff'): string {
  return `#${new Color(color).lerp(new Color(toward), amount).getHexString()}`;
}

/** Mancha de sombra suave sob a peça: assenta o modelo no chão sem custo de luz. */
function contactShadow(group: Group, w: number, d: number): void {
  const blob = new Mesh(
    new PlaneGeometry(w * 1.6, d * 1.6),
    new MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  // deslocada para longe da luz (que vem da esquerda e da frente): faz o papel da sombra projetada
  blob.position.set(w * 0.16, 0.004, -d * 0.12);
  blob.renderOrder = -1;
  group.add(blob);
}

/**
 * Base de "peça de tabuleiro": uma placa clara na cor do serviço, com um filete mais forte em
 * volta. Dá unidade visual entre as peças e destaca cada uma do chão, sem brilho.
 */
function pedestal(group: Group, w: number, d: number, color: string): Mesh {
  const glow = new Mesh(rounded(w + 0.08, 0.03, d + 0.08, 0.06), new MeshBasicMaterial({ color: shade(color, 0.35) }));
  glow.position.y = 0.015;
  const base = new Mesh(rounded(w, 0.14, d, 0.07), mat(shade(color, 0.86), { roughness: 0.8, metalness: 0 }));
  base.position.y = 0.09;
  group.add(glow, base);
  return base;
}

export function buildNode(node: GraphNode, isDlq: boolean): NodeView {
  const group = new Group();
  group.position.set(node.x, 0, node.z);
  // As peças são modeladas em escala 1 e ampliadas aqui; a fila é modelada direto no tamanho final.
  const model = new Group();
  if (node.kind !== 'queue') model.scale.setScalar(NODE_SCALE);
  group.add(model);
  const pickables: Object3D[] = [];
  const spinners: Object3D[] = [];
  const workerPads: Mesh[] = [];
  let body: Mesh;
  let door: Object3D | undefined;
  let arms: ArmRig | undefined;
  let station: LambdaStation | undefined;
  let baseColor: string;
  let labelY: number;
  const lift = LIFT;

  switch (node.kind) {
    case 'producer': {
      // doca de expedição (models/produtor.scad): o portão enrola a cada mensagem enviada
      baseColor = SCENE.light;
      contactShadow(model, 1.6, 1.5);
      const base = pedestal(model, 1.6, 1.5, NODE_COLORS.producer);
      body = part('produtor/corpo', mat(baseColor));
      const roof = part('produtor/telhado', mat(NODE_COLORS.producer));
      door = part('produtor/portao', mat(SCENE.metal));
      door.position.set(DOOR_AT.x, lift + DOOR_AT.y, DOOR_AT.z);
      model.add(
        body,
        roof,
        door,
        part('produtor/detalhe', mat(SCENE.ink)),
        part('produtor/doca', mat(SCENE.dim)),
        part('produtor/janelas', mat('#fff1c2', { emissive: '#ffd56b' })),
        part('produtor/palete', mat('#9a7448')),
        part('produtor/caixas', mat('#c8a165')),
      );
      pickables.push(body, roof, base);
      labelY = 1.4;
      break;
    }
    case 'topic': {
      baseColor = NODE_COLORS.topic;
      contactShadow(model, 1.7, 1.7);
      const base = new Mesh(new CylinderGeometry(0.72, 0.85, 0.22, 32), mat(shade(NODE_COLORS.topic, 0.86), { roughness: 0.8, metalness: 0 }));
      base.position.y = 0.11;
      const glow = new Mesh(new TorusGeometry(0.8, 0.02, 8, 64), new MeshBasicMaterial({ color: shade(NODE_COLORS.topic, 0.35) }));
      glow.rotation.x = Math.PI / 2;
      glow.position.y = 0.22;
      body = new Mesh(new IcosahedronGeometry(0.55, 1), mat(baseColor, { flatShading: true }));
      body.position.y = 0.88;
      const ring = new Mesh(new TorusGeometry(0.85, 0.025, 8, 48), mat(shade(NODE_COLORS.topic, 0.55)));
      ring.position.y = 0.88;
      ring.rotation.x = Math.PI / 2.4;
      const ring2 = ring.clone();
      ring2.rotation.x = -Math.PI / 2.4;
      model.add(base, glow, body, ring, ring2);
      spinners.push(ring, ring2, body);
      pickables.push(body, base);
      labelY = 1.65;
      break;
    }
    case 'queue': {
      // models/fila.scad: tampas, aros e barras, bandeja e roletes; vidro e esteira ficam aqui
      baseColor = isDlq ? NODE_COLORS.dlq : NODE_COLORS.queue;
      const fifo = (node as GraphNode<'queue'>).config.fifo;
      contactShadow(model, QUEUE_LEN + 0.3, QUEUE_DEPTH + 0.3);
      pedestal(model, QUEUE_LEN + 0.3, QUEUE_DEPTH + 0.3, baseColor);
      // tubo de vidro: transparente para mostrar as mensagens
      body = new Mesh(new BoxGeometry(QUEUE_LEN, QUEUE_HEIGHT, QUEUE_DEPTH), new MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.13, depthWrite: false }));
      body.position.y = lift + QUEUE_HEIGHT / 2;
      body.renderOrder = 2;
      // esteira: as mensagens esperam em cima dela e ela rola para a cabeça da fila (à direita)
      const beltTex = beltTexture();
      beltTex.repeat.set(QUEUE_LEN * 1.4, 1);
      const beltMat = bakedMaterial('#ffffff');
      beltMat.map = beltTex;
      const belt = new Mesh(new PlaneGeometry(QUEUE_LEN - 0.1, QUEUE_DEPTH - 0.16), beltMat);
      belt.rotation.x = -Math.PI / 2;
      belt.position.y = lift + 0.062;
      const frame = part('fila/moldura', mat(baseColor));
      const tray = part('fila/base', mat(SCENE.ink));
      model.add(tray, belt, part('fila/rolos', mat(SCENE.metal)), part('fila/detalhe', mat(SCENE.dark)), frame, body);
      // FIFO: guias formam uma pista única ("uma por vez, em ordem"); DLQ: faixas de alerta
      if (fifo) model.add(part('fila/guias', mat(SCENE.dark)));
      if (isDlq) model.add(part('fila/alerta', mat(PALETTE.amarelo)));
      pickables.push(body, frame, tray);
      labelY = lift + QUEUE_HEIGHT + 0.45;
      break;
    }
    case 'consumer': {
      // bancada de triagem (models/consumidor.scad): uma célula com braço robótico por worker
      baseColor = NODE_COLORS.consumer;
      contactShadow(model, 1.7, 1.6);
      const base = pedestal(model, 1.7, 1.6, baseColor);
      body = part('consumidor/corpo', mat(baseColor));
      model.add(body, part('consumidor/detalhe', mat(SCENE.ink)), part('consumidor/tampo', mat(SCENE.white)));
      const workers = Math.max(1, (node as GraphNode<'consumer'>).config.workers);
      const cells = Array.from({ length: workers }, (_, j) => {
        const c = workerCell(j, workers);
        return { x: c.x, y: lift + BENCH_TOP, z: c.z };
      });
      // tapetes numa malha só; o anel de luz de cada worker é separado porque muda de cor
      model.add(new Mesh(modelGeometryAt('consumidor/celula', cells), mat(SCENE.dark)));
      for (const c of cells) {
        const pad = new Mesh(modelGeometry('consumidor/luz'), mat(WORKER.idle));
        pad.position.set(c.x, c.y, c.z);
        model.add(pad);
        workerPads.push(pad);
      }
      arms = new ArmRig(cells, { base: mat(PALETTE.amarelo), arm: mat(PALETTE.amarelo), fore: mat(SCENE.dark) }, TOKEN_H * 1.05 / NODE_SCALE);
      model.add(...arms.meshes);
      pickables.push(body, base);
      labelY = 1.6;
      break;
    }
    case 'lambda': {
      // estação de robôs sob demanda (models/lambda.scad, render/station.ts)
      baseColor = NODE_COLORS.lambda;
      contactShadow(model, 2.0, 2.0);
      const deck = new Mesh(modelGeometry('lambda/deck'), mat(SCENE.light));
      body = new Mesh(modelGeometry('lambda/hub'), mat(baseColor, { flatShading: true }));
      const glyph = new Mesh(new PlaneGeometry(0.66, 0.66), new MeshBasicMaterial({ map: lambdaGlyph(), transparent: true, depthWrite: false }));
      glyph.rotation.x = -Math.PI / 2;
      glyph.position.y = LAMBDA_DECK_H + 0.4 + 0.004;
      station = new LambdaStation(lambdaCap((node as GraphNode<'lambda'>).config), {
        bay: mat(SCENE.dark),
        lock: mat(SCENE.metal),
        light: bakedMaterial('#ffffff'),
        body: mat(SCENE.white),
        stripe: mat(baseColor),
        detail: mat(SCENE.ink),
      });
      station.update(LAMBDA_START_CONCURRENCY, 0, 0);
      model.add(deck, body, new Mesh(modelGeometry('lambda/hub_detalhe'), mat(SCENE.ink)), glyph, ...station.objects);
      pickables.push(body, deck);
      labelY = 1.0;
      break;
    }
  }

  for (const p of pickables) p.userData.nodeId = node.id;

  const label = document.createElement('div');
  label.className = `node-label kind-${node.kind}${isDlq ? ' is-dlq' : ''}`;
  const labelObj = new CSS2DObject(label);
  labelObj.position.set(0, labelY!, 0);
  labelObj.center.set(0.5, 1);
  model.add(labelObj);

  bakeTree(group);
  return { node, group, pickables, label, spinners, workerPads, body: body!, baseColor: baseColor!, door, doorAt: -Infinity, arms, station };
}
