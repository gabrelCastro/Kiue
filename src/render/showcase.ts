import { BoxGeometry, Color, DynamicDrawUsage, Fog, InstancedMesh, Mesh, MeshBasicMaterial, NeutralToneMapping, Object3D, PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, TubeGeometry, Vector3, WebGLRenderer, type Curve } from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { MESSAGE_TYPES } from '../game/catalog';
import type { GraphNode } from '../sim/types';
import { bakedMaterial, bakeGeometry, bakeTree } from './bake';
import { Effects } from './effects';
import { edgeCurve, queueSlot, TOKEN_H, workerSlot } from './layout';
import { buildNode, DOOR_OPEN, type NodeView } from './nodes';
import { backdropTexture, beltTexture, flowTexture, GROUND_TILE, groundTexture } from './textures';

/*
 * Vitrine da tela inicial: produtor → fila → consumidor com as peças do jogo, numa coreografia
 * própria (sem o simulador). O produtor manda rajadas de caixas, a fila guarda o excesso e os
 * braços da bancada pegam uma por vez. A câmera passeia devagar.
 */

const PIPE_RADIUS = 0.085;
/** Tempos das etapas (s). */
const T_OUT = 1.3;
const T_IN = 1.1;
const T_POLL = 0.35;
const T_WORK = 2.6;
const T_DONE = 0.3;
/** Rajada: N caixas com este intervalo, depois uma pausa. */
const BURST = 10;
const BURST_GAP = 0.26;
const BURST_PAUSE = 8;
const QUEUE_CAP = 14;
const DOOR_MS = 420;
const MAX_TOKENS = 64;

const PAD = {
  busy: new Color('#29ad32'),
  polling: new Color('#0099ff'),
  idle: new Color('#b4b4bb'),
};

type Phase = 'out' | 'queued' | 'in' | 'work' | 'done';

interface Msg {
  color: Color;
  phase: Phase;
  t0: number;
  pos: Vector3;
  worker: number;
  spin: number;
  scale: number;
}

interface Worker {
  state: 'idle' | 'poll' | 'busy';
  t0: number;
}

function node(id: string, kind: GraphNode['kind'], name: string, x: number, config: object): GraphNode {
  return { id, kind, name, x, z: 0, config } as unknown as GraphNode;
}

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export interface ShowcaseOptions {
  /** Fração da largura (à direita) onde a cena deve caber; o resto fica para o texto. */
  frame: () => number;
}

