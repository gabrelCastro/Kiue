import {
  ACESFilmicToneMapping,
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
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  Plane,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
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
import type { Controller } from '../game/controller';
import { dlqIds } from '../game/graph';
import { describeFilterPolicy } from '../sim/filter';
import type { Simulation } from '../sim/engine';
import type { GraphNode, SimEvent, Token } from '../sim/types';
import { Effects } from './effects';
import { dlqCurve, edgeCurve, lambdaSlot, queueSlot, workerSlot } from './layout';
import { buildNode, NODE_COLORS, type NodeView } from './nodes';
import { describeNode } from './labels';

const MAX_TOKENS = 4000;
const MAX_BARS = 300;
const VIEW_WIDTH = 23;
const VIEW_HEIGHT_MIN = 13;

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
  private labelTimer = 0;
  private unsubSim: (() => void) | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private lastTime = performance.now();

  constructor(
    private container: HTMLElement,
    private ctrl: Controller,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    this.scene.background = new Color('#0b1222');
    this.scene.fog = new Fog('#0b1222', 40, 70);

    this.camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.camera.position.set(0, 24, 17);
    this.camera.lookAt(0, 0, 0.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 3;
    this.controls.mouseButtons = { LEFT: null as unknown as MOUSE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN };

    const hemi = new HemisphereLight('#dbeafe', '#1e293b', 1.4);
    const sun = new DirectionalLight('#ffffff', 2.2);
    sun.position.set(8, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -18;
    s.right = 18;
    s.top = 14;
    s.bottom = -14;
    this.scene.add(hemi, sun);

    const floor = new Mesh(new PlaneGeometry(60, 44), new MeshStandardMaterial({ color: '#111a2e', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    const grid = new GridHelper(26, 26, '#1f2b46', '#17213a');
    grid.scale.set(1, 1, 18 / 26);
    grid.position.y = 0.001;
    this.scene.add(floor, grid, this.world);

    const tokenMat = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
    this.tokens = new InstancedMesh(new BoxGeometry(0.26, 0.26, 0.26), tokenMat, MAX_TOKENS);
    this.tokens.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tokens.count = 0;
    this.tokens.castShadow = true;
    this.tokens.frustumCulled = false;
    this.tokens.setColorAt(0, new Color());
    this.scene.add(this.tokens);

    this.bars = new InstancedMesh(new BoxGeometry(1, 0.05, 0.08), new MeshBasicMaterial(), MAX_BARS);
    this.bars.count = 0;
    this.bars.frustumCulled = false;
    this.bars.setColorAt(0, new Color());
    this.scene.add(this.bars);

    this.ghost = new Mesh(new CircleGeometry(0.9, 32), new MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.35 }));
    this.ghost.rotation.x = -Math.PI / 2;
    this.ghost.position.y = 0.02;
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.selectRing = new Mesh(new RingGeometry(1.05, 1.2, 48), new MeshBasicMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.85 }));
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.position.y = 0.03;
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);

    this.connectLine = new Line(new BufferGeometry(), new LineDashedMaterial({ color: '#38bdf8', dashSize: 0.3, gapSize: 0.2 }));
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
    this.animate(now, dt);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };

  private resize() {
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
    this.builtVersion = this.ctrl.graphVersion;
    this.builtLevel = levelId;
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
        new TubeGeometry(curve, 48, 0.055, 6, false),
        new MeshStandardMaterial({ color: from.kind === 'topic' ? '#c084fc' : '#64748b', roughness: 0.6, transparent: true, opacity: 0.85 }),
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
      obj.position.copy(curve.getPoint(0.5)).add(new Vector3(2.1, 0.1, 0));
      this.world.add(obj);
    }
    this.labelTimer = 0;
  }

  // ───────────── animação ─────────────

  private animate(now: number, dt: number) {
    const sim = this.ctrl.sim;
    const t = now / 1000;

    for (const v of this.nodeViews.values()) {
      for (const s of v.spinners) {
        const busy = v.node.kind !== 'consumer' || this.consumerBusy(sim, v.node.id);
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
              ? '#ef4444'
              : w.state === 'processing' || w.state === 'receiving'
                ? w.failReason === 'db'
                  ? '#ef4444'
                  : '#22c55e'
                : w.state === 'polling'
                  ? '#38bdf8'
                  : j >= c.active
                    ? '#1e293b'
                    : '#475569';
          (pad.material as MeshStandardMaterial).color.set(color);
        });
        const mat = v.body.material as MeshStandardMaterial;
        mat.color.set(c?.down ? '#7f1d1d' : v.baseColor);
      } else if (isWorkerNode) {
        for (const pad of v.workerPads) (pad.material as MeshStandardMaterial).color.set(v.node.kind === 'lambda' ? '#1e293b' : '#475569');
        (v.body.material as MeshStandardMaterial).color.set(v.baseColor);
      }
    }

    this.updateSelection(t);
    this.updateTokens(sim);
    this.effects.update(dt);

    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 120;
      for (const v of this.nodeViews.values()) {
        const html = describeNode(v.node, this.ctrl, sim);
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
      const s = sel.node.kind === 'queue' ? 1.6 : 1;
      this.selectRing.scale.set(s, 1, 1);
      const connecting = this.ctrl.tool.type === 'connect';
      (this.selectRing.material as MeshBasicMaterial).color.set(connecting ? '#38bdf8' : '#e2e8f0');
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
      this.ghost.scale.set(tool.item.kind === 'queue' ? 1.8 : 1, 1, 1);
      (this.ghost.material as MeshBasicMaterial).color.set(this.ctrl.canPlaceAt(x, z) ? '#22c55e' : '#ef4444');
    } else this.ghost.visible = false;
  }

  private tokenColor(token: Token): Color {
    if (token.poison) return this.color.set(POISON_COLOR);
    const g = this.ctrl.level?.highlightGroups ? groupColor(token.groupId) : null;
    return this.color.set(g ?? typeInfo(token.type).color);
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
      const c = this.tokenColor(token);
      if (dim > 0) c.lerp(new Color('#334155'), dim);
      this.tokens.setColorAt(i, c);
      i++;
    };

    // em trânsito
    for (const tr of sim.transits) {
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
      for (const m of q.messages) {
        if (m.inFlight) continue;
        if (!queueSlot(view.node, slot++, this.tmp)) break;
        put(this.tmp, m.token, 1, 0, m.visibleAt > now ? 0.6 : 0);
      }
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
          const pos = this.tmp.clone();
          pos.y += 0.2 + (k - w.index) * 0.2;
          put(pos, w.batch[k].token, 0.6);
        }
        if (b < MAX_BARS) {
          const prog = Math.min(1, (now - w.start) / Math.max(1, w.until - w.start));
          d.position.set(this.tmp.x - 0.2 + prog * 0.2, 1.4, this.tmp.z + 0.25);
          d.rotation.set(0, 0, 0);
          d.scale.set(Math.max(0.01, prog * 0.4), 1, 1);
          d.updateMatrix();
          this.bars.setMatrixAt(b, d.matrix);
          this.bars.setColorAt(b, this.color.set('#facc15'));
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
    this.updatePointer(e);
    this.hover = this.groundPoint();
    const el = this.renderer.domElement;
    if (this.drag && this.hover) {
      const view = this.nodeViews.get(this.drag.id);
      const x = Math.round(this.hover.x);
      const z = Math.round(this.hover.z);
      if (view && (x !== view.group.position.x || z !== view.group.position.z) && this.ctrl.canPlaceAt(x, z, this.drag.id)) {
        view.group.position.set(x, 0, z);
        this.drag.moved = true;
      }
      el.style.cursor = 'grabbing';
      return;
    }
    const tool = this.ctrl.tool;
    const id = this.pickNode();
    el.style.cursor = tool.type === 'place' ? 'copy' : tool.type === 'connect' ? (id ? 'alias' : 'crosshair') : id ? 'pointer' : 'default';
  };

  private onPointerUp = () => {
    if (!this.drag) return;
    const { id, moved } = this.drag;
    this.drag = null;
    const view = this.nodeViews.get(id);
    if (moved && view) this.ctrl.moveNode(id, view.group.position.x, view.group.position.z);
  };
}
