import { defaultConsumer, defaultProducer, defaultQueue, defaultTopic } from '../../src/sim/defaults';
import type {
  ConsumerConfig,
  FilterPolicy,
  Graph,
  GraphNode,
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

export function graph(nodes: GraphNode[], edges: [string, string, FilterPolicy?][]): Graph {
  return {
    nodes,
    edges: edges.map(([from, to, filterPolicy], i) => ({ id: `e${i}`, from, to, filterPolicy })),
  };
}
