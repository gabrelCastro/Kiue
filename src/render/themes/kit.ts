import type { Group, Mesh, Object3D } from 'three';
import type { GraphNode } from '../../sim/types';
import type { ArmPose } from '../robots';

/*
 * Kit de um tema visual: como montar o produtor e o consumidor. O resto da cena (fila, tópico,
 * função sob demanda, canos, mensagens) é igual em todos os temas, assim como as cores de cada
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

export interface ThemeKit {
  producer(model: Group): ProducerBuild;
  consumer(model: Group, node: GraphNode<'consumer'>): ConsumerBuild;
  /**
   * Onde a caixa em processamento pousa, relativo ao centro da célula do worker (layout.workerCell),
   * antes do NODE_SCALE; `y` é a altura da superfície acima do pedestal.
   */
  workerSpot: { x: number; y: number; z: number };
}