/** Monta a vitrine em `container` e devolve a função que a desmonta. */
export function mountShowcase(container: HTMLElement, opts: ShowcaseOptions): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'label-layer';
  container.appendChild(labels.domElement);

  const scene = new Scene();
  scene.background = backdropTexture();
  scene.fog = new Fog('#eef0f2', 26, 60);
  const camera = new PerspectiveCamera(28, 1, 0.1, 200);

  const groundTex = groundTexture().clone();
  groundTex.needsUpdate = true;
  groundTex.repeat.set(120 / GROUND_TILE, 120 / GROUND_TILE);
  const ground = new Mesh(new PlaneGeometry(120, 120), new MeshBasicMaterial({ map: groundTex, toneMapped: false }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // peças
  const producer = node('p', 'producer', 'Produtor', -5, {});
  const queue = node('q', 'queue', 'Fila SQS', 0, { fifo: false });
  const consumer = node('c', 'consumer', 'Consumidor', 5, { workers: 3 });
  const views: Record<'p' | 'q' | 'c', NodeView> = {
    p: buildNode(producer, false),
    q: buildNode(queue, false),
    c: buildNode(consumer, false),
  };
  for (const v of Object.values(views)) scene.add(v.group);

  // canos
  const pipeTex = flowTexture('#d4d9de', '#9aa3ab');
  const pipe = (curve: Curve<Vector3>) => {
    const geo = new TubeGeometry(curve, 48, PIPE_RADIUS, 10, false);
    const uv = geo.getAttribute('uv');
    const repeat = curve.getLength() * 1.4;
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * repeat);
    const mat = bakedMaterial('#ffffff');
    mat.map = pipeTex;
    const tube = new Mesh(geo, mat);
    bakeTree(tube);
    scene.add(tube);
  };
  const toQueue = edgeCurve(producer, queue);
  const toConsumer = edgeCurve(queue, consumer);
  pipe(toQueue);
  pipe(toConsumer);

  // mensagens
  const tokenGeo = new BoxGeometry(0.3, TOKEN_H, 0.3);
  const lift = new Object3D();
  lift.position.y = 0.6;
  lift.updateMatrixWorld();
  bakeGeometry(tokenGeo, lift.matrixWorld);
  const tokens = new InstancedMesh(tokenGeo, new MeshBasicMaterial({ vertexColors: true }), MAX_TOKENS);
  tokens.instanceMatrix.setUsage(DynamicDrawUsage);
  tokens.frustumCulled = false;
  tokens.count = 0;
  tokens.setColorAt(0, new Color());
  scene.add(tokens);
  const effects = new Effects(scene);

  const palette = MESSAGE_TYPES.map((t) => new Color(t.color));
  const msgs: Msg[] = [];
  const waiting: Msg[] = [];
  const workers: Worker[] = [0, 1, 2].map(() => ({ state: 'idle', t0: 0 }));
  let sent = 0;
  let done = 0;
  let nextEmit = 0.6;
  let burstLeft = BURST;
  let colorIndex = 0;

  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const dummy = new Object3D();
  const k = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

  function emit(t: number) {
    const color = palette[colorIndex++ % palette.length];
    msgs.push({ color, phase: 'out', t0: t, pos: new Vector3(), worker: -1, spin: 0, scale: 1 });
    views.p.doorAt = performance.now();
    sent++;
  }

  function step(t: number, dt: number) {
    // produtor: rajadas, com a fila como amortecedor
    if (t >= nextEmit) {
      if (waiting.length < QUEUE_CAP) emit(t);
      burstLeft--;
      if (burstLeft > 0) nextEmit = t + BURST_GAP;
      else {
        burstLeft = BURST;
        nextEmit = t + BURST_PAUSE;
      }
    }

    // workers: livre → busca (long polling) → pega a cabeça da fila
    workers.forEach((w, j) => {
      if (w.state === 'idle' && waiting.length > 0) {
        w.state = 'poll';
        w.t0 = t;
      } else if (w.state === 'poll' && t - w.t0 >= T_POLL) {
        const m = waiting.shift();
        if (!m) {
          w.state = 'idle';
          return;
        }
        m.phase = 'in';
        m.t0 = t;
        m.worker = j;
        w.state = 'busy';
      }
    });

    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const p = t - m.t0;
      switch (m.phase) {
        case 'out':
          if (p >= T_OUT) {
            m.phase = 'queued';
            waiting.push(m);
          } else {
            toQueue.getPoint(ease(p / T_OUT), m.pos);
            m.pos.y += PIPE_RADIUS + TOKEN_H / 2;
          }
          break;
        case 'queued': {
          const slot = waiting.indexOf(m);
          if (queueSlot(queue, slot, tmp)) m.pos.lerp(tmp, k(dt, 6));
          break;
        }
        case 'in': {
          workerSlot(consumer, m.worker, 3, tmp2);
          if (p >= T_IN) {
            m.phase = 'work';
            m.t0 = t;
            m.pos.copy(tmp2);
          } else {
            // pipe até a entrada da bancada, depois desliza até a célula do worker
            const q = p / T_IN;
            if (q < 0.75) {
              toConsumer.getPoint(ease(q / 0.75), m.pos);
              m.pos.y += PIPE_RADIUS + TOKEN_H / 2;
            } else {
              toConsumer.getPoint(1, tmp);
              tmp.y += PIPE_RADIUS + TOKEN_H / 2;
              m.pos.lerpVectors(tmp, tmp2, ease((q - 0.75) / 0.25));
            }
          }
          break;
        }
        case 'work':
          m.spin = t * 4;
          if (p >= T_WORK + (m.worker % 2) * 0.35) {
            m.phase = 'done';
            m.t0 = t;
            done++;
            workers[m.worker].state = 'idle';
            effects.spawn(tmp.set(consumer.x - 0.4 + m.worker * 0.4, 0, 0), '✓', 'ok', 'ok' + m.worker, 0);
          }
          break;
        case 'done':
          m.scale = Math.max(0, 1 - p / T_DONE);
          m.pos.y += dt * 1.2;
          if (p >= T_DONE) msgs.splice(i, 1);
          break;
      }
    }

    // braços e luzes
    const arms = views.c.arms;
    workers.forEach((w, j) => {
      const pad = views.c.workerPads[j];
      const color = w.state === 'busy' ? PAD.busy : w.state === 'poll' ? PAD.polling : PAD.idle;
      (pad.material as MeshBasicMaterial).color.copy(color);
      const working = w.state === 'busy' && msgs.some((m) => m.worker === j && m.phase === 'work');
      arms?.setPose(j, working ? 'work' : w.state === 'idle' ? 'idle' : 'poll');
    });
    arms?.update(dt * 1000, t);

    // portão do produtor
    if (views.p.door) {
      const q = (performance.now() - views.p.doorAt) / DOOR_MS;
      views.p.door.scale.y = 1 - (q < 1 ? DOOR_OPEN * Math.sin(Math.PI * q) : 0);
    }

    // esteira e setas dos canos andam
    beltTexture().offset.x -= dt * 0.9;
    pipeTex.offset.x -= dt * 1.2;
    effects.update(dt * 1000);

    let n = 0;
    for (const m of msgs) {
      if (n >= MAX_TOKENS) break;
      dummy.position.copy(m.pos);
      dummy.rotation.set(0, m.spin, 0);
      dummy.scale.setScalar(m.phase === 'work' ? 1.05 * m.scale : m.scale);
      dummy.updateMatrix();
      tokens.setMatrixAt(n, dummy.matrix);
      tokens.setColorAt(n, m.color);
      n++;
    }
    tokens.count = n;
    tokens.instanceMatrix.needsUpdate = true;
    if (tokens.instanceColor) tokens.instanceColor.needsUpdate = true;

    setLabel(views.p, 'Produtor', `${sent} enviadas`);
    setLabel(views.q, 'Fila SQS', `${waiting.length} na fila`);
    setLabel(views.c, 'Consumidor', `${workers.filter((w) => w.state === 'busy').length}/3 ocupados · ✓ ${done}`);
  }

  const lastLabel = new Map<NodeView, string>();
  function setLabel(v: NodeView, name: string, line: string) {
    const html = `<div class="nl-name">${name}</div><div class="nl-line">${line}</div>`;
    if (lastLabel.get(v) === html) return;
    lastLabel.set(v, html);
    v.label.innerHTML = html;
  }

  // câmera: enquadra a cena na parte da tela reservada a ela e passeia devagar
  const target = new Vector3();
  function placeCamera(t: number) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const f = opts.frame();
    const aspect = w / h;
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // largura da cena (com folga) e altura aparente das peças com os rótulos
    const halfW = f < 1 ? 6.1 : 6.9;
    const halfH = 2.3;
    const dist = Math.max(halfW / Math.tan((hfov * f) / 2), halfH / Math.tan(vfov / 2));
    const az = 0.36 + 0.2 * Math.sin(t * 0.11);
    const el = 0.6 + 0.05 * Math.sin(t * 0.07);
    const dir = tmp.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    // a cena fica no centro da faixa da direita: desloca o alvo para a esquerda
    const right = tmp2.set(Math.cos(az), 0, -Math.sin(az));
    const visibleHalf = dist * Math.tan(hfov / 2);
    target.set(f < 1 ? 0.9 : 0.8, 0.7, 0).addScaledVector(right, -(1 - f) * visibleHalf);
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
  }

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(() => {
    resize();
    if (!running) render(clock);
  });
  ro.observe(container);

  function render(t: number) {
    placeCamera(t);
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  // roda só visível (na tela e com a aba aberta); com movimento reduzido, um quadro parado
  let clock = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let onScreen = true;
  const frame = (now: number) => {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    step(clock, dt);
    render(clock);
    raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    const should = !reduced && onScreen && document.visibilityState === 'visible';
    if (should && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    sync();
  });
  io.observe(container);
  document.addEventListener('visibilitychange', sync);

  if (reduced) {
    // avança a coreografia até a fila ter caixas e todos os braços trabalhando, e desenha uma vez
    for (let i = 0; i < 200; i++) step((clock += 0.05), 0.05);
    render(clock);
  } else {
    step(0, 0);
    render(0);
    sync();
  }

  return () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', sync);
    effects.clear();
    // texturas de esteira, canos, fundo e sombras são compartilhadas com o jogo: ficam
    scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as MeshBasicMaterial).dispose();
      }
    });
    groundTex.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    labels.domElement.remove();
  };
}
