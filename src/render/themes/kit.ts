import type { Color, Group, Mesh, Object3D, Vector3 } from 'three';
import type { WorkerState } from '../../sim/engine';
import type { GraphNode } from '../../sim/types';
import type { ArmPose } from '../robots';

/*
 * Kit de um tema visual: como montar o produtor, o consumidor e a função sob demanda. O resto da
 * cena (fila, tópico, canos, mensagens) é igual em todos os temas, assim como as cores de cada
 * serviço. Os kits montam dentro de `model`, que já vem ampliado pelo NODE_SCALE.
 */

/** Pose de um worker do consumidor (calculada pela cena a partir do estado da simulação). */
export type WorkerPose = ArmPose;

/** Animação de envio do produtor: disparada a cada mensagem enviada, atualizada a cada quadro. */
export interface SendFx {
  trigger(now: number): void;
  update(now: number): void;
}

/** Os workers do consumidor: recebem a pose de cada um e se animam até ela. */
export interface WorkerRig {
  setPose(j: number, pose: WorkerPose): void;
  /** `dt` em ms, `t` em s. */
  update(dt: number, t: number): void;
}

export interface PieceBuild {
  /** Malha principal: clicável, e a do consumidor muda de cor quando ele cai. */
  body: Mesh;
  /** Cor do corpo em estado normal. */
  baseColor: string;
  pickables: Object3D[];
  /** Altura do rótulo, no espaço do modelo (antes do NODE_SCALE). */
  labelY: number;
}

export interface ProducerBuild extends PieceBuild {
  send?: SendFx;
}

export interface ConsumerBuild extends PieceBuild {
  /** Luz de estado de cada worker (a cena pinta conforme o estado). */
  workerPads: Mesh[];
  workers?: WorkerRig;
}

/**
 * Os ajudantes da função sob demanda (render/themes/yard.ts): um por instância, seguindo o estado
 * de cada worker da simulação.
 */
export interface LambdaRig {
  readonly objects: Object3D[];
  /** Onde os eventos da fila interna (SNS → função) esperam, no espaço do modelo. */
  readonly source: Vector3;
  setWorker(j: number, state: WorkerState, warm: boolean, light: Color): void;
  /** `dt` em ms (0 = direto para o lugar), `t` em s, `pace` = ritmo da caminhada. */
  update(active: number, dt: number, t: number, pace?: number): void;
  /** Onde o lote do worker `j` aparece, no espaço do modelo (antes do NODE_SCALE). */
  itemSpot(j: number, out: Vector3): void;
  moving(): boolean;
}

export interface LambdaBuild extends PieceBuild {
  rig: LambdaRig;
}

export interface ThemeKit {
  producer(model: Group): ProducerBuild;
  consumer(model: Group, node: GraphNode<'consumer'>): ConsumerBuild;
  /** Função sob demanda do tema (pátio com ajudantes). A da Indústria é baixada à parte (loadKit). */
  lambda?(model: Group, node: GraphNode<'lambda'>): LambdaBuild;
  /**
   * Onde a caixa em processamento pousa, relativo ao centro da célula do worker (layout.workerCell),
   * antes do NODE_SCALE; `y` é a altura da superfície acima do pedestal.
   */
  workerSpot: { x: number; y: number; z: number };
}
