import type { ConsumerConfig, LambdaConfig, ProducerConfig, QueueConfig, TopicConfig } from './types';

/** Valores padrão que espelham os padrões da AWS quando faz sentido. */
export function defaultQueue(over: Partial<QueueConfig> = {}): QueueConfig {
  return {
    fifo: false,
    visibilityTimeout: 30,
    delaySeconds: 0,
    retention: 345600, // 4 dias
    maxReceiveCount: 3,
    dlq: null,
    contentDedup: false,
    ...over,
  };
}

export function defaultTopic(over: Partial<TopicConfig> = {}): TopicConfig {
  return { fifo: false, contentDedup: false, ...over };
}

export function defaultConsumer(over: Partial<ConsumerConfig> = {}): ConsumerConfig {
  return {
    workers: 1,
    batchSize: 1,
    waitTime: 20,
    processingTime: 1,
    jitter: 0.2,
    failRate: 0,
    idempotent: false,
    interest: null,
    outages: [],
    heartbeat: false,
    httpOnly: false,
    ...over,
  };
}

export function defaultProducer(over: Partial<ProducerConfig> = {}): ProducerConfig {
  return {
    rate: 1,
    total: 20,
    startAt: 0,
    bursts: [],
    types: [{ value: 'pedido', weight: 1 }],
    poisonRate: 0,
    groups: 0,
    dedupId: false,
    retryRate: 0,
    largeRate: 0,
    largeKb: 2048,
    extendedClient: false,
    ...over,
  };
}

export function defaultLambda(over: Partial<LambdaConfig> = {}): LambdaConfig {
  return {
    batchSize: 10,
    maxConcurrency: 0,
    timeout: 10,
    processingTime: 0.3,
    jitter: 0.2,
    failRate: 0,
    idempotent: false,
    interest: null,
    reportBatchItemFailures: false,
    dbLimit: 0,
    ...over,
  };
}
