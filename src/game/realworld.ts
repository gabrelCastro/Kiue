import type { Graph, GraphNode } from '../sim/types';
import { findNode } from './graph';

// Gera o equivalente "na vida real" (AWS CLI / SDK v3) da peça selecionada.

const REGION = 'us-east-1';
const ACCOUNT = '123456789012';

export function awsName(n: GraphNode): string {
  let name = n.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.fifo$/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!name) name = n.id;
  const fifo = (n.kind === 'queue' || n.kind === 'topic') && (n.config as { fifo: boolean }).fifo;
  return fifo ? `${name}.fifo` : name;
}

const queueArn = (n: GraphNode) => `arn:aws:sqs:${REGION}:${ACCOUNT}:${awsName(n)}`;
const queueUrl = (n: GraphNode) => `https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/${awsName(n)}`;
const topicArn = (n: GraphNode) => `arn:aws:sns:${REGION}:${ACCOUNT}:${awsName(n)}`;

export interface Snippet {
  title: string;
  lang: 'bash' | 'ts' | 'json';
  code: string;
  note?: string;
}

export function snippetsFor(graph: Graph, node: GraphNode): Snippet[] {
  switch (node.kind) {
    case 'queue':
      return queueSnippets(graph, node as GraphNode<'queue'>);
    case 'topic':
      return topicSnippets(graph, node as GraphNode<'topic'>);
    case 'consumer':
      return consumerSnippets(graph, node as GraphNode<'consumer'>);
    case 'producer':
      return producerSnippets(graph, node as GraphNode<'producer'>);
  }
}

