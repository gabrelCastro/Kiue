import {
  NeutralToneMapping,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Fog,
  Group,
  InstancedMesh,
  Line,
  LineDashedMaterial,
  MOUSE,
  TOUCH,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
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
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { groupColor, POISON_COLOR, typeInfo } from '../game/catalog';
import { BUILD_LIMIT, type Controller } from '../game/controller';
import { FOOTPRINT } from '../game/footprint';
import { dlqIds } from '../game/graph';
import { describeFilterPolicy } from '../sim/filter';
import type { Simulation } from '../sim/engine';
import type { GraphNode, SimEvent, Token } from '../sim/types';
import { Effects } from './effects';
import { dlqCurve, edgeCurve, lambdaSlot, NODE_SCALE, QUEUE_DEPTH, QUEUE_LEN, queueSlot, TOKEN_H, workerSlot } from './layout';
import { backdropTexture, beltTexture, flowTexture, GROUND_TILE, groundTexture } from './textures';
import { bakedMaterial, bakeGeometry, bakeTree } from './bake';
import { buildNode, NODE_COLORS, type NodeView } from './nodes';
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
/** Cor da névoa: o chão infinito some suavemente nela, ao longe. */
const FOG_COLOR = '#eef0f2';
/** Tamanho do plano do chão; ele segue a câmera, então só precisa cobrir a tela no zoom mínimo. */
const GROUND_SIZE = 400;
/** Raio dos canos entre as peças. */
const PIPE_RADIUS = 0.085;
/** Contorno de seleção: preto, como o resto da interface. */
const SELECT_COLOR = '#111111';
const VIEW_WIDTH = 23;
const VIEW_HEIGHT_MIN = 13;
/**
 * Direção da câmera (ortográfica), em vista de diorama: ~51° de elevação e girada ~22° para a
 * direita, mostrando a frente e a lateral das peças. Mais baixa, as filas empilhadas se cobrem.
 */
const CAMERA_DIR = new Vector3(0.4, 1.35, 1).normalize();
const CAMERA_DISTANCE = 40;
/** Limites do zoom automático ao abrir uma fase: perto o bastante para ver as peças, sem cortar a área de montagem. */
const FIT_ZOOM_MIN = 0.8;
const FIT_ZOOM_MAX = 1.8;

const FLOW_PIPE = () => flowTexture('#d4d9de', '#9aa3ab');
const FLOW_SNS = () => flowTexture('#ddd0ff', '#9b6bff');

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
  private fitting = false;
  /** Peça sob o ponteiro: o rótulo dela mostra os detalhes. */
  private hoverId: string | null = null;
  private touchDevice = false;
  private ground3d: Mesh;
  /** Espaço segurado: o botão esquerdo passa a mover a câmera (como no Figma e no Photoshop). */
  private spaceHeld = false;
  private panning = false;
  /** Peças que acabaram de entrar na cena (id → início da animação de entrada). */
  private pops = new Map<string, number>();
  private knownIds = new Set<string>();
  /** Rótulos de conexão (filtro, DLQ): entram na arrumação de rótulos com a menor prioridade. */
  private edgeLabels: HTMLElement[] = [];
  private pixelRatio = 1;
  /** 0 = qualidade cheia; sobe quando o aparelho não acompanha (ver `adaptQuality`). */
  private quality = 0;
  private slowFrames = 0;
  /** Toque em andamento: decide entre toque simples, arrastar peça (toque longo) e mover a câmera. */
  private touch: { pointerId: number; id: string | null; x: number; y: number; t: number; timer: number; moved: boolean; multi: boolean } | null = null;
  private activeTouches = new Set<number>();

  constructor(
    private container: HTMLElement,
    private ctrl: Controller,
  ) {
    // celular: tela densa e GPU modesta; 1,5× e sombra menor mantêm o quadro fluido
    this.touchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.renderer = new WebGLRenderer({ antialias: !this.touchDevice || window.devicePixelRatio < 2 });
    this.pixelRatio = Math.min(window.devicePixelRatio, this.touchDevice ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    // sem luzes nem sombras em tempo real: a iluminação vem assada nos vértices (bake.ts) e as
    // sombras são manchas suaves sob as peças. O quadro só desenha cor, o mais barato possível.
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    this.scene.background = backdropTexture();
    this.scene.fog = new Fog(FOG_COLOR, 60, 120);

    this.camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.camera.position.copy(CAMERA_DIR).multiplyScalar(CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 3;
    this.controls.mouseButtons = { LEFT: null as unknown as MOUSE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN };
    // toque: um dedo move a câmera, dois dedos aproximam e movem
    this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };
    // só movimento de verdade (pan/zoom) tira o enquadramento automático; um toque simples não
    this.controls.addEventListener('change', () => {
      if (!this.fitting) this.autoFit = false;
      this.clampPan();
      this.invalidate();
    });

    // chão infinito: um plano grande com a grade em textura, que anda junto com a câmera (de
    // ladrilho em ladrilho, para a grade não "escorregar") e some na névoa ao longe
    const groundTex = groundTexture();
    groundTex.repeat.set(GROUND_SIZE / GROUND_TILE, GROUND_SIZE / GROUND_TILE);
    this.ground3d = new Mesh(new PlaneGeometry(GROUND_SIZE, GROUND_SIZE), new MeshBasicMaterial({ map: groundTex, toneMapped: false }));
    this.ground3d.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground3d, this.world);

    // mensagens são pacotinhos (caixa simples: milhares ao mesmo tempo, cada triângulo conta)
    // a luz do pacote é assada uma vez na geometria (o topo claro, as laterais mais escuras); a cor
    // de cada mensagem vem por instância e multiplica essa luz
    const tokenGeo = new BoxGeometry(0.3, TOKEN_H, 0.3);
    const lift = new Object3D();
    lift.position.y = 0.6; // altura típica de uma mensagem: fora da oclusão do chão
    lift.updateMatrixWorld();
    bakeGeometry(tokenGeo, lift.matrixWorld);
    this.tokens = new InstancedMesh(tokenGeo, new MeshBasicMaterial({ vertexColors: true }), MAX_TOKENS);
    this.tokens.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tokens.count = 0;
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
    window.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseSpace);

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
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseSpace);
    if (this.touch) window.clearTimeout(this.touch.timer);
    this.controls.dispose();
    this.clearWorld();
    this.effects.clear();
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
    if (running || this.effects.busy || this.pops.size > 0 || this.ctrl.tool.type === 'connect') this.dirty = true;
    this.animate(now, dt, running);
    if (running) this.adaptQuality(dt);
    if (this.dirty) {
      this.dirty = false;
      this.followGround();
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    }
    requestAnimationFrame(this.loop);
  };

  /**
   * Aparelho que não acompanha: com a simulação rodando, ~2 s seguidos de quadros acima de 40 ms
   * baixam a resolução (uma vez só). Só desce; nunca volta sozinho (evita oscilar).
   */
  private adaptQuality(dt: number) {
    if (this.quality >= 1 || dt > 1000) return;
    this.slowFrames = dt > 40 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames < 50) return;
    this.slowFrames = 0;
    this.quality++;
    this.pixelRatio = Math.max(1, this.pixelRatio * 0.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
    this.dirty = true;
  }

  /** Leva o chão para debaixo da câmera, sempre num múltiplo do ladrilho (a grade fica parada). */
  private followGround() {
    const t = this.controls.target;
    this.ground3d.position.set(Math.round(t.x / GROUND_TILE) * GROUND_TILE, 0, Math.round(t.z / GROUND_TILE) * GROUND_TILE);
  }

  /** O chão é infinito, mas a câmera não passa muito da área de montagem: ninguém se perde no vazio. */
  private clampPan() {
    const t = this.controls.target;
    const max = BUILD_LIMIT + 10;
    const dx = Math.max(-max, Math.min(max, t.x)) - t.x;
    const dz = Math.max(-max, Math.min(max, t.z)) - t.z;
    if (dx === 0 && dz === 0) return;
    t.x += dx;
    t.z += dz;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
  }

  /** Estado do controller que muda o que aparece na cena. */
  private signature(): string {
    const c = this.ctrl;
    return `${c.graphVersion}|${c.level?.id}|${c.mode}|${c.paused}|${c.sim?.now ?? -1}|${c.selection?.id}|${c.tool.type}|${c.pendingPlace?.x},${c.pendingPlace?.z}`;
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
      // desloca o alvo no chão: "direita" da tela é horizontal; "cima" da tela, projetado no chão,
      // anda `up / (G·U)` ao longo da direção G (o cima da tela deitado no chão)
      const rightDir = this.tmp2.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
      const upDir = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const ground = upDir.clone().setY(0).normalize();
      this.controls.target.copy(rightDir.multiplyScalar(right)).addScaledVector(ground, up / ground.dot(upDir));
      cam.position.copy(CAMERA_DIR).multiplyScalar(CAMERA_DISTANCE).add(this.controls.target);
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    this.fitting = true;
    this.controls.update();
    this.fitting = false;
    this.dirty = true;
  }

  /** Volta ao enquadramento automático da fase (botão "recentrar" do toque). */
  recenter(): void {
    this.autoFit = true;
    this.fitCamera();
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
    this.edgeLabels = [];
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

    const now = performance.now();
    for (const n of g.nodes) {
      if (!levelChanged && !this.knownIds.has(n.id)) this.pops.set(n.id, now);
    }
    this.knownIds = new Set(g.nodes.map((n) => n.id));
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
      const tubeGeo = new TubeGeometry(curve, 48, PIPE_RADIUS, 10, false);
      // u vai de 0 a 1 ao longo do cano: escala pelo comprimento para as setas terem tamanho fixo
      const uv = tubeGeo.getAttribute('uv');
      const repeat = curve.getLength() * 1.4;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * repeat);
      const tubeMat = bakedMaterial('#ffffff');
      tubeMat.map = from.kind === 'topic' ? FLOW_SNS() : FLOW_PIPE();
      const tube = new Mesh(tubeGeo, tubeMat);
      bakeTree(tube);
      this.world.add(tube);
      this.edgeViews.push({ key, curve, object: tube });
      if (filtered) {
        const div = document.createElement('div');
        div.className = 'edge-label';
        this.edgeLabels.push(div);
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
      this.edgeLabels.push(div);
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
      this.edgeLabels.push(div);
      div.textContent = `☠ após ${(n as GraphNode<'queue'>).config.maxReceiveCount} recebimentos`;
      const obj = new CSS2DObject(div);
      // ancorado pela esquerda, logo depois da fila, para não ficar por baixo dela
      obj.center.set(0, 0.5);
      const mid = curve.getPoint(0.5);
      obj.position.set(n.x + QUEUE_LEN / 2 + 0.3, mid.y + 0.1, mid.z);
      this.world.add(obj);
    }
    this.labelTimer = 0;
    if (levelChanged) this.fitCamera();
  }

  // ───────────── animação ─────────────

  private animate(now: number, dt: number, running: boolean) {
    const sim = this.ctrl.sim;
    const t = now / 1000;

    // canos e esteiras andam com a simulação (na velocidade do jogo, com teto para não borrar)
    if (running) {
      const step = dt * 0.001 * Math.min(4, this.ctrl.speed);
      FLOW_PIPE().offset.x -= step * 1.2;
      FLOW_SNS().offset.x -= step * 1.2;
      beltTexture().offset.x -= step * 0.9;
    }

    // peça recém-colocada "salta" para o lugar
    for (const [id, start] of this.pops) {
      const view = this.nodeViews.get(id);
      const p = Math.min(1, (now - start) / 260);
      const c1 = 1.70158;
      const ease = 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
      view?.group.scale.setScalar(0.6 + 0.4 * ease);
      if (p >= 1) this.pops.delete(id);
    }

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
          (pad.material as MeshBasicMaterial).color.copy(color);
        });
        const mat = v.body.material as MeshBasicMaterial;
        mat.color.copy(c?.down ? DOWN_BODY : this.hex(v.baseColor));
      } else if (isWorkerNode) {
        for (const pad of v.workerPads) (pad.material as MeshBasicMaterial).color.copy(v.node.kind === 'lambda' ? PAD.off : PAD.idle);
        (v.body.material as MeshBasicMaterial).color.copy(this.hex(v.baseColor));
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
      this.declutter();
    }
  }

  /**
   * Arruma os rótulos que se sobrepõem na tela. Do mais importante (selecionado, sob o ponteiro)
   * e do mais à frente (mais baixo na tela) para trás: quem colide com um já posto vira só o nome
   * e, se ainda colidir, fica translúcido. Passar o ponteiro ou selecionar traz o rótulo inteiro.
   */
  private declutter() {
    const selected = this.ctrl.selection?.id;
    const items: { el: HTMLElement; prio: number; node: boolean }[] = [];
    for (const v of this.nodeViews.values()) {
      v.label.classList.remove('compact', 'faded');
      items.push({ el: v.label, prio: v.node.id === selected ? 3 : v.node.id === this.hoverId ? 2 : 1, node: true });
    }
    for (const el of this.edgeLabels) {
      el.classList.remove('faded');
      items.push({ el, prio: 0, node: false });
    }
    const rects = new Map(items.map((it) => [it.el, it.el.getBoundingClientRect()]));
    items.sort((a, b) => b.prio - a.prio || rects.get(b.el)!.bottom - rects.get(a.el)!.bottom);
    const placed: DOMRect[] = [];
    const hits = (r: DOMRect) => placed.some((p) => r.left < p.right + 2 && r.right > p.left - 2 && r.top < p.bottom + 2 && r.bottom > p.top - 2);
    for (const it of items) {
      let r = rects.get(it.el)!;
      if (r.width === 0) continue;
      if (it.prio < 2 && hits(r)) {
        if (it.node) {
          it.el.classList.add('compact');
          r = it.el.getBoundingClientRect();
        }
        if (hits(r)) {
          it.el.classList.add('faded');
          continue;
        }
      }
      placed.push(r);
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

    const spot = this.ctrl.pendingPlace ?? (this.hover ? { x: Math.round(this.hover.x), z: Math.round(this.hover.z) } : null);
    if (tool.type === 'place' && spot) {
      const { x, z } = spot;
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
      // o pacote anda por cima do cano
      this.tmp.y += PIPE_RADIUS + TOKEN_H / 2;
      put(this.tmp, tr.token, tr.kind === 'receive' ? 0.85 : 1);
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

  /** Peça mais próxima do ponto no chão: o dedo é mais largo que o ponteiro do mouse. */
  private pickNodeNear(): string | null {
    const hit = this.pickNode();
    if (hit) return hit;
    const p = this.groundPoint();
    if (!p) return null;
    let best: string | null = null;
    let bestD = Infinity;
    for (const v of this.nodeViews.values()) {
      const { hx, hz } = FOOTPRINT[v.node.kind];
      const d = Math.hypot(v.group.position.x - p.x, v.group.position.z - p.z);
      if (d < Math.max(hx, hz) + 0.7 && d < bestD) {
        best = v.node.id;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Toque: um dedo move a câmera (OrbitControls), dois dedos aproximam; toque simples faz o que o
   * clique faz; toque longo numa peça (sem mexer o dedo) pega a peça para arrastar.
   */
  private onTouchDown(e: PointerEvent) {
    this.activeTouches.add(e.pointerId);
    this.dirty = true;
    if (this.activeTouches.size > 1) {
      // segundo dedo: é pinça, não toque nem arrasto
      if (this.touch) {
        window.clearTimeout(this.touch.timer);
        this.touch.multi = true;
      }
      if (this.drag) {
        const view = this.nodeViews.get(this.drag.id);
        view?.group.position.set(this.drag.startX, 0, this.drag.startZ);
        this.drag = null;
        this.controls.enabled = true;
      }
      return;
    }
    this.updatePointer(e);
    const id = this.pickNodeNear();
    const t = { pointerId: e.pointerId, id, x: e.clientX, y: e.clientY, t: performance.now(), timer: 0, moved: false, multi: false };
    const node = id ? this.nodeViews.get(id)?.node : undefined;
    const movable = node && !node.locked && this.ctrl.canEdit && this.ctrl.tool.type === 'select';
    if (movable && this.ctrl.selection?.id === node.id) {
      // peça já selecionada: arrastar move direto, sem precisar segurar
      this.controls.enabled = false;
      this.drag = { id: node.id, startX: node.x, startZ: node.z, moved: false };
    } else if (movable) {
      t.timer = window.setTimeout(() => {
        if (this.touch !== t || t.moved || t.multi) return;
        this.controls.enabled = false;
        this.drag = { id: node.id, startX: node.x, startZ: node.z, moved: false };
        this.ctrl.select({ kind: 'node', id: node.id });
        navigator.vibrate?.(15);
      }, 280);
    }
    this.touch = t;
  }

  private onTouchMove(e: PointerEvent) {
    const t = this.touch;
    if (!t || t.pointerId !== e.pointerId) return;
    if (!t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) {
      t.moved = true;
      if (!this.drag) window.clearTimeout(t.timer);
    }
    if (this.drag) {
      this.updatePointer(e);
      this.hover = this.groundPoint();
      this.dragTo(this.hover);
    }
  }

  private onTouchEnd(e: PointerEvent) {
    this.activeTouches.delete(e.pointerId);
    const t = this.touch;
    if (!t || t.pointerId !== e.pointerId) return;
    window.clearTimeout(t.timer);
    this.touch = null;
    this.controls.enabled = true;
    this.hover = null;
    const tap = !t.moved && !t.multi && !this.drag?.moved && e.type === 'pointerup' && performance.now() - t.t < 600;
    if (tap) this.tapAt(t.id, e);
  }

  /** Toque simples: a mesma lógica do clique, com o lugar da peça pendente de confirmação. */
  private tapAt(id: string | null, e: PointerEvent) {
    const tool = this.ctrl.tool;
    if (tool.type === 'place' && !id) {
      this.updatePointer(e);
      const p = this.groundPoint();
      if (p) this.ctrl.setPendingPlace({ x: Math.round(p.x), z: Math.round(p.z) });
      return;
    }
    if (id) {
      if (tool.type === 'place') {
        this.ctrl.setTool({ type: 'select' });
        this.ctrl.select({ kind: 'node', id });
      } else this.ctrl.clickNode(id);
      return;
    }
    if (tool.type === 'connect') {
      this.ctrl.setTool({ type: 'select' });
      this.ctrl.notify();
      return;
    }
    this.ctrl.select(null);
  }

  private dragTo(point: Vector3 | null) {
    if (!this.drag || !point) return;
    const view = this.nodeViews.get(this.drag.id);
    const x = Math.round(point.x);
    const z = Math.round(point.z);
    if (view && (x !== view.group.position.x || z !== view.group.position.z) && this.ctrl.canPlaceAt(view.node.kind, x, z, this.drag.id)) {
      view.group.position.set(x, 0, z);
      this.drag.moved = true;
      }
  }

  // ───────────── Espaço + arrastar: mover a câmera ─────────────

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== ' ' || e.repeat || this.spaceHeld) return;
    if ((e.target as HTMLElement).closest('input, select, textarea, button')) return;
    this.spaceHeld = true;
    // o OrbitControls lê os botões a cada clique: trocar aqui basta para o próximo arrasto
    this.controls.mouseButtons.LEFT = MOUSE.PAN;
    if (!this.drag) this.renderer.domElement.style.cursor = 'grab';
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') this.releaseSpace();
  };

  /** Solta o modo de mover (também ao perder o foco: o keyup pode nunca chegar). */
  private releaseSpace = () => {
    if (!this.spaceHeld) return;
    this.spaceHeld = false;
    this.controls.mouseButtons.LEFT = null as unknown as MOUSE;
    if (!this.panning) this.renderer.domElement.style.cursor = 'default';
  };

  private onPointerDown = (e: PointerEvent) => {
    this.dirty = true;
    if (e.pointerType === 'touch') {
      this.onTouchDown(e);
      return;
    }
    if (e.button !== 0) return;
    if (this.spaceHeld) {
      // quem move a câmera é o OrbitControls; aqui só não selecionamos nem pegamos a peça
      this.panning = true;
      this.renderer.domElement.style.cursor = 'grabbing';
      return;
    }
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
    if (e.pointerType === 'touch') {
      this.onTouchMove(e);
      return;
    }
    if (this.spaceHeld || this.panning) return;
    this.updatePointer(e);
    this.hover = this.groundPoint();
    const el = this.renderer.domElement;
    if (this.drag && this.hover) {
      this.dragTo(this.hover);
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

  private onPointerUp = (e: PointerEvent) => {
    this.dirty = true;
    if (e.pointerType === 'touch') this.onTouchEnd(e);
    if (this.panning) {
      this.panning = false;
      this.renderer.domElement.style.cursor = this.spaceHeld ? 'grab' : 'default';
    }
    if (!this.drag) return;
    const { id, moved } = this.drag;
    this.drag = null;
    const view = this.nodeViews.get(id);
    if (moved && view) this.ctrl.moveNode(id, view.group.position.x, view.group.position.z);
  };
}
