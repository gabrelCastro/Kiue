import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  TorusGeometry,
  type Object3D,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LAMBDA_START_CONCURRENCY, lambdaCap } from '../sim/engine';
import type { GraphNode } from '../sim/types';
import { bakedMaterial, bakeTree } from './bake';
import { modelGeometry } from './models';
import { beltTexture } from './textures';
import { LAMBDA_DECK_H, LIFT, NODE_SCALE, QUEUE_DEPTH, QUEUE_HEIGHT, QUEUE_LEN } from './layout';
import { contactShadow, mat, matLive, part, pedestal, shade } from './pieces';
import type { SendFx, ThemeKit, WorkerRig } from './themes';
import { industria } from './themes/industria';
import { LambdaStation } from './station';
import { SCENE, SERVICE } from '../theme';

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

export interface NodeView {
  node: GraphNode;
  group: Group;
  pickables: Object3D[];
  label: HTMLDivElement;
  /** Último HTML posto no rótulo (comparar com innerHTML obrigava o navegador a serializá-lo). */
  labelHtml?: string;
  spinners: Object3D[];
  workerPads: Mesh[];
  body: Mesh;
  baseColor: string;
  /** Animação do produtor a cada mensagem enviada (portão, fazendeiro…), conforme o tema. */
  send?: SendFx;
  /** Workers do consumidor (braços, vendedores…), conforme o tema. */
  workers?: WorkerRig;
  /** Estação da Lambda: um robô por instância, que sobe quando ela escala. */
  station?: LambdaStation;
}

export function buildNode(node: GraphNode, isDlq: boolean, kit: ThemeKit = industria): NodeView {
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
  let send: SendFx | undefined;
  let workers: WorkerRig | undefined;
  let station: LambdaStation | undefined;
  let baseColor: string;
  let labelY: number;
  const lift = LIFT;

  switch (node.kind) {
    case 'producer': {
      const built = kit.producer(model);
      ({ body, baseColor, labelY, send } = built);
      pickables.push(...built.pickables);
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
      if (isDlq) model.add(part('fila/alerta', mat(SCENE.accent)));
      pickables.push(body, frame, tray);
      labelY = lift + QUEUE_HEIGHT + 0.45;
      break;
    }
    case 'consumer': {
      const built = kit.consumer(model, node as GraphNode<'consumer'>);
      ({ body, baseColor, labelY, workers } = built);
      pickables.push(...built.pickables);
      workerPads.push(...built.workerPads);
      break;
    }
    case 'lambda': {
      // estação de robôs sob demanda (models/lambda.scad, render/station.ts)
      baseColor = NODE_COLORS.lambda;
      contactShadow(model, 2.0, 2.0);
      const deck = new Mesh(modelGeometry('lambda/deck'), mat(SCENE.light));
      body = new Mesh(modelGeometry('lambda/hub'), matLive(baseColor, { flatShading: true }));
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
  return { node, group, pickables, label, spinners, workerPads, body: body!, baseColor: baseColor!, send, workers, station };
}
