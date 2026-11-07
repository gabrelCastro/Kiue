import { Color, CylinderGeometry, InstancedMesh, Object3D, SphereGeometry, Vector3, type BufferGeometry, type Material } from 'three';
import type { WorkerState } from '../../sim/engine';
import { modelGeometry, modelGeometryAt } from '../models';
import { WORKER } from '../../theme';
import type { LambdaRig } from './kit';

/*
 * Pátio da função sob demanda (models/patio.scad), igual em todos os temas: 20 postos em duas
 * fileiras viradas para um corredor, a fonte na ponta esquerda (onde o cano chega) e baias de
 * chegada embaixo. Cada instância da função é um ajudante (o robozinho do tema) que segue o estado
 * do worker na simulação:
 *  - a função escala: o ajudante chega (a partida a frio do tema: bicicleta, moto, porta, gancho,
 *    elevador, cabine de montagem) e vai até o seu posto; ela encolhe: ele termina o lote e vai
 *    embora pelo mesmo caminho;
 *  - esperando mensagem (idle, polling): fila na fonte, na ordem em que a simulação entrega os
 *    lotes (o worker de menor índice primeiro); quem está longe na fila espera no próprio posto;
 *  - recebeu um lote: vai à fonte, pega o lote e leva ao posto, onde trabalha nele (as mensagens
 *    de verdade seguem o ajudante: itemSpot);
 *  - instância fria (sem invocação ainda, ou iniciando): olhos azuis; fora do ar: caído.
 * Medidas em mm do .scad; o modelo do jogo usa mm / 100, com z = −y. Tudo em InstancedMesh: uma
 * chamada de desenho por parte, com 1 ou 20 ajudantes.
 */

type P = [number, number];
type Pt = P | [number, number, 'r'];

export const YARD = {
  FLOOR: 8.7,
  LANE_R: 112,
  WALK_Y: -30,
  BAY_X: [0, 30, 60, 90],
  BAY_Y: -58,
  /** Faixas do corredor: Q = fila da fonte, BACK = indo ao posto, THRU = chegando. */
  Q: 12,
  BACK: 18,
  THRU: 24,
  COUNTER: [-80, 12] as P,
  GAP: 15,
  /** Faixas da rua: chegada (vindo da direita) e saída. */
  ROAD_IN: -65,
  ROAD_OUT: -75,
  EDGE: 114,
  SLOTS: 20,
};

/** Posto do worker `j`: os primeiros ficam perto da fonte (frente e fundo da mesma coluna). */
export function stationOf(j: number): number {
  return j % 2 === 0 ? j / 2 : 10 + (j - 1) / 2;
}
/** Centro do posto `i` (mm do .scad). */
export function stationAt(i: number): P {
  return [-66 + (i % 10) * 19, i < 10 ? -4 : 40];
}
/** Postos da fileira da frente e do fundo entre os dados. */
export const frontRow = (stations: number[]) => stations.filter((i) => i < 10);
export const backRow = (stations: number[]) => stations.filter((i) => i >= 10);
/** Onde o ajudante do worker `j` fica no posto: no corredor, de frente para ele. */
function standOf(j: number): P {
  const i = stationOf(j);
  return [stationAt(i)[0], i < 10 ? 8 : 28];
}
/** Para onde o ajudante olha no posto (frente do robô em −y do .scad = 0). */
const faceOf = (j: number) => (stationOf(j) < 10 ? 0 : Math.PI);

/** Escala do robozinho (robo.scad tem 40 mm); ombro em 20 mm. */
const BOT = 0.48;
/** Velocidade a pé e de veículo (mm/s) e duração da partida a frio na baia (s). */
const WALK = 150;
const RIDE = 190;
const INTRO_S = 1.1;
const TURN = 12;

export interface YardVehicle {
  /** Partes do veículo (prefixo do tema + nome) e materiais; a última é o farol (azul na partida a frio). */
  parts: { name: string; mat: Material }[];
  lamp: { name: string; mat: Material };
  /** Onde estaciona: bicicletário (y dado) ou a própria vaga do posto. */
  park: { rackY: number } | 'station';
  /** Giro do modelo em relação à frente do robô (bicicleta: frente em −x, π/2). */
  yawOffset: number;
  /** Robô montado: altura e escala relativa. */
  riderZ: number;
  riderScale: number;
}

