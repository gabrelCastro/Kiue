import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  TorusGeometry,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { lambdaCap } from '../sim/engine';
import type { GraphNode } from '../sim/types';
import { bakedMaterial, bakeTree } from './bake';
import { beltTexture, contactShadowTexture } from './textures';
import { LAMBDA_RING, LIFT, NODE_SCALE, QUEUE_DEPTH, QUEUE_HEIGHT, QUEUE_LEN } from './layout';

export const NODE_COLORS = {
  // paleta dos ícones de arquitetura da AWS (mesmas cores de styles.css)
  producer: '#545b64',
  topic: '#8c4fff',
  queue: '#e7157b',
  dlq: '#d13212',
  consumer: '#01a88d',
  lambda: '#ed7100',
};

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
  spinners: Object3D[];
  workerPads: Mesh[];
  body: Mesh;
  baseColor: string;
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
  let baseColor: string;
  let labelY: number;
  const lift = LIFT;

  switch (node.kind) {
    case 'producer': {
      baseColor = '#aab7b8';
      contactShadow(model, 1.6, 1.5);
      const base = pedestal(model, 1.6, 1.5, NODE_COLORS.producer);
      body = new Mesh(rounded(1.3, 0.85, 1.2, 0.08), mat(baseColor));
      body.position.y = lift + 0.425;
      const roof = new Mesh(new ConeGeometry(1.0, 0.55, 4), mat(NODE_COLORS.producer, { flatShading: true }));
      roof.position.y = lift + 1.12;
      roof.rotation.y = Math.PI / 4;
      const chimney = new Mesh(rounded(0.2, 0.5, 0.2, 0.04), mat('#414d5c'));
      chimney.position.set(0.38, lift + 1.2, -0.25);
      // fachada voltada para a câmera (+z): porta e janelas acesas
      const door = new Mesh(new PlaneGeometry(0.3, 0.45), mat('#414d5c'));
      door.position.set(0, lift + 0.23, 0.601);
      const windowMat = mat('#fff1c2', { emissive: '#ffd56b', emissiveIntensity: 0.35 });
      const winL = new Mesh(new PlaneGeometry(0.26, 0.22), windowMat);
      winL.position.set(-0.4, lift + 0.52, 0.601);
      const winR = winL.clone();
      winR.position.x = 0.4;
      model.add(body, roof, chimney, door, winL, winR);
      pickables.push(body, roof, base);
      labelY = 1.75;
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
      baseColor = isDlq ? NODE_COLORS.dlq : NODE_COLORS.queue;
      const fifo = (node as GraphNode<'queue'>).config.fifo;
      const solid = mat(baseColor);
      contactShadow(model, QUEUE_LEN + 0.3, QUEUE_DEPTH + 0.3);
      pedestal(model, QUEUE_LEN + 0.3, QUEUE_DEPTH + 0.3, baseColor);
      // tubo de vidro: transparente para mostrar as mensagens, com reflexo do ambiente
      body = new Mesh(new BoxGeometry(QUEUE_LEN, QUEUE_HEIGHT, QUEUE_DEPTH), new MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.13, depthWrite: false }));
      body.position.y = lift + QUEUE_HEIGHT / 2;
      body.renderOrder = 2;
      const edges = new LineSegments(new EdgesGeometry(body.geometry), new LineBasicMaterial({ color: shade(baseColor, 0.1), transparent: true, opacity: 0.6 }));
      edges.position.copy(body.position);
      // esteira: as mensagens esperam em cima dela e ela rola para a cabeça da fila (à direita)
      const floor = new Mesh(rounded(QUEUE_LEN, 0.06, QUEUE_DEPTH, 0.03), mat('#2b3036', { roughness: 0.9, metalness: 0 }));
      floor.position.y = lift + 0.03;
      const beltTex = beltTexture();
      beltTex.repeat.set(QUEUE_LEN * 1.4, 1);
      const beltMat = bakedMaterial('#ffffff');
      beltMat.map = beltTex;
      const belt = new Mesh(new PlaneGeometry(QUEUE_LEN - 0.1, QUEUE_DEPTH - 0.16), beltMat);
      belt.rotation.x = -Math.PI / 2;
      belt.position.y = lift + 0.062;
      // roletes nas pontas da esteira
      for (const x of [-QUEUE_LEN / 2 + 0.16, QUEUE_LEN / 2 - 0.16]) {
        const roller = new Mesh(new CylinderGeometry(0.06, 0.06, QUEUE_DEPTH - 0.1, 16), mat('#8a929b', { metalness: 0.5, roughness: 0.35 }));
        roller.rotation.x = Math.PI / 2;
        roller.position.set(x, lift + 0.06, 0);
        model.add(roller);
      }
      model.add(belt);
      const capL = new Mesh(rounded(0.14, QUEUE_HEIGHT + 0.1, QUEUE_DEPTH + 0.12, 0.05), solid);
      capL.position.set(-QUEUE_LEN / 2, lift + QUEUE_HEIGHT / 2 + 0.05, 0);
      const capR = capL.clone();
      capR.position.x = QUEUE_LEN / 2;
      model.add(floor, body, edges, capL, capR);
      if (fifo) {
        // trilhos marcam a fila FIFO: "uma por vez, em ordem"
        for (const z of [-QUEUE_DEPTH / 2 + 0.08, QUEUE_DEPTH / 2 - 0.08]) {
          const rail = new Mesh(rounded(QUEUE_LEN, 0.06, 0.06, 0.03), mat('#414d5c'));
          rail.position.set(0, lift + QUEUE_HEIGHT, z);
          model.add(rail);
        }
      }
      pickables.push(body, floor, capL, capR);
      labelY = lift + QUEUE_HEIGHT + 0.45;
      break;
    }
    case 'consumer': {
      baseColor = NODE_COLORS.consumer;
      contactShadow(model, 1.7, 1.6);
      const base = pedestal(model, 1.7, 1.6, baseColor);
      body = new Mesh(rounded(1.5, 0.78, 1.4, 0.1), mat(baseColor));
      body.position.y = lift + 0.39;
      // fachada de servidor: frestas de ventilação e a engrenagem que gira enquanto processa
      const ventMat = mat(shade(baseColor, 0.45, '#0f141a'));
      for (const y of [0.22, 0.36, 0.5]) {
        const vent = new Mesh(new BoxGeometry(0.5, 0.04, 0.02), ventMat);
        vent.position.set(-0.35, lift + y, 0.705);
        model.add(vent);
      }
      const gear = new Mesh(new TorusGeometry(0.2, 0.07, 6, 8), mat(shade(baseColor, 0.45, '#0f141a')));
      gear.position.set(0.38, lift + 0.39, 0.72);
      const led = new Mesh(new CylinderGeometry(0.04, 0.04, 0.02, 12), mat('#29ad32', { emissive: '#29ad32', emissiveIntensity: 0.4 }));
      led.rotation.x = Math.PI / 2;
      led.position.set(-0.6, lift + 0.6, 0.71);
      model.add(body, gear, led);
      spinners.push(gear);
      const workers = Math.max(1, (node as GraphNode<'consumer'>).config.workers);
      const rows = Math.ceil(workers / 3);
      for (let j = 0; j < workers; j++) {
        const perRow = Math.min(3, workers);
        const pad = new Mesh(new CylinderGeometry(0.17, 0.17, 0.05, 20), mat('#b4b4bb'));
        pad.position.set(((j % 3) - (perRow - 1) / 2) * 0.45, lift + 0.8, (Math.floor(j / 3) - (rows - 1) / 2) * 0.45);
        model.add(pad);
        workerPads.push(pad);
      }
      pickables.push(body, base);
      labelY = 1.6;
      break;
    }
    case 'lambda': {
      baseColor = NODE_COLORS.lambda;
      contactShadow(model, 2.0, 2.0);
      const base = new Mesh(new CylinderGeometry(0.98, 1.02, 0.14, 6), mat(shade(baseColor, 0.86), { flatShading: true, roughness: 0.8, metalness: 0 }));
      base.position.y = 0.09;
      const glow = new Mesh(new CylinderGeometry(1.04, 1.04, 0.03, 6), new MeshBasicMaterial({ color: shade(baseColor, 0.35) }));
      glow.position.y = 0.02;
      body = new Mesh(new CylinderGeometry(0.75, 0.8, 0.75, 6), mat(baseColor, { flatShading: true }));
      body.position.y = lift + 0.375;
      const top = new Mesh(new CylinderGeometry(0.62, 0.75, 0.08, 6), mat(shade(baseColor, 0.3), { flatShading: true }));
      top.position.y = lift + 0.79;
      const glyph = new Mesh(new PlaneGeometry(0.85, 0.85), new MeshBasicMaterial({ map: lambdaGlyph(), transparent: true, depthWrite: false }));
      glyph.rotation.x = -Math.PI / 2;
      glyph.position.y = lift + 0.84;
      model.add(glow, base, body, top, glyph);
      const slots = lambdaCap((node as GraphNode<'lambda'>).config);
      for (let j = 0; j < slots; j++) {
        const a = (j / slots) * Math.PI * 2 - Math.PI / 2;
        const pad = new Mesh(new CylinderGeometry(0.09, 0.09, 0.05, 12), mat('#d1d5db'));
        pad.position.set(Math.cos(a) * LAMBDA_RING, 0.03, Math.sin(a) * LAMBDA_RING);
        model.add(pad);
        workerPads.push(pad);
      }
      pickables.push(body, base);
      labelY = 1.55;
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
  return { node, group, pickables, label, spinners, workerPads, body: body!, baseColor: baseColor! };
}
