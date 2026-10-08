import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  type Object3D,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { GraphNode } from '../sim/types';
import { QUEUE_LEN } from './layout';

export const NODE_COLORS = {
  producer: '#64748b',
  topic: '#e879f9',
  queue: '#fb923c',
  dlq: '#ef4444',
  consumer: '#34d399',
};

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

function mat(color: string, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) {
  return new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
}

function shadowed<T extends Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildNode(node: GraphNode, isDlq: boolean): NodeView {
  const group = new Group();
  group.position.set(node.x, 0, node.z);
  const pickables: Object3D[] = [];
  const spinners: Object3D[] = [];
  const workerPads: Mesh[] = [];
  let body: Mesh;
  let baseColor: string;
  let labelY = 1.6;

  switch (node.kind) {
    case 'producer': {
      baseColor = NODE_COLORS.producer;
      body = shadowed(new Mesh(new BoxGeometry(1.4, 0.9, 1.3), mat(baseColor)));
      body.position.y = 0.45;
      const roof = shadowed(new Mesh(new ConeGeometry(1.05, 0.6, 4), mat('#94a3b8')));
      roof.position.y = 1.2;
      roof.rotation.y = Math.PI / 4;
      const chimney = shadowed(new Mesh(new BoxGeometry(0.22, 0.6, 0.22), mat('#475569')));
      chimney.position.set(0.4, 1.3, 0.3);
      const door = new Mesh(new BoxGeometry(0.02, 0.45, 0.35), mat('#1e293b'));
      door.position.set(0.71, 0.23, 0);
      group.add(body, roof, chimney, door);
      pickables.push(body, roof);
      labelY = 1.9;
      break;
    }
    case 'topic': {
      baseColor = NODE_COLORS.topic;
      const base = shadowed(new Mesh(new CylinderGeometry(0.7, 0.85, 0.25, 24), mat('#581c87')));
      base.position.y = 0.12;
      body = shadowed(new Mesh(new IcosahedronGeometry(0.55, 1), mat(baseColor, { emissive: '#a21caf', emissiveIntensity: 0.35, flatShading: true })));
      body.position.y = 0.85;
      const ring = new Mesh(new TorusGeometry(0.85, 0.04, 8, 48), mat('#f5d0fe', { emissive: '#f0abfc', emissiveIntensity: 0.4 }));
      ring.position.y = 0.85;
      ring.rotation.x = Math.PI / 2.4;
      const ring2 = ring.clone();
      ring2.rotation.x = -Math.PI / 2.4;
      group.add(base, body, ring, ring2);
      spinners.push(ring, ring2, body);
      pickables.push(body, base);
      labelY = 1.8;
      break;
    }
    case 'queue': {
      baseColor = isDlq ? NODE_COLORS.dlq : NODE_COLORS.queue;
      const fifo = (node as GraphNode<'queue'>).config.fifo;
      body = new Mesh(
        new BoxGeometry(QUEUE_LEN, 1.0, 0.75),
        mat(baseColor, { transparent: true, opacity: 0.28, depthWrite: false }),
      );
      body.position.y = 0.5;
      body.renderOrder = 2;
      const floor = shadowed(new Mesh(new BoxGeometry(QUEUE_LEN + 0.1, 0.06, 0.85), mat(baseColor)));
      floor.position.y = 0.03;
      const capMat = mat(baseColor);
      const capL = shadowed(new Mesh(new BoxGeometry(0.08, 1.0, 0.85), capMat));
      capL.position.set(-QUEUE_LEN / 2, 0.5, 0);
      const capR = capL.clone();
      capR.position.x = QUEUE_LEN / 2;
      group.add(floor, body, capL, capR);
      if (fifo) {
        // trilhos marcam a fila FIFO: "uma por vez, em ordem"
        for (const z of [-0.3, 0.3]) {
          const rail = new Mesh(new BoxGeometry(QUEUE_LEN, 0.05, 0.05), mat('#fef3c7'));
          rail.position.set(0, 1.0, z);
          group.add(rail);
        }
      }
      pickables.push(body, floor, capL, capR);
      labelY = 1.5;
      break;
    }
    case 'consumer': {
      baseColor = NODE_COLORS.consumer;
      body = shadowed(new Mesh(new BoxGeometry(1.5, 0.8, 1.4), mat(baseColor)));
      body.position.y = 0.4;
      const gear = new Mesh(new TorusGeometry(0.28, 0.08, 6, 8), mat('#065f46'));
      gear.position.set(0, 0.4, 0.71);
      group.add(body, gear);
      spinners.push(gear);
      const workers = Math.max(1, (node as GraphNode<'consumer'>).config.workers);
      const rows = Math.ceil(workers / 3);
      for (let j = 0; j < workers; j++) {
        const perRow = Math.min(3, workers);
        const pad = new Mesh(new CylinderGeometry(0.17, 0.17, 0.05, 16), mat('#475569'));
        pad.position.set(((j % 3) - (perRow - 1) / 2) * 0.45, 0.83, (Math.floor(j / 3) - (rows - 1) / 2) * 0.45);
        group.add(pad);
        workerPads.push(pad);
      }
      pickables.push(body);
      labelY = 1.75;
      break;
    }
  }

  for (const p of pickables) p.userData.nodeId = node.id;

  const label = document.createElement('div');
  label.className = `node-label kind-${node.kind}${isDlq ? ' is-dlq' : ''}`;
  const labelObj = new CSS2DObject(label);
  labelObj.position.set(0, labelY, 0);
  labelObj.center.set(0.5, 1);
  group.add(labelObj);

  return { node, group, pickables, label, spinners, workerPads, body: body!, baseColor: baseColor! };
}