function queueSnippets(graph: Graph, q: GraphNode<'queue'>): Snippet[] {
  const c = q.config;
  const attrs: Record<string, string> = {
    VisibilityTimeout: String(c.visibilityTimeout),
    DelaySeconds: String(c.delaySeconds),
    MessageRetentionPeriod: String(c.retention),
  };
  if (c.fifo) {
    attrs.FifoQueue = 'true';
    attrs.ContentBasedDeduplication = String(c.contentDedup);
  }
  const dlq = c.dlq ? findNode(graph, c.dlq) : undefined;
  if (dlq) attrs.RedrivePolicy = JSON.stringify({ deadLetterTargetArn: queueArn(dlq), maxReceiveCount: String(c.maxReceiveCount) });
  const json = JSON.stringify(attrs, null, 2).replace(/'/g, "'\\''");
  const out: Snippet[] = [
    {
      title: 'Criar a fila',
      lang: 'bash',
      code: `aws sqs create-queue \\\n  --queue-name ${awsName(q)} \\\n  --attributes '${json}'`,
      note: c.fifo ? 'O nome de uma fila FIFO precisa terminar em .fifo.' : undefined,
    },
  ];
  const isDlqOf = graph.nodes.filter((n) => n.kind === 'queue' && (n as GraphNode<'queue'>).config.dlq === q.id);
  if (isDlqOf.length) {
    out.push({
      title: 'Alarme para a DLQ (CloudWatch)',
      lang: 'bash',
      code: `aws cloudwatch put-metric-alarm \\\n  --alarm-name ${awsName(q)}-tem-mensagens \\\n  --namespace AWS/SQS --metric-name ApproximateNumberOfMessagesVisible \\\n  --dimensions Name=QueueName,Value=${awsName(q)} \\\n  --statistic Maximum --period 60 --evaluation-periods 1 \\\n  --threshold 0 --comparison-operator GreaterThanThreshold`,
      note: `Esta fila é a DLQ de: ${isDlqOf.map((n) => n.name).join(', ')}. Depois de corrigir o bug, use "start-message-move-task" para devolver as mensagens à origem.`,
    });
  }
  const fromTopic = graph.edges.filter((e) => e.to === q.id).map((e) => findNode(graph, e.from)).filter((n) => n?.kind === 'topic');
  if (fromTopic.length) {
    const policy = {
      Version: '2012-10-17',
      Statement: fromTopic.map((t) => ({
        Effect: 'Allow',
        Principal: { Service: 'sns.amazonaws.com' },
        Action: 'sqs:SendMessage',
        Resource: queueArn(q),
        Condition: { ArnEquals: { 'aws:SourceArn': topicArn(t!) } },
      })),
    };
    out.push({
      title: 'Policy da fila (permite o SNS enviar)',
      lang: 'json',
      code: JSON.stringify(policy, null, 2),
      note: 'Sem essa policy, o tópico não consegue entregar na fila.',
    });
  }
  return out;
}

function topicSnippets(graph: Graph, t: GraphNode<'topic'>): Snippet[] {
  const attrs = t.config.fifo ? ` \\\n  --attributes FifoTopic=true,ContentBasedDeduplication=${t.config.contentDedup}` : '';
  const out: Snippet[] = [{ title: 'Criar o tópico', lang: 'bash', code: `aws sns create-topic --name ${awsName(t)}${attrs}` }];
  for (const e of graph.edges.filter((x) => x.from === t.id)) {
    const q = findNode(graph, e.to);
    if (!q) continue;
    const subAttrs: Record<string, string> = { RawMessageDelivery: 'true' };
    if (e.filterPolicy && Object.keys(e.filterPolicy).length) subAttrs.FilterPolicy = JSON.stringify(e.filterPolicy);
    out.push({
      title: `Assinatura → ${q.name}`,
      lang: 'bash',
      code: `aws sns subscribe \\\n  --topic-arn ${topicArn(t)} \\\n  --protocol sqs \\\n  --notification-endpoint ${queueArn(q)} \\\n  --attributes '${JSON.stringify(subAttrs)}'`,
      note: subAttrs.FilterPolicy
        ? 'A filter policy fica na assinatura e, por padrão, avalia os MessageAttributes.'
        : 'RawMessageDelivery=true entrega só o corpo; sem ele, a fila recebe o envelope JSON do SNS.',
    });
  }
  return out;
}

function consumerSnippets(graph: Graph, c: GraphNode<'consumer'>): Snippet[] {
  const cfg = c.config;
  const src = graph.edges.find((e) => e.to === c.id);
  const source = src ? findNode(graph, src.from) : undefined;
  if (!source || source.kind !== 'queue') {
    return [
      {
        title: 'Endpoint síncrono',
        lang: 'ts',
        code: `// Chamado diretamente pelo produtor (HTTP).\n// Se estiver ocupado ou fora do ar, a requisição falha\n// e o pedido se perde, a menos que o produtor tenha retry.\napp.post('/pedidos', async (req, res) => {\n  await processar(req.body);\n  res.sendStatus(200);\n});`,
      },
    ];
  }
  const fifo = (source as GraphNode<'queue'>).config.fifo;
  const idem = cfg.idempotent
    ? `      // idempotência: grava o ID do pedido com escrita condicional\n      // (ex.: DynamoDB PutItem com attribute_not_exists) e ignora repetidos\n      if (!(await registrarSeNovo(pedido.id))) { ok.push(m); continue; }\n`
    : '';
  const del =
    cfg.batchSize > 1
      ? `  if (ok.length) {\n    await sqs.send(new DeleteMessageBatchCommand({\n      QueueUrl,\n      Entries: ok.map((m, i) => ({ Id: String(i), ReceiptHandle: m.ReceiptHandle! })),\n    }));\n  }`
      : `  for (const m of ok) {\n    await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: m.ReceiptHandle! }));\n  }`;
  const imports = cfg.batchSize > 1 ? 'ReceiveMessageCommand, DeleteMessageBatchCommand' : 'ReceiveMessageCommand, DeleteMessageCommand';
  return [
    {
      title: 'Loop do consumidor (AWS SDK v3, TypeScript)',
      lang: 'ts',
      code: `import { SQSClient, ${imports} } from '@aws-sdk/client-sqs';\n\nconst sqs = new SQSClient({ region: '${REGION}' });\nconst QueueUrl = '${queueUrl(source)}';\n\nwhile (true) {\n  const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({\n    QueueUrl,\n    MaxNumberOfMessages: ${cfg.batchSize},\n    WaitTimeSeconds: ${cfg.waitTime},${cfg.waitTime === 0 ? ' // short polling: volta na hora, mesmo vazio' : ' // long polling'}\n  }));\n  const ok = [];\n  for (const m of Messages) {\n    try {\n      const pedido = JSON.parse(m.Body!);\n${idem}      await processar(pedido);\n      ok.push(m);\n    } catch (err) {\n      // não apaga: a mensagem volta após o visibility timeout${fifo ? '\n      // (FIFO: o grupo fica bloqueado até ela ser apagada ou ir para a DLQ)' : ''}\n    }\n  }\n${del}\n}`,
      note: `Rodando ${cfg.workers} ${cfg.workers === 1 ? 'instância' : 'instâncias'} deste loop em paralelo.`,
    },
  ];
}

function producerSnippets(graph: Graph, p: GraphNode<'producer'>): Snippet[] {
  const cfg = p.config;
  const dst = graph.edges.find((e) => e.from === p.id);
  const target = dst ? findNode(graph, dst.to) : undefined;
  const group = cfg.groups > 0 ? `\n  MessageGroupId: pedido.clienteId, // ordem por cliente` : '';
  const dedup = cfg.dedupId ? `\n  MessageDeduplicationId: \`pedido-\${pedido.id}\`,` : '';
  const attrs = `\n  MessageAttributes: {\n    tipo: { DataType: 'String', StringValue: pedido.tipo },\n  },`;
  if (target?.kind === 'topic') {
    return [
      {
        title: 'Publicar no tópico (AWS SDK v3)',
        lang: 'ts',
        code: `import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';\n\nconst sns = new SNSClient({ region: '${REGION}' });\n\nawait sns.send(new PublishCommand({\n  TopicArn: '${topicArn(target)}',\n  Message: JSON.stringify(pedido),${attrs}${group}${dedup}\n}));`,
      },
    ];
  }
  if (target?.kind === 'queue') {
    return [
      {
        title: 'Enviar para a fila (AWS SDK v3)',
        lang: 'ts',
        code: `import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';\n\nconst sqs = new SQSClient({ region: '${REGION}' });\n\nawait sqs.send(new SendMessageCommand({\n  QueueUrl: '${queueUrl(target)}',\n  MessageBody: JSON.stringify(pedido),${attrs}${group}${dedup}\n}));`,
        note: cfg.retryRate > 0 ? 'O SDK faz retry automático em erros de rede, e isso pode gerar duplicatas.' : undefined,
      },
    ];
  }
  if (target?.kind === 'consumer') {
    return [
      {
        title: 'Chamada síncrona',
        lang: 'ts',
        code: `// Sem fila: se o serviço estiver ocupado, o pedido se perde.\nawait fetch('https://faturamento.interno/pedidos', {\n  method: 'POST',\n  body: JSON.stringify(pedido),\n});`,
      },
    ];
  }
  return [{ title: 'Sem destino', lang: 'ts', code: '// Conecte o produtor a uma fila ou tópico.' }];
}
