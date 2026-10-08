// Modelo de dados da simulação. Tempos de configuração em segundos (como na AWS);
// internamente o motor trabalha em milissegundos de jogo.

export type NodeKind = 'producer' | 'topic' | 'queue' | 'consumer' | 'lambda';

export interface ColorWeight {
  value: string; // valor do atributo "tipo"
  weight: number;
}

export interface Burst {
  at: number; // s
  duration: number; // s
  multiplier: number;
}

export interface ProducerConfig {
  rate: number; // mensagens por segundo
  total: number;
  startAt: number; // s
  bursts: Burst[];
  types: ColorWeight[];
  poisonRate: number; // 0..1
  groups: number; // 0 = sem MessageGroupId
  dedupId: boolean; // envia MessageDeduplicationId
  retryRate: number; // 0..1 — probabilidade de reenviar (retry de rede)
  largeRate: number; // 0..1 — fração de mensagens com anexo grande
  largeKb: number; // tamanho das mensagens grandes
  extendedClient: boolean; // payload grande vai para o S3 (Extended Client)
}

export interface TopicConfig {
  fifo: boolean;
  contentDedup: boolean;
}

export interface QueueConfig {
  fifo: boolean;
  visibilityTimeout: number; // s
  delaySeconds: number; // s
  retention: number; // s
  maxReceiveCount: number;
  dlq: string | null; // id da fila usada como DLQ
  contentDedup: boolean;
}

export interface Outage {
  from: number; // s
  to: number; // s
}

export interface ConsumerConfig {
  workers: number;
  batchSize: number; // 1..10
  waitTime: number; // 0..20 s
  processingTime: number; // s por mensagem
  jitter: number; // 0..1
  failRate: number; // 0..1
  idempotent: boolean;
  interest: string[] | null; // tipos que este consumidor deveria receber (null = todos)
  outages: Outage[];
  heartbeat: boolean; // estende a visibilidade com ChangeMessageVisibility durante o processamento
  httpOnly: boolean; // endpoint HTTP: só recebe push (ex.: do SNS), não lê filas
}

/** Função Lambda acionada por fila SQS (event source mapping). */
export interface LambdaConfig {
  batchSize: number; // 1..10 no jogo
  maxConcurrency: number; // MaximumConcurrency; 0 = sem limite (teto do jogo)
  timeout: number; // s
  processingTime: number; // s por mensagem
  jitter: number;
  failRate: number;
  idempotent: boolean;
  interest: string[] | null;
  reportBatchItemFailures: boolean;
  dbLimit: number; // conexões que o banco aguenta; 0 = sem limite
}

export interface ConfigByKind {
  producer: ProducerConfig;
  topic: TopicConfig;
  queue: QueueConfig;
  consumer: ConsumerConfig;
  lambda: LambdaConfig;
}

export interface GraphNode<K extends NodeKind = NodeKind> {
  id: string;
  kind: K;
  name: string;
  x: number;
  z: number;
  locked?: boolean;
  config: ConfigByKind[K];
}

export type FilterRule =
  | string
  | { 'anything-but': string[] }
  | { exists: boolean };

export type FilterPolicy = Record<string, FilterRule[]>;

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  locked?: boolean;
  filterPolicy?: FilterPolicy | null;
  /** DLQ da assinatura SNS (RedrivePolicy da subscription). */
  dlq?: string | null;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Uma cópia física de uma mensagem. `logicalId` identifica o pedido de negócio. */
export interface Token {
  copyId: number;
  logicalId: number;
  type: string;
  poison: boolean;
  groupId: string | null;
  seq: number;
  dedupId: string | null;
  body: string;
  createdAt: number; // ms
  producerId: string;
  sizeKb: number;
  s3: boolean; // corpo é um ponteiro para o S3 (Extended Client)
}

export interface SimOptions {
  seed: number;
  duration: number; // s
  standardDupRate: number; // probabilidade de a fila Standard entregar cópia extra
  shortPollEmptyRate: number; // probabilidade de short polling voltar vazio com poucas mensagens
}

export const DEFAULT_SIM_OPTIONS: SimOptions = {
  seed: 1,
  duration: 120,
  standardDupRate: 0,
  shortPollEmptyRate: 0.25,
};

export type SimEvent =
  | { t: number; type: 'produced'; node: string; token: Token; retry: boolean }
  | { t: number; type: 'send_error'; node: string; target: string; token: Token; reason: string }
  | { t: number; type: 'published'; node: string; token: Token }
  | { t: number; type: 'filtered'; node: string; edge: string; target: string; token: Token }
  | { t: number; type: 'deduplicated'; node: string; token: Token }
  | { t: number; type: 'enqueued'; node: string; token: Token }
  | { t: number; type: 'sqs_duplicate'; node: string; token: Token }
  | { t: number; type: 'received'; node: string; consumer: string; token: Token; receiveCount: number }
  | { t: number; type: 'visibility_expired'; node: string; token: Token }
  | { t: number; type: 'deleted'; node: string; token: Token }
  | { t: number; type: 'delete_stale'; node: string; token: Token }
  | { t: number; type: 'moved_to_dlq'; node: string; dlq: string; token: Token; receiveCount: number }
  | { t: number; type: 'expired'; node: string; token: Token }
  | { t: number; type: 'dropped'; node: string; token: Token }
  | { t: number; type: 'processed'; node: string; token: Token; latency: number }
  | { t: number; type: 'duplicate_processed'; node: string; token: Token }
  | { t: number; type: 'duplicate_ignored'; node: string; token: Token }
  | { t: number; type: 'out_of_order'; node: string; token: Token; expectedAfter: number }
  | { t: number; type: 'wrong_delivery'; node: string; token: Token }
  | { t: number; type: 'process_failed'; node: string; token: Token; reason: 'poison' | 'error' | 'outage' }
  | { t: number; type: 'empty_receive'; node: string }
  | { t: number; type: 'outage_start' | 'outage_end'; node: string }
  | { t: number; type: 'invocation_failed'; node: string; reason: 'error' | 'timeout' | 'db'; size: number }
  | { t: number; type: 'scaled'; node: string; concurrency: number }
  | { t: number; type: 'visibility_extended'; node: string; count: number }
  | { t: number; type: 'sns_retry'; node: string; target: string; token: Token; attempt: number }
  | { t: number; type: 'sns_dlq'; node: string; target: string; dlq: string; token: Token }
  | { t: number; type: 's3_put'; node: string; token: Token };

export type SimEventType = SimEvent['type'];