export interface YardStyle {
  /** Prefixo dos modelos do tema (ex.: fazenda_funcao). */
  prefix: string;
  /** Como o ajudante chega e vai embora (partida a frio do tema). */
  arrival: 'vehicle' | 'door' | 'pod' | 'crane' | 'lift';
  vehicle?: YardVehicle;
  /** Chapéu (ou acessório) na cabeça do robô. */
  hat?: { name: string; mat: Material };
  /** Altura do topo do posto (mm), onde o lote pousa. */
  stationTop: number;
  /** Onde as mensagens esperam na fonte (mm do .scad: x, y, z). */
  source: [number, number, number];
  /** Efeito de trabalho no posto: faíscas de solda ou pistão de prensa (parte `${prefix}/pistao`). */
  work?: { kind: 'sparks'; mat: Material } | { kind: 'piston'; mat: Material; rest: number; stroke: number };
  /** O lote vai no veículo estacionado (baú da moto), a esta distância atrás do centro dele (mm). */
  itemOnVehicle?: number;
  /** Gancho da ponte rolante (arrival = crane): altura do carrinho e material do cabo. */
  crane?: { hookZ: number; mat: Material };
}

interface Helper {
  phase: 'absent' | 'intro' | 'walkIn' | 'active' | 'leave' | 'waitBay' | 'outro';
  x: number;
  y: number;
  yaw: number;
  yawT: number;
  path: Pt[] | null;
  d: number;
  len: number;
  goal: string;
  timer: number;
  bay: number;
  carry: boolean;
  ride: boolean;
  state: WorkerState;
  warm: boolean;
  /** No posto com o lote, trabalhando. */
  working: boolean;
  tilt: number;
  phaseT: number;
}

