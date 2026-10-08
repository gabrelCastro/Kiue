import { defaultConsumer, defaultLambda, defaultProducer, defaultQueue, defaultTopic } from '../../src/sim/defaults';
import type {
  ConsumerConfig,
  FilterPolicy,
  Graph,
  GraphNode,
  LambdaConfig,
  ProducerConfig,
  QueueConfig,
  TopicConfig,
} from '../../src/sim/types';

export const producer = (id: string, c: Partial<ProducerConfig> = {}): GraphNode => ({
  id, kind: 'producer', name: id, x: 0, z: 0, config: defaultProducer(c),
});
export const queue = (id: string, c: Partial<QueueConfig> = {}): GraphNode => ({
  id, kind: 'queue', name: id, x: 0, z: 0, config: defaultQueue(c),
});
export const topic = (id: string, c: Partial<TopicConfig> = {}): GraphNode => ({
  id, kind: 'topic', name: id, x: 0, z: 0, config: defaultTopic(c),
});
export const consumer = (id: string, c: Partial<ConsumerConfig> = {}): GraphNode => ({
  id, kind: 'consumer', name: id, x: 0, z: 0, config: defaultConsumer(c),
});

export const lambda = (id: string, c: Partial<LambdaConfig> = {}): GraphNode => ({
  id, kind: 'lambda', name: id, x: 0, z: 0, config: defaultLambda(c),
});

export function graph(nodes: GraphNode[], edges: [string, string, FilterPolicy?, string?][]): Graph {
  return {
    nodes,
    edges: edges.map(([from, to, filterPolicy, dlq], i) => ({ id: `e${i}`, from, to, filterPolicy, dlq })),
  };
}
