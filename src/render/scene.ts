import {
  NeutralToneMapping,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineDashedMaterial,
  MOUSE,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PMREMGenerator,
  Plane,
  PlaneGeometry,
  Raycaster,
  Path,
  Shape,
  ShapeGeometry,
  Scene,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Curve,
  type Texture,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { groupColor, POISON_COLOR, typeInfo } from '../game/catalog';
import type { Controller } from '../game/controller';
import { FOOTPRINT } from '../game/footprint';
import { dlqIds } from '../game/graph';
import { describeFilterPolicy } from '../sim/filter';
import type { Simulation } from '../sim/engine';
import type { GraphNode, SimEvent, Token } from '../sim/types';
import { Effects } from './effects';
import { dlqCurve, edgeCurve, lambdaSlot, NODE_SCALE, QUEUE_DEPTH, QUEUE_LEN, queueSlot, workerSlot } from './layout';
import { buildNode, NODE_COLORS, setNodeEnvironment, type NodeView } from './nodes';
import { describeNode } from './labels';

const MAX_TOKENS = 4000;
const DIM_COLOR = new Color('#d1d5db');
const BAR_COLOR = new Color('#3d3d3d');
/** Cores dos pads de worker por estado (pré-calculadas: o frame não interpreta strings). */
const PAD = {
  down: new Color('#d91515'),
  busy: new Color('#29ad32'),
  polling: new Color('#0099ff'),
  off: new Color('#e9ebed'),
  idle: new Color('#b4b4bb'),
};
const DOWN_BODY = new Color('#f4a3a3');
const MAX_BARS = 300;
const FLOOR_COLOR = '#f2f3f5';
/** Contorno de seleção: preto, como o resto da interface. */
const SELECT_COLOR = '#111111';
const VIEW_WIDTH = 23;
const VIEW_HEIGHT_MIN = 13;
/** Direção da câmera (ortográfica): ~51° de elevação, olhando de +z. Mais baixa, as filas empilhadas se cobrem. */
const CAMERA_DIR = new Vector3(0, 1.25, 1).normalize();
const CAMERA_DISTANCE = 40;
/** Limites do zoom automático ao abrir uma fase: perto o bastante para ver as peças, sem cortar a área de montagem. */
const FIT_ZOOM_MIN = 0.8;
const FIT_ZOOM_MAX = 1.5;

/** Moldura de seleção: retângulo arredondado vazado, no chão, em volta da peça. */
function frameGeometry(w: number, d: number, thickness = 0.07, radius = 0.35): ShapeGeometry {
  const rect = (p: Path, hw: number, hd: number, r: number) => {
    p.moveTo(-hw + r, -hd);
    p.lineTo(hw - r, -hd);
    p.quadraticCurveTo(hw, -hd, hw, -hd + r);
    p.lineTo(hw, hd - r);
    p.quadraticCurveTo(hw, hd, hw - r, hd);
    p.lineTo(-hw + r, hd);
    p.quadraticCurveTo(-hw, hd, -hw, hd - r);
    p.lineTo(-hw, -hd + r);
    p.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  };
  const outer = new Shape();
  rect(outer, w / 2, d / 2, radius);
  const hole = new Path();
  rect(hole, w / 2 - thickness, d / 2 - thickness, radius - thickness);
  outer.holes.push(hole);
  return new ShapeGeometry(outer, 8);
}

interface EdgeView {
  key: string;
  curve: Curve<Vector3>;
  object: Object3D;
}

/** Cena 3D: lê o estado do Controller a cada frame e desenha. */
export class SceneView {
  private renderer: WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private controls: OrbitControls;
  private world = new Group();
  private nodeViews = new Map<string, NodeView>();
  private curves = new Map<string, Curve<Vector3>>();
  private edgeViews: EdgeView[] = [];
  private tokens: InstancedMesh;
  private bars: InstancedMesh;
  private ghost: Mesh;
  private selectRing: Mesh;
  private envMap: Texture;
  private selectRingKind: 'queue' | 'piece' | null = null;
  private connectLine: Line;
  private effects: Effects;
  private builtVersion = -1;
  private builtLevel: string | null = null;
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private hover: Vector3 | null = null;
  private drag: { id: string; startX: number; startZ: number; moved: boolean } | null = null;
  private dummy = new Object3D();
  private color = new Color();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  /** Cor de cada valor de `#hex`, convertida uma vez só. */
  private colors = new Map<string, Color>();
  private labelTimer = 0;
  private unsubSim: (() => void) | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private lastTime = performance.now();
  /**
   * Renderização sob demanda: a cena parada (montando a arquitetura, pausado, resultado) não é
   * redesenhada a cada frame. Qualquer entrada, mudança de estado ou animação marca `dirty`.
   */
  private dirty = true;
  private lastSignature = '';
  private invalidate = () => {
    this.dirty = true;
  };
  /** Enquadra a fase sozinha até o jogador mexer na câmera. */
  private autoFit = true;
  /** Peça sob o ponteiro: o rótulo dela mostra os detalhes. */
  private hoverId: string | null = null;

  constructor(
    private container: HTMLElement,
    private ctrl: Controller,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // só as peças fazem sombra e elas só mudam quando a arquitetura muda: o mapa de sombra é
    // refeito nessas horas, não a cada frame (era ~40% do frame com muitas peças)
    this.renderer.shadowMap.autoUpdate = false;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    this.scene.background = new Color(FLOOR_COLOR);
    this.scene.fog = new Fog(FLOOR_COLOR, 55, 95);

    this.camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.camera.position.copy(CAMERA_DIR).multiplyScalar(CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 3;
    this.controls.mouseButtons = { LEFT: null as unknown as MOUSE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN };
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', () => {
      this.autoFit = false;
    });

    // reflexos suaves de um "estúdio" gerado em código: dá volume às peças sem custo por frame
    const pmrem = new PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    setNodeEnvironment(this.envMap);
    pmrem.dispose();

    const hemi = new HemisphereLight('#ffffff', '#c6ccd4', 1.5);
    const sun = new DirectionalLight('#ffffff', 1.8);
    sun.position.set(8, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // sombra suave: no chão claro, sombra cheia pesa demais
    sun.shadow.intensity = 0.35;
    const s = sun.shadow.camera;
    s.left = -18;
    s.right = 18;
    s.top = 14;
    s.bottom = -14;
    // luz de contorno, por trás: separa o topo das peças do chão escuro
    const rim = new DirectionalLight('#ffffff', 0.5);
    rim.position.set(-10, 8, -14);
    this.scene.add(hemi, sun, rim);

    const floor = new Mesh(new PlaneGeometry(60, 44), new MeshLambertMaterial({ color: FLOOR_COLOR }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    const grid = new GridHelper(26, 26, '#e1e4e8', '#e1e4e8');
    grid.scale.set(1, 1, 18 / 26);
    grid.position.y = 0.001;
    this.scene.add(floor, grid, this.world);

    const tokenMat = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
    this.tokens = new InstancedMesh(new BoxGeometry(0.3, 0.3, 0.3), tokenMat, MAX_TOKENS);
    this.tokens.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tokens.count = 0;
    // Sombra de milhares de cubos em movimento custa ~30% do frame; as peças continuam com sombra.
    this.tokens.castShadow = false;
    this.tokens.frustumCulled = false;
    this.tokens.setColorAt(0, new Color());
    this.scene.add(this.tokens);

    this.bars = new InstancedMesh(new BoxGeometry(1, 0.05, 0.08), new MeshBasicMaterial(), MAX_BARS);
    this.bars.count = 0;
    this.bars.frustumCulled = false;
    this.bars.setColorAt(0, new Color());
    this.scene.add(this.bars);

    this.ghost = new Mesh(new CircleGeometry(0.9, 32), new MeshBasicMaterial({ color: '#29ad32', transparent: true, opacity: 0.3 }));
    this.ghost.rotation.x = -Math.PI / 2;
    this.ghost.position.y = 0.02;
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.selectRing = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: SELECT_COLOR, transparent: true, opacity: 0.9 }));
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.position.y = 0.03;
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);

    this.connectLine = new Line(new BufferGeometry(), new LineDashedMaterial({ color: '#0099ff', dashSize: 0.3, gapSize: 0.2 }));
    this.connectLine.visible = false;
    this.scene.add(this.connectLine);

    this.effects = new Effects(this.scene);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.unsubSim = ctrl.onSimChange((sim) => this.attachSim(sim));
    if (ctrl.sim) this.attachSim(ctrl.sim);
    requestAnimationFrame(this.loop);
  }

  /** Converte uma posição do chão (x, z) em coordenadas de tela (px, relativas à página). */
  project(x: number, z: number, y = 0.5): { x: number; y: number } {
    const v = new Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  dispose(): void {
    this.disposed = true;
    this.unsubSim?.();
    this.simUnsub?.();
    this.resizeObserver.disconnect();
    window.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.clearWorld();
    this.effects.clear();
    this.envMap.dispose();
    setNodeEnvironment(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  // ───────────── laço principal ─────────────

  private loop = (now: number) => {
    if (this.disposed) return;
    const dt = now - this.lastTime;
    this.lastTime = now;
    this.ctrl.frame(dt);
    this.sync();
    const running = this.ctrl.mode === 'run' && !this.ctrl.paused && this.ctrl.sim !== null;
    const signature = this.signature();
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.dirty = true;
    }
    if (running || this.effects.busy || this.ctrl.tool.type === 'connect') this.dirty = true;
    this.animate(now, dt, running);
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    }
    requestAnimationFrame(this.loop);
  };

  /** Estado do controller que muda o que aparece na cena. */
  private signature(): string {
    const c = this.ctrl;
    return `${c.graphVersion}|${c.level?.id}|${c.mode}|${c.paused}|${c.sim?.now ?? -1}|${c.selection?.id}|${c.tool.type}`;
  }

  private resize() {
    this.dirty = true;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const aspect = w / h;
    const viewH = Math.max(VIEW_HEIGHT_MIN, VIEW_WIDTH / aspect);
    this.camera.left = (-viewH * aspect) / 2;
    this.camera.right = (viewH * aspect) / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    this.camera.updateProjectionMatrix();
    if (this.autoFit) this.fitCamera();
  }

  /**
   * Centraliza e aproxima a câmera para a arquitetura da fase ocupar a tela. Projeta as caixas
   * das peças (com espaço para o rótulo em cima) com zoom 1 e ajusta zoom e alvo a partir disso.
   */
  private fitCamera() {
    const nodes = this.ctrl.level && this.ctrl.level.track !== 'sandbox' ? this.ctrl.graph.nodes : [];
    const cam = this.camera;
    this.controls.target.set(0, 0, 0);
    cam.position.copy(CAMERA_DIR).multiplyScalar(CAMERA_DISTANCE);
    cam.zoom = 1;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    if (nodes.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      const p = this.tmp;
      for (const n of nodes) {
        const { hx, hz } = FOOTPRINT[n.kind];
        // em cima, o rótulo costuma ser mais largo que a peça
        const lx = Math.max(hx, 2.6);
        for (const [dx, dy, dz] of [[-hx, 0, hz], [hx, 0, hz], [-lx, 3.4, -hz], [lx, 3.4, -hz]]) {
          p.set(n.x + dx, dy, n.z + dz).project(cam);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
      }
      const zoom = Math.min(FIT_ZOOM_MAX, Math.max(FIT_ZOOM_MIN, Math.min((2 * 0.9) / (maxX - minX), (2 * 0.9) / (maxY - minY))));
      // deslocamento do centro (em unidades do mundo com zoom 1), levado para o chão
      const right = ((maxX + minX) / 2) * ((cam.right - cam.left) / 2);
      const up = ((maxY + minY) / 2) * ((cam.top - cam.bottom) / 2);
      const upDir = this.tmp2.setFromMatrixColumn(cam.matrixWorld, 1);
      this.controls.target.set(right, 0, up / upDir.z);
      cam.position.copy(CAMERA_DIR).multiplyScalar(CAMERA_DISTANCE).add(this.controls.target);
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    this.controls.update();
    this.dirty = true;
  }

  private simUnsub: (() => void) | null = null;

  private attachSim(sim: Simulation | null) {
    this.simUnsub?.();
    this.simUnsub = null;
    this.effects.clear();
    if (sim) this.simUnsub = sim.onEvent((e) => this.onSimEvent(e));
  }

  // ───────────── construção da cena ─────────────

  private clearWorld() {
    for (const child of [...this.world.children]) {
      this.world.remove(child);
      child.traverse((o) => {
        // o CSS2DObject só remove o próprio elemento quando ele é removido diretamente
        if (o instanceof CSS2DObject) o.element.remove();
        const m = o as Mesh;
        m.geometry?.dispose();
        const material = m.material;
        if (Array.isArray(material)) material.forEach((x) => x.dispose());
        else material?.dispose();
      });
    }
    this.nodeViews.clear();
    this.curves.clear();
    this.edgeViews = [];
  }

  private sync() {
    const levelId = this.ctrl.level?.id ?? null;
    if (this.builtVersion === this.ctrl.graphVersion && this.builtLevel === levelId) return;
    const levelChanged = this.builtLevel !== levelId;
    this.builtVersion = this.ctrl.graphVersion;
    this.builtLevel = levelId;
    if (levelChanged) this.autoFit = true;
    this.clearWorld();
    const g = this.ctrl.graph;
    const dlqs = dlqIds(g);

    for (const n of g.nodes) {
      const view = buildNode(n, dlqs.has(n.id));
      this.nodeViews.set(n.id, view);
      this.world.add(view.group);
    }

    for (const e of g.edges) {
      const from = this.nodeViews.get(e.from)?.node;
      const to = this.nodeViews.get(e.to)?.node;
      if (!from || !to) continue;
      const curve = edgeCurve(from, to);
      const key = `${e.from}->${e.to}`;
      this.curves.set(key, curve);
      const filtered = !!e.filterPolicy && Object.keys(e.filterPolicy).length > 0;
      const tube = new Mesh(
        new TubeGeometry(curve, 48, 0.04, 6, false),
        new MeshStandardMaterial({ color: from.kind === 'topic' ? '#a783ff' : '#879596', roughness: 0.6 }),
      );
      tube.receiveShadow = true;
      this.world.add(tube);
      this.edgeViews.push({ key, curve, object: tube });
      if (filtered) {
        const div = document.createElement('div');
        div.className = 'edge-label';
        div.textContent = `filtro: ${describeFilterPolicy(e.filterPolicy)}`;
        const obj = new CSS2DObject(div);
        obj.position.copy(curve.getPoint(0.62)).add(new Vector3(0, 0.35, 0));
        this.world.add(obj);
      }
    }

    for (const e of g.edges) {
      const topic = e.dlq ? this.nodeViews.get(e.from)?.node : undefined;
      const dlq = e.dlq ? this.nodeViews.get(e.dlq)?.node : undefined;
      if (!topic || !dlq) continue;
      const curve = dlqCurve(topic, dlq);
      this.curves.set(`dlq:${topic.id}->${dlq.id}`, curve);
      const line = new Line(
        new BufferGeometry().setFromPoints(curve.getPoints(40)),
        new LineDashedMaterial({ color: NODE_COLORS.dlq, dashSize: 0.25, gapSize: 0.15 }),
      );
      line.computeLineDistances();
      this.world.add(line);
      const div = document.createElement('div');
      div.className = 'edge-label dlq';
      div.textContent = `☠ DLQ da assinatura → ${this.nodeViews.get(e.to)?.node.name ?? ''}`;
      const obj = new CSS2DObject(div);
      obj.position.copy(curve.getPoint(0.5)).add(new Vector3(-2.2, 0.1, 0));
      this.world.add(obj);
    }

    for (const n of g.nodes) {
      if (n.kind !== 'queue') continue;
      const dlqId = (n as GraphNode<'queue'>).config.dlq;
      const dlq = dlqId ? this.nodeViews.get(dlqId)?.node : undefined;
      if (!dlq) continue;
      const curve = dlqCurve(n, dlq);
      this.curves.set(`dlq:${n.id}->${dlq.id}`, curve);
      const geom = new BufferGeometry().setFromPoints(curve.getPoints(40));
      const line = new Line(geom, new LineDashedMaterial({ color: NODE_COLORS.dlq, dashSize: 0.25, gapSize: 0.15 }));
      line.computeLineDistances();
      this.world.add(line);
      const div = document.createElement('div');
      div.className = 'edge-label dlq';
      div.textContent = `☠ após ${(n as GraphNode<'queue'>).config.maxReceiveCount} recebimentos`;
      const obj = new CSS2DObject(div);
      // ancorado pela esquerda, logo depois da fila, para não ficar por baixo dela
      obj.center.set(0, 0.5);
      const mid = curve.getPoint(0.5);
      obj.position.set(n.x + QUEUE_LEN / 2 + 0.3, mid.y + 0.1, mid.z);
      this.world.add(obj);
    }
    this.labelTimer = 0;
    this.renderer.shadowMap.needsUpdate = true;
    if (levelChanged) this.fitCamera();
  }

  // ───────────── animação ─────────────

  private animate(now: number, dt: number, running: boolean) {
    const sim = this.ctrl.sim;
    const t = now / 1000;

    for (const v of this.nodeViews.values()) {
      for (const s of v.spinners) {
        const busy = running && (v.node.kind !== 'consumer' || this.consumerBusy(sim, v.node.id));
        if (busy) s.rotation.z += dt * 0.002 * (v.node.kind === 'topic' ? 0.6 : 2);
      }
      const isWorkerNode = v.node.kind === 'consumer' || v.node.kind === 'lambda';
      if (isWorkerNode && sim) {
        const c = sim.consumers.get(v.node.id);
        c?.workers.forEach((w, j) => {
          const pad = v.workerPads[j];
          if (!pad) return;
          const color =
            w.state === 'down'
              ? PAD.down
              : w.state === 'processing' || w.state === 'receiving'
                ? w.failReason === 'db'
                  ? PAD.down
                  : PAD.busy
                : w.state === 'polling'
                  ? PAD.polling
                  : j >= c.active
                    ? PAD.off
                    : PAD.idle;
          (pad.material as MeshStandardMaterial).color.copy(color);
        });
        const mat = v.body.material as MeshStandardMaterial;
        mat.color.copy(c?.down ? DOWN_BODY : this.hex(v.baseColor));
      } else if (isWorkerNode) {
        for (const pad of v.workerPads) (pad.material as MeshStandardMaterial).color.copy(v.node.kind === 'lambda' ? PAD.off : PAD.idle);
        (v.body.material as MeshStandardMaterial).color.copy(this.hex(v.baseColor));
      }
    }

    this.updateSelection(t);
    this.updateTokens(sim);
    this.effects.update(dt);

    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 120;
      for (const v of this.nodeViews.values()) {
        const html = describeNode(v.node, this.ctrl, sim, this.hoverId === v.node.id || this.ctrl.selection?.id === v.node.id);
        if (v.label.innerHTML !== html) v.label.innerHTML = html;
        v.label.classList.toggle('selected', this.ctrl.selection?.id === v.node.id);
      }
    }
  }

  private consumerBusy(sim: Simulation | null, id: string): boolean {
    const c = sim?.consumers.get(id);
    return !!c && c.workers.some((w) => w.state === 'processing');
  }

  private updateSelection(t: number) {
    const sel = this.ctrl.selection ? this.nodeViews.get(this.ctrl.selection.id) : undefined;
    if (sel) {
      this.selectRing.visible = true;
      this.selectRing.position.set(sel.group.position.x, 0.03, sel.group.position.z);
      const kind = sel.node.kind === 'queue' ? 'queue' : 'piece';
      if (this.selectRingKind !== kind) {
        this.selectRingKind = kind;
        this.selectRing.geometry.dispose();
        this.selectRing.geometry = kind === 'queue' ? frameGeometry(QUEUE_LEN + 0.7, QUEUE_DEPTH + 0.7) : frameGeometry(2.4 * NODE_SCALE * 0.85, 2.4 * NODE_SCALE * 0.85);
      }
      const connecting = this.ctrl.tool.type === 'connect';
      (this.selectRing.material as MeshBasicMaterial).color.set(connecting ? '#0099ff' : SELECT_COLOR);
      (this.selectRing.material as MeshBasicMaterial).opacity = connecting ? 0.6 + 0.3 * Math.sin(t * 6) : 0.85;
    } else this.selectRing.visible = false;

    const tool = this.ctrl.tool;
    if (tool.type === 'connect' && this.hover) {
      const from = this.nodeViews.get(tool.from);
      if (from) {
        const a = from.group.position.clone().setY(0.5);
        this.connectLine.geometry.setFromPoints([a, this.hover.clone().setY(0.5)]);
        this.connectLine.computeLineDistances();
        this.connectLine.visible = true;
      }
    } else this.connectLine.visible = false;

    if (tool.type === 'place' && this.hover) {
      const x = Math.round(this.hover.x);
      const z = Math.round(this.hover.z);
      this.ghost.visible = true;
      this.ghost.position.set(x, 0.02, z);
      if (tool.item.kind === 'queue') this.ghost.scale.set((QUEUE_LEN + 0.3) / 1.8, (QUEUE_DEPTH + 0.3) / 1.8, 1);
      else this.ghost.scale.setScalar(NODE_SCALE);
      (this.ghost.material as MeshBasicMaterial).color.set(this.ctrl.canPlaceAt(tool.item.kind, x, z) ? '#29ad32' : '#d91515');
    } else this.ghost.visible = false;
  }

  private hex(value: string): Color {
    let c = this.colors.get(value);
    if (!c) this.colors.set(value, (c = new Color(value)));
    return c;
  }

  private tokenColor(token: Token): Color {
    if (token.poison) return this.hex(POISON_COLOR);
    const g = this.ctrl.level?.highlightGroups ? groupColor(token.groupId) : null;
    return this.hex(g ?? typeInfo(token.type).color);
  }

  private updateTokens(sim: Simulation | null) {
    let i = 0;
    let b = 0;
    if (!sim) {
      this.tokens.count = 0;
      this.bars.count = 0;
      return;
    }
    const now = sim.now;
    const d = this.dummy;
    const put = (pos: Vector3, token: Token, scale = 1, spin = 0, dim = 0) => {
      if (i >= MAX_TOKENS) return;
      d.position.copy(pos);
      d.rotation.set(0, spin, 0);
      d.scale.setScalar(scale);
      d.updateMatrix();
      this.tokens.setMatrixAt(i, d.matrix);
      const c = dim > 0 ? this.color.copy(this.tokenColor(token)).lerp(DIM_COLOR, dim) : this.tokenColor(token);
      this.tokens.setColorAt(i, c);
      i++;
    };

    // em trânsito
    for (const tr of sim.transits()) {
      const key = tr.kind === 'dlq' ? `dlq:${tr.from}->${tr.to}` : `${tr.from}->${tr.to}`;
      const curve = this.curves.get(key);
      const p = Math.min(1, Math.max(0, (now - tr.start) / (tr.end - tr.start)));
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      if (curve) curve.getPoint(e, this.tmp);
      else {
        const a = this.nodeViews.get(tr.from)?.group.position;
        const z = this.nodeViews.get(tr.to)?.group.position;
        if (!a || !z) continue;
        this.tmp.lerpVectors(a, z, e).setY(0.5);
      }
      this.tmp.y += 0.12;
      put(this.tmp, tr.token, tr.kind === 'receive' ? 0.85 : 1, e * 3);
    }

    // dentro das filas (visíveis e atrasadas; as em voo aparecem no consumidor)
    for (const q of sim.queues.values()) {
      const view = this.nodeViews.get(q.id);
      if (!view) continue;
      let slot = 0;
      q.forEachWaiting((m) => {
        if (!queueSlot(view.node, slot++, this.tmp)) return false;
        put(this.tmp, m.token, 1, 0, m.state === 'delayed' ? 0.6 : 0);
      });
    }

    // nos consumidores
    for (const c of sim.consumers.values()) {
      const view = this.nodeViews.get(c.node.id);
      if (!view) continue;
      c.workers.forEach((w, j) => {
        if (w.state !== 'processing' || !w.batch.length) return;
        if (c.lambda) lambdaSlot(view.node, j, c.workers.length, this.tmp);
        else workerSlot(view.node, j, c.workers.length, this.tmp);
        const current = w.batch[w.index];
        if (current) put(this.tmp, current.token, 1.05, now * 0.006);
        for (let k = w.index + 1; k < w.batch.length && k < w.index + 6; k++) {
          const pos = this.tmp2.copy(this.tmp);
          pos.y += 0.2 + (k - w.index) * 0.2;
          put(pos, w.batch[k].token, 0.6);
        }
        if (b < MAX_BARS) {
          const prog = Math.min(1, (now - w.start) / Math.max(1, w.until - w.start));
          d.position.set(this.tmp.x - 0.2 + prog * 0.2, this.tmp.y + 0.35, this.tmp.z + 0.3);
          d.rotation.set(0, 0, 0);
          d.scale.set(Math.max(0.01, prog * 0.4), 1, 1);
          d.updateMatrix();
          this.bars.setMatrixAt(b, d.matrix);
          this.bars.setColorAt(b, BAR_COLOR);
          b++;
        }
      });
    }

    this.tokens.count = i;
    this.tokens.instanceMatrix.needsUpdate = true;
    if (this.tokens.instanceColor) this.tokens.instanceColor.needsUpdate = true;
    this.bars.count = b;
    this.bars.instanceMatrix.needsUpdate = true;
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
  }

  private onSimEvent(e: SimEvent) {
    if (!this.ctrl.live) return;
    const at = (id: string) => this.nodeViews.get(id)?.group.position;
    switch (e.type) {
      case 'processed':
        this.effects.spawn(at(e.node), '✓', 'ok', e.node + 'ok');
        break;
      case 'dropped':
        this.effects.spawn(at(e.node), '✗ perdida (ocupado)', 'bad');
        break;
      case 'expired':
        this.effects.spawn(at(e.node), '✗ expirou (retenção)', 'bad');
        break;
      case 'send_error':
        this.effects.spawn(at(e.target || e.node) ?? at(e.node), `✗ ${e.reason}`, 'bad', 'send' + e.node);
        break;
      case 'duplicate_processed':
        this.effects.spawn(at(e.node), '⚠ processado 2×', 'warn');
        break;
      case 'duplicate_ignored':
        this.effects.spawn(at(e.node), '≡ duplicata ignorada', 'info');
        break;
      case 'out_of_order':
        this.effects.spawn(at(e.node), `↯ fora de ordem (#${e.token.seq})`, 'warn');
        break;
      case 'wrong_delivery':
        this.effects.spawn(at(e.node), `✗ não é ${typeInfo(e.token.type).label.toLowerCase()} pra mim`, 'bad');
        break;
      case 'moved_to_dlq':
        this.effects.spawn(at(e.node), '☠ → DLQ', 'dlq');
        break;
      case 'process_failed':
        this.effects.spawn(at(e.node), e.reason === 'poison' ? '✗ falhou (venenosa)' : e.reason === 'outage' ? '✗ caiu' : '✗ erro', 'bad', e.node + 'fail');
        break;
      case 'visibility_expired':
        this.effects.spawn(at(e.node), '◷ visível de novo', 'info', e.node + 'vis');
        break;
      case 'delete_stale':
        this.effects.spawn(at(e.node), '✗ receipt handle velho', 'warn');
        break;
      case 'deduplicated':
        this.effects.spawn(at(e.node), '≡ deduplicada', 'info', e.node + 'dedup');
        break;
      case 'sqs_duplicate':
        this.effects.spawn(at(e.node), '+1 cópia (at-least-once)', 'info');
        break;
      case 'empty_receive':
        this.effects.spawn(at(e.node), '∅ vazio ($)', 'muted', e.node + 'empty', 350);
        break;
      case 'outage_start':
        this.effects.spawn(at(e.node), '■ fora do ar', 'bad');
        break;
      case 'outage_end':
        this.effects.spawn(at(e.node), '▶ voltou', 'ok');
        break;
      case 'invocation_failed':
        this.effects.spawn(
          at(e.node),
          e.reason === 'db' ? '✗ banco recusou' : e.reason === 'timeout' ? '✗ timeout: lote volta' : `✗ lote de ${e.size} volta`,
          'bad',
          e.node + 'inv',
        );
        break;
      case 'scaled':
        this.effects.spawn(at(e.node), `concorrência ${e.concurrency}`, 'info', e.node + 'scale', 600);
        break;
      case 'visibility_extended':
        this.effects.spawn(at(e.node), '◷ +visibilidade', 'muted', e.node + 'hb', 600);
        break;
      case 'sns_retry':
        this.effects.spawn(at(e.target), `↻ SNS tenta de novo (${e.attempt})`, 'warn', e.target + 'retry', 300);
        break;
      case 'sns_dlq':
        this.effects.spawn(at(e.target), '☠ → DLQ da assinatura', 'dlq');
        break;
      case 's3_put':
        this.effects.spawn(at(e.node), '⇪ anexo no S3', 'info');
        break;
    }
  }

  // ───────────── entrada ─────────────

  private updatePointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private pickNode(): string | null {
    const objs: Object3D[] = [];
    for (const v of this.nodeViews.values()) objs.push(...v.pickables);
    const hit = this.raycaster.intersectObjects(objs, false)[0];
    return (hit?.object.userData.nodeId as string | undefined) ?? null;
  }

  private groundPoint(): Vector3 | null {
    return this.raycaster.ray.intersectPlane(this.ground, new Vector3());
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dirty = true;
    if (e.button !== 0) return;
    this.updatePointer(e);
    const id = this.pickNode();
    const tool = this.ctrl.tool;
    if (id) {
      if (tool.type === 'place') {
        this.ctrl.setTool({ type: 'select' });
        this.ctrl.select({ kind: 'node', id });
        return;
      }
      const wasConnect = tool.type === 'connect';
      this.ctrl.clickNode(id);
      const node = this.nodeViews.get(id)?.node;
      if (!wasConnect && node && !node.locked && this.ctrl.canEdit) {
        this.drag = { id, startX: node.x, startZ: node.z, moved: false };
        this.renderer.domElement.setPointerCapture(e.pointerId);
      }
      return;
    }
    const p = this.groundPoint();
    if (tool.type === 'place' && p) {
      this.ctrl.placeAt(Math.round(p.x), Math.round(p.z));
      return;
    }
    if (tool.type === 'connect') {
      this.ctrl.setTool({ type: 'select' });
      this.ctrl.notify();
      return;
    }
    this.ctrl.select(null);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.dirty = true;
    this.updatePointer(e);
    this.hover = this.groundPoint();
    const el = this.renderer.domElement;
    if (this.drag && this.hover) {
      const view = this.nodeViews.get(this.drag.id);
      const x = Math.round(this.hover.x);
      const z = Math.round(this.hover.z);
      if (view && (x !== view.group.position.x || z !== view.group.position.z) && this.ctrl.canPlaceAt(view.node.kind, x, z, this.drag.id)) {
        view.group.position.set(x, 0, z);
        this.drag.moved = true;
        this.renderer.shadowMap.needsUpdate = true;
      }
      el.style.cursor = 'grabbing';
      return;
    }
    const tool = this.ctrl.tool;
    const id = this.pickNode();
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.labelTimer = 0;
    }
    el.style.cursor = tool.type === 'place' ? 'copy' : tool.type === 'connect' ? (id ? 'alias' : 'crosshair') : id ? 'pointer' : 'default';
  };

  private onPointerUp = () => {
    this.dirty = true;
    if (!this.drag) return;
    const { id, moved } = this.drag;
    this.drag = null;
    const view = this.nodeViews.get(id);
    if (moved && view) this.ctrl.moveNode(id, view.group.position.x, view.group.position.z);
  };
}
