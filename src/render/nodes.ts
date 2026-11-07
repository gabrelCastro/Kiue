import {
  BoxGeometry,
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
import { mergeStatic } from './merge';
import { beltTexture } from './textures';
import { LIFT, NODE_SCALE, QUEUE_DEPTH, QUEUE_HEIGHT, QUEUE_LEN } from './layout';
import { contactShadow, mat, matLive, part, pedestal, shade } from './pieces';
import type { LambdaRig, SendFx, ThemeKit, WorkerRig } from './themes';
import { industria } from './themes/industria';
import { SCENE, SERVICE } from '../theme';

/** Cor de cada serviço (src/theme.ts; as mesmas variáveis --producer, --sns... de styles.css). */
export const NODE_COLORS = SERVICE;

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
  /** Função sob demanda do tema: um ajudante por instância (render/themes/yard.ts). */
  rig?: LambdaRig;
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
  let rig: LambdaRig | undefined;
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
      // pátio do tema (render/themes/yard.ts): um ajudante por instância. A cena só monta com o
      // kit completo (kitFor com função); sem ele, uma base simples no lugar.
      if (kit.lambda) {
        const built = kit.lambda(model, node as GraphNode<'lambda'>);
        ({ body, baseColor, labelY, rig } = built);
        pickables.push(...built.pickables);
        rig.update(Math.min(LAMBDA_START_CONCURRENCY, lambdaCap((node as GraphNode<'lambda'>).config)), 0, 0);
        break;
      }
      baseColor = NODE_COLORS.lambda;
      contactShadow(model, 2.4, 1.9);
      body = new Mesh(new BoxGeometry(2.3, 0.08, 1.75), matLive(baseColor));
      body.position.y = 0.04;
      model.add(body);
      pickables.push(body);
      labelY = 0.75;
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
  // partes paradas numa malha só (menos chamadas de desenho); as que mexem ou mudam de cor ficam
  // (o corpo do consumidor e da função muda de cor, mas tem material próprio e já fica de fora)
  mergeStatic(group, new Set<Object3D>([...spinners, ...workerPads]), pickables);
  for (const p of pickables) p.userData.nodeId = node.id;
  return { node, group, pickables, label, spinners, workerPads, body: body!, baseColor: baseColor!, send, workers, rig };
}