const tmpObj = new Object3D();
const EYES = new Color('#e9f3ff');
const LAMP = new Color('#fff1c2');
const SPARKS_PER = 3;
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class YardRig implements LambdaRig {
  readonly objects: Object3D[] = [];
  readonly source: Vector3;
  private readonly helpers: Helper[];
  private readonly body: InstancedMesh[];
  private readonly arms: InstancedMesh;
  private readonly eyes: InstancedMesh;
  private readonly lights: InstancedMesh;
  private readonly vehicle: InstancedMesh[] = [];
  private readonly lamp?: InstancedMesh;
  private readonly cable?: InstancedMesh;
  private readonly pistons?: InstancedMesh;
  private readonly sparks?: InstancedMesh;
  /** Baias de chegada ocupadas (temas sem veículo): índice do worker ou −1. */
  private readonly bays = [-1, -1, -1, -1];
  private snapped = false;
  private readonly coldEyes = new Color(WORKER.cold);

  constructor(
    private readonly style: YardStyle,
    private readonly cap: number,
    mats: { body: Material; visor: Material; eyes: Material; light: Material },
  ) {
    const n = YARD.SLOTS;
    const inst = (geo: BufferGeometry, m: Material, count = n) => new InstancedMesh(geo, m, count);
    const robot = (name: string, m: Material) => inst(modelGeometry(`robo/${name}`), m);
    this.body = [robot('corpo', mats.body), robot('visor', mats.visor)];
    if (style.hat) this.body.push(inst(modelGeometry(style.hat.name), style.hat.mat));
    this.eyes = robot('olhos', mats.eyes);
    this.arms = robot('bracos', mats.body);
    this.lights = inst(modelGeometry(`${style.prefix}/luz`), mats.light);
    for (let i = 0; i < n; i++) {
      this.at(stationAt(i), YARD.FLOOR - 0.1);
      this.lights.setMatrixAt(i, tmpObj.matrix);
      this.lights.setColorAt(i, new Color(WORKER.off));
    }
    const all: InstancedMesh[] = [...this.body, this.eyes, this.arms, this.lights];
    const v = style.vehicle;
    if (v) {
      for (const p of v.parts) this.vehicle.push(inst(modelGeometry(`${style.prefix}/${p.name}`), p.mat));
      this.lamp = inst(modelGeometry(`${style.prefix}/${v.lamp.name}`), v.lamp.mat);
      all.push(...this.vehicle, this.lamp);
    }
    if (style.crane) {
      this.cable = inst(new CylinderGeometry(0.004, 0.004, 1, 6), style.crane.mat);
      all.push(this.cable);
    }
    const w = style.work;
    if (w?.kind === 'piston') {
      // um pistão por posto, parado no alto; desce e sobe com o ajudante trabalhando
      this.pistons = inst(modelGeometry(`${style.prefix}/pistao`), w.mat);
      for (let i = 0; i < n; i++) {
        this.at(this.pistonAt(i), w.rest);
        this.pistons.setMatrixAt(i, tmpObj.matrix);
      }
      all.push(this.pistons);
    }
    if (w?.kind === 'sparks') {
      this.sparks = inst(new SphereGeometry(0.007, 6, 4), w.mat, n * SPARKS_PER);
      all.push(this.sparks);
    }
    for (const m of all) {
      m.frustumCulled = false;
      m.userData.dynamic = true;
    }
    this.objects.push(...all);
    this.source = new Vector3(style.source[0] / 100, style.source[2] / 100, -style.source[1] / 100);
    this.helpers = Array.from({ length: n }, (_, j) => ({
      phase: 'absent',
      x: 0,
      y: 0,
      yaw: 0,
      yawT: 0,
      path: null,
      d: 0,
      len: 0,
      goal: '',
      timer: 0,
      bay: 0,
      carry: false,
      ride: false,
      state: 'idle',
      warm: false,
      working: false,
      tilt: 0,
      phaseT: j * 0.9,
    }));
  }

  /** Malha estática de uma parte por posto (fardos, mesas, travas…), em posições do jogo. */
  static perStation(name: string, stations: number[]): BufferGeometry {
    return modelGeometryAt(
      name,
      stations.map((i) => {
        const [x, y] = stationAt(i);
        return { x: x / 100, y: (YARD.FLOOR - 0.1) / 100, z: -y / 100 };
      }),
    );
  }

  /** Posiciona `tmpObj` num ponto do .scad (mm), sem giro. */
  private at(p: P, z: number, yaw = 0, scale = 1): void {
    tmpObj.position.set(p[0] / 100, z / 100, -p[1] / 100);
    tmpObj.rotation.set(0, yaw, 0);
    tmpObj.scale.setScalar(scale);
    tmpObj.updateMatrix();
  }

  private pistonAt(i: number): P {
    const [x, y] = stationAt(i);
    return [x, y + (i < 10 ? -2 : 2)];
  }

  setWorker(j: number, state: WorkerState, warm: boolean, light: Color): void {
    const h = this.helpers[j];
    if (!h) return;
    h.state = state;
    h.warm = warm;
    this.lights.setColorAt(stationOf(j), light);
    if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
  }

  // ───────────── caminhos ─────────────

  private go(h: Helper, path: Pt[], goal: string): void {
    // tira pontos repetidos (trechos de tamanho zero)
    const clean = path.filter((p, k) => k === 0 || dist(path[k - 1], p) > 0.01);
    h.path = clean.length > 1 ? clean : null;
    h.goal = goal;
    h.d = 0;
    h.len = 0;
    if (h.path) for (let k = 1; k < h.path.length; k++) h.len += dist(h.path[k - 1], h.path[k]);
  }

  /** Onde o veículo do worker `j` estaciona e para onde ele fica virado. */
  private parkOf(j: number): { p: P; yaw: number } {
    const park = this.style.vehicle?.park;
    if (park && park !== 'station') return { p: [-26 + j * 7, park.rackY], yaw: Math.PI };
    const i = stationOf(j);
    const [x, y] = stationAt(i);
    // a moto entra de frente na vaga: a de frente fica virada para fora, a do fundo para dentro
    return i < 10 ? { p: [x, y - 4], yaw: 0 } : { p: [x, y + 4], yaw: Math.PI };
  }

  /** Baia de chegada (temas sem veículo) ou bicicletário. */
  private bayPoint(j: number, h: Helper): P {
    if (this.style.vehicle) return this.parkOf(j).p;
    return [YARD.BAY_X[h.bay], YARD.BAY_Y];
  }

  /** Chegando: o veículo vem pela rua; os outros saem da baia pela calçada. */
  private rideIn(j: number): Pt[] {
    const { p } = this.parkOf(j);
    if (this.style.vehicle?.park === 'station') return [[YARD.EDGE, YARD.ROAD_IN], [YARD.LANE_R, YARD.ROAD_IN], [YARD.LANE_R, YARD.THRU], [p[0], YARD.THRU], p];
    return [[YARD.EDGE, YARD.ROAD_IN], [p[0], YARD.ROAD_IN], p];
  }
  private rideOut(j: number): Pt[] {
    const { p } = this.parkOf(j);
    if (this.style.vehicle?.park === 'station') return [p, [p[0], YARD.BACK, 'r'], [YARD.LANE_R + 4, YARD.BACK], [YARD.LANE_R + 4, YARD.ROAD_OUT], [YARD.EDGE, YARD.ROAD_OUT]];
    return [p, [p[0], YARD.ROAD_OUT, 'r'], [YARD.EDGE, YARD.ROAD_OUT]];
  }

  /** Da baia (ou do veículo) até o posto. */
  private pathIn(j: number, h: Helper): Pt[] {
    const s = standOf(j);
    if (this.style.vehicle?.park === 'station') return [this.parkOf(j).p, s];
    const b = this.bayPoint(j, h);
    return [b, [b[0], YARD.WALK_Y - 3], [YARD.LANE_R - 4, YARD.WALK_Y - 3], [YARD.LANE_R - 4, YARD.THRU], [s[0], YARD.THRU], s];
  }

  /** Do corredor até a baia (ou até o veículo). */
  private pathOut(j: number, h: Helper): Pt[] {
    const here: P = [h.x, h.y];
    if (this.style.vehicle?.park === 'station') {
      const s = standOf(j);
      return [here, [h.x, YARD.BACK], [s[0], YARD.BACK], s, this.parkOf(j).p];
    }
    const b = this.bayPoint(j, h);
    return [here, [h.x, YARD.BACK], [YARD.LANE_R + 4, YARD.BACK], [YARD.LANE_R + 4, YARD.WALK_Y + 3], [b[0], YARD.WALK_Y + 3], b];
  }

  // ───────────── quadro ─────────────

  /**
   * Avança os ajudantes. `active` = instâncias da função; `dt` em ms (0 = vai direto para o lugar,
   * sem andar); `t` em s; `pace` acelera a caminhada junto com a velocidade do jogo.
   */
  update(active: number, dt: number, t: number, pace = 1): void {
    const snap = dt <= 0 || !this.snapped;
    this.snapped = true;
    const s = Math.min(0.1, dt / 1000) * pace;
    const busyOf = (h: Helper) => h.state === 'receiving' || h.state === 'starting' || h.state === 'processing';

    // fila da fonte: quem está esperando, na ordem em que a simulação entrega os lotes
    const waiting: number[] = [];
    this.helpers.forEach((h, j) => {
      if (h.phase === 'active' && j < active && !busyOf(h) && h.state !== 'down') waiting.push(j);
    });

    this.helpers.forEach((h, j) => {
      const busy = busyOf(h);
      const want = j < this.cap && (j < active || busy);
      if (snap) this.place(h, j, want, busy, waiting.indexOf(j));
      else this.step(h, j, want, busy, waiting.indexOf(j), s);
      h.tilt += ((h.state === 'down' && h.phase === 'active' ? -1.35 : 0) - h.tilt) * Math.min(1, (dt / 1000) * 8);
      h.yaw += wrap(h.yawT - h.yaw) * Math.min(1, s * TURN);
      if (snap) h.yaw = h.yawT;
    });
    this.draw(t);
  }

  /** Coloca o ajudante direto no lugar (montagem da cena, sem animação). */
  private place(h: Helper, j: number, want: boolean, busy: boolean, rank: number): void {
    h.path = null;
    h.ride = false;
    if (!want) {
      h.phase = 'absent';
      return;
    }
    h.phase = 'active';
    h.carry = busy;
    const st = standOf(j);
    const qx = YARD.COUNTER[0] + rank * YARD.GAP;
    if (!busy && rank >= 0 && qx <= st[0] + 1) {
      [h.x, h.y] = [qx, YARD.Q];
      h.yawT = -Math.PI / 2;
      h.goal = 'queue';
    } else {
      [h.x, h.y] = st;
      h.yawT = faceOf(j);
      h.goal = 'station';
      h.working = busy;
    }
  }

  private step(h: Helper, j: number, want: boolean, busy: boolean, rank: number, s: number): void {
    // anda pelo caminho atual
    let arrived = false;
    if (h.path) {
      h.d += (h.ride ? RIDE : WALK) * s;
      const p = this.along(h.path, Math.min(h.d, h.len));
      h.x = p.x;
      h.y = p.y;
      if (p.dx || p.dy) h.yawT = Math.atan2(p.dx, -p.dy) + (p.rev ? Math.PI : 0);
      if (h.d >= h.len) {
        h.path = null;
        arrived = true;
      }
    }
    const st = standOf(j);
    const vehicle = this.style.vehicle;
    switch (h.phase) {
      case 'absent': {
        if (!want) return;
        if (vehicle) {
          h.phase = 'intro';
          h.ride = true;
          [h.x, h.y] = [YARD.EDGE, YARD.ROAD_IN];
          h.yaw = h.yawT = -Math.PI / 2;
          this.go(h, this.rideIn(j), 'park');
        } else {
          const bay = this.bays.indexOf(-1);
          if (bay < 0) return; // espera uma baia vagar
          this.bays[bay] = j;
          h.bay = bay;
          h.phase = 'intro';
          h.timer = 0;
          [h.x, h.y] = [YARD.BAY_X[bay], YARD.BAY_Y];
          h.yaw = h.yawT = this.style.arrival === 'door' ? Math.PI / 2 : Math.PI;
        }
        return;
      }
      case 'intro': {
        // veículo: chega pela rua e estaciona; outros: o efeito do tema na baia
        const done = vehicle ? arrived : (h.timer += s) >= INTRO_S;
        if (done) {
          if (!vehicle) this.bays[h.bay] = -1;
          h.ride = false;
          h.phase = 'walkIn';
          this.go(h, this.pathIn(j, h), 'station');
        }
        return;
      }
      case 'walkIn':
        if (arrived) {
          h.phase = 'active';
          h.goal = 'station';
          h.yawT = faceOf(j);
        }
        return;
      case 'leave':
        if (arrived) {
          if (vehicle) {
            h.phase = 'outro';
            h.ride = true;
            this.go(h, this.rideOut(j), 'out');
          } else h.phase = 'waitBay';
        }
        return;
      case 'waitBay':
        if (this.bays[h.bay] === -1) {
          this.bays[h.bay] = j;
          h.phase = 'outro';
          h.timer = INTRO_S;
          [h.x, h.y] = this.bayPoint(j, h);
          h.yawT = this.style.arrival === 'door' ? Math.PI / 2 : Math.PI;
        }
        return;
      case 'outro': {
        const done = vehicle ? arrived : (h.timer -= s) <= 0;
        if (done) {
          if (!vehicle) this.bays[h.bay] = -1;
          h.phase = 'absent';
          h.ride = false;
          h.carry = false;
          h.working = false;
        }
        return;
      }
    }

    // ativo: decide para onde ir
    if (h.state === 'down') return;
    if (!busy) {
      h.carry = false;
      h.working = false;
    }
    if (!want) {
      // a função encolheu: vai embora (termina o lote antes: com lote, `want` continua)
      if (!vehicle) {
        const load: number[] = this.bays.map((o) => (o === -1 ? 0 : 1));
        this.helpers.forEach((o) => {
          if (o !== h && (o.phase === 'leave' || o.phase === 'waitBay')) load[o.bay]++;
        });
        h.bay = load.indexOf(Math.min(...load));
      }
      h.phase = 'leave';
      this.go(h, this.pathOut(j, h), 'out');
      return;
    }
    const inLane = Math.abs(h.y - YARD.Q) < 0.5;
    if (busy && !h.carry) {
      // vai à fonte buscar o lote; lá, pega e leva ao posto pela faixa de volta
      const atCounter = !h.path && inLane && Math.abs(h.x - YARD.COUNTER[0]) < 0.5;
      if (atCounter) {
        h.carry = true;
        this.go(h, [[h.x, h.y], [h.x, YARD.BACK], [st[0], YARD.BACK], st], 'station');
      } else if (h.goal !== 'counter' || !h.path) this.go(h, [[h.x, h.y], [h.x, YARD.Q], YARD.COUNTER], 'counter');
      return;
    }
    if (busy && h.carry) {
      if (h.goal !== 'station') this.go(h, [[h.x, h.y], [h.x, YARD.BACK], [st[0], YARD.BACK], st], 'station');
      if (!h.path) {
        h.working = true;
        h.yawT = faceOf(j);
      }
      return;
    }
    // esperando mensagem: fila da fonte (ou no posto, se o lugar na fila ainda está longe)
    const qx = YARD.COUNTER[0] + Math.max(0, rank) * YARD.GAP;
    if (h.path && h.goal !== 'queue' && h.goal !== 'pull') return; // termina o trecho atual
    if (inLane && !h.path) {
      h.goal = 'queue';
      if (Math.abs(h.x - qx) > 0.01) {
        const dx = Math.sign(qx - h.x) * Math.min(Math.abs(qx - h.x), WALK * s);
        h.x += dx;
        h.yawT = dx < 0 ? -Math.PI / 2 : Math.PI / 2;
      } else h.yawT = -Math.PI / 2;
      return;
    }
    if (!h.path) {
      const atStand = dist([h.x, h.y], st) < 0.5;
      if (atStand && qx > st[0] + 1) {
        h.goal = 'station';
        h.yawT = faceOf(j);
        return;
      }
      this.go(h, [[h.x, h.y], [h.x, YARD.Q]], 'pull');
    }
  }

  private along(p: Pt[], d: number) {
    for (let k = 1; k < p.length; k++) {
      const a = p[k - 1];
      const b = p[k];
      const seg = dist(a, b);
      if (d <= seg || k === p.length - 1) {
        const u = seg ? Math.min(1, d / seg) : 1;
        return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, dx: b[0] - a[0], dy: b[1] - a[1], rev: b[2] === 'r' };
      }
      d -= seg;
    }
    const last = p[p.length - 1];
    return { x: last[0], y: last[1], dx: 0, dy: 0, rev: false };
  }

  // ───────────── desenho ─────────────

  private draw(t: number): void {
    const style = this.style;
    const v = style.vehicle;
    const work = style.work;
    this.helpers.forEach((h, j) => {
      let present = h.phase !== 'absent';
      let z = YARD.FLOOR;
      let scale = BOT;
      let y = h.y;
      let yaw = h.yaw;
      // partida a frio na baia: p vai de 0 a 1 chegando e de 1 a 0 saindo
      const fx = !v && h.phase === 'intro' ? Math.min(1, h.timer / INTRO_S) : !v && h.phase === 'outro' ? Math.max(0, h.timer / INTRO_S) : 1;
      if (fx < 1) {
        const e = fx * fx * (3 - 2 * fx);
        if (style.arrival === 'door') {
          // entra pela porta dos funcionários (embaixo) e bate o ponto ao lado
          const w = Math.min(1, fx / 0.5);
          y = -71 + (YARD.BAY_Y + 71) * w;
          yaw = fx < 0.5 ? (h.phase === 'intro' ? Math.PI : 0) : Math.PI / 2;
          present = fx > 0.04;
        } else if (style.arrival === 'pod') scale = BOT * Math.max(0.001, e);
        else if (style.arrival === 'crane') z = YARD.FLOOR + (1 - e) * 16;
        else if (style.arrival === 'lift') z = YARD.FLOOR - (1 - e) * 22;
      }
      if (h.ride && v) {
        scale = BOT * v.riderScale;
        z = YARD.FLOOR + v.riderZ;
      }
      const bob = h.working && h.state === 'processing' ? 0.006 * Math.abs(Math.sin(t * 9 + h.phaseT)) : 0;
      tmpObj.position.set(h.x / 100, z / 100 + bob, -y / 100);
      tmpObj.rotation.set(h.tilt, yaw, 0, 'YXZ');
      tmpObj.scale.setScalar(present ? scale : 0.0001);
      tmpObj.updateMatrix();
      for (const m of this.body) m.setMatrixAt(j, tmpObj.matrix);
      this.eyes.setMatrixAt(j, tmpObj.matrix);
      this.eyes.setColorAt(j, !h.warm || h.state === 'starting' || h.phase === 'intro' || h.phase === 'walkIn' ? this.coldEyes : EYES);
      // braços: levando o lote, à frente; trabalhando, mexendo; montado, no guidão; senão, baixos
      const pitch = h.working ? 0.3 + 0.25 * Math.sin(t * 8 + h.phaseT) : h.carry ? -0.25 : h.ride ? -0.6 : 0.55;
      tmpObj.translateY(0.2 * scale);
      tmpObj.rotateX(pitch);
      tmpObj.updateMatrix();
      this.arms.setMatrixAt(j, tmpObj.matrix);

      // gancho da ponte rolante: o cabo desce até a cabeça do mecânico
      if (this.cable && style.crane) {
        const top = z + 40 * scale;
        const len = style.crane.hookZ - top;
        if (fx < 1 && present && len > 0) {
          tmpObj.position.set(h.x / 100, (top + len / 2) / 100, -y / 100);
          tmpObj.rotation.set(0, 0, 0);
          tmpObj.scale.set(1, len / 100, 1);
        } else tmpObj.scale.setScalar(0.0001);
        tmpObj.updateMatrix();
        this.cable.setMatrixAt(j, tmpObj.matrix);
      }

      // veículo: com o ajudante enquanto ele pilota, estacionado enquanto ele trabalha
      if (v && this.lamp) {
        const park = this.parkOf(j);
        if (h.ride) this.at([h.x, h.y], YARD.FLOOR, h.yaw + v.yawOffset, present ? 1 : 0.0001);
        else this.at(park.p, YARD.FLOOR, park.yaw + v.yawOffset, present ? 1 : 0.0001);
        for (const m of this.vehicle) m.setMatrixAt(j, tmpObj.matrix);
        this.lamp.setMatrixAt(j, tmpObj.matrix);
        this.lamp.setColorAt(j, h.phase === 'intro' ? this.coldEyes : LAMP);
      }

      // efeito de trabalho no posto
      const i = stationOf(j);
      const busyHere = present && h.working && h.state === 'processing';
      if (this.pistons && work?.kind === 'piston') {
        const down = busyHere ? Math.abs(Math.sin(t * 5 + h.phaseT)) : 0;
        this.at(this.pistonAt(i), work.rest - work.stroke * down);
        this.pistons.setMatrixAt(i, tmpObj.matrix);
      }
      if (this.sparks) {
        const [sx, sy] = stationAt(i);
        for (let k = 0; k < SPARKS_PER; k++) {
          const on = busyHere && Math.sin(t * 23 + k * 2.1 + h.phaseT * 3) > 0.2;
          // pseudoaleatório por quadro (sem Math.random: o quadro fica igual se redesenhar)
          const a = Math.sin(t * 37.1 + k * 12.9 + j * 4.7);
          const b = Math.cos(t * 29.3 + k * 7.3 + j * 2.1);
          this.at([sx + a * 5, sy + b * 4], style.stationTop + 2 + Math.abs(a * b) * 5, 0, on ? 1 : 0.0001);
          this.sparks.setMatrixAt(j * SPARKS_PER + k, tmpObj.matrix);
        }
      }
    });
    for (const m of this.objects) {
      const im = m as InstancedMesh;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /** Onde o lote do worker `j` aparece (modelo, antes do NODE_SCALE): no posto, nas mãos ou na fonte. */
  itemSpot(j: number, out: Vector3): void {
    const h = this.helpers[j];
    if (!h || h.phase === 'absent' || !h.carry) {
      out.copy(this.source);
      return;
    }
    if (h.working && this.style.itemOnVehicle !== undefined) {
      const { p, yaw } = this.parkOf(j);
      out.set(p[0] / 100, this.style.stationTop / 100, -(p[1] + (yaw === 0 ? 1 : -1) * this.style.itemOnVehicle) / 100);
      return;
    }
    if (h.working) {
      const [x, y] = stationAt(stationOf(j));
      out.set(x / 100, this.style.stationTop / 100, -y / 100);
      return;
    }
    // nas mãos, à frente do robô
    out.set(h.x / 100 + Math.sin(h.yaw) * 0.07, (YARD.FLOOR + 10) / 100, -h.y / 100 + Math.cos(h.yaw) * 0.07);
  }

  /** Algum ajudante ainda andando (a cena precisa seguir redesenhando). */
  moving(): boolean {
    return this.helpers.some((h) => h.path !== null || h.phase === 'intro' || h.phase === 'outro' || h.phase === 'waitBay' || Math.abs(wrap(h.yawT - h.yaw)) > 0.01);
  }
}
