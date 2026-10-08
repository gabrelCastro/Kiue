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
  lang: 'bash' | 'ts' | 'json' | 'python';
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
    case 'lambda':
      return lambdaSnippets(graph, node as GraphNode<'lambda'>);
  }
}

function lambdaSnippets(graph: Graph, fn: GraphNode<'lambda'>): Snippet[] {
  const c = fn.config;
  const src = graph.edges.find((e) => e.to === fn.id);
  const source = src ? findNode(graph, src.from) : undefined;
  const name = awsName(fn).replace(/\.fifo$/, '');
  const out: Snippet[] = [];
  if (source?.kind === 'queue') {
    const vt = (source as GraphNode<'queue'>).config.visibilityTimeout;
    const flags = [`--function-name ${name}`, `--event-source-arn ${queueArn(source)}`, `--batch-size ${c.batchSize}`];
    if (c.reportBatchItemFailures) flags.push('--function-response-types ReportBatchItemFailures');
    if (c.maxConcurrency > 0) flags.push(`--scaling-config MaximumConcurrency=${Math.max(2, c.maxConcurrency)}`);
    out.push({
      title: 'Ligar a fila à função (event source mapping)',
      lang: 'bash',
      code: `aws lambda create-event-source-mapping \\\n  ${flags.join(' \\\n  ')}`,
      note:
        vt < c.timeout * 6
          ? `Atenção: a AWS recomenda visibility timeout da fila ≥ 6× o timeout da função (aqui: ${vt}s < ${c.timeout * 6}s).`
          : 'A AWS recomenda visibility timeout da fila ≥ 6× o timeout da função.',
    });
  }
  out.push({ title: 'Timeout da função', lang: 'bash', code: `aws lambda update-function-configuration \\\n  --function-name ${name} \\\n  --timeout ${c.timeout}` });
  const body = c.reportBatchItemFailures
    ? `export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {\n  const batchItemFailures: SQSBatchItemFailure[] = [];\n  for (const record of event.Records) {\n    try {\n      await processar(JSON.parse(record.body));\n    } catch {\n      // só esta mensagem volta para a fila\n      batchItemFailures.push({ itemIdentifier: record.messageId });\n    }\n  }\n  return { batchItemFailures };\n};`
    : `export const handler = async (event: SQSEvent): Promise<void> => {\n  for (const record of event.Records) {\n    // se uma mensagem lançar erro, o lote INTEIRO volta para a fila,\n    // inclusive as que já foram processadas\n    await processar(JSON.parse(record.body));\n  }\n};`;
  const types = c.reportBatchItemFailures ? 'SQSBatchItemFailure, SQSBatchResponse, SQSEvent' : 'SQSEvent';
  out.push({
    title: 'Handler (TypeScript)',
    lang: 'ts',
    code: `import type { ${types} } from 'aws-lambda';\n\n${body}`,
    note: c.reportBatchItemFailures ? 'Exige --function-response-types ReportBatchItemFailures no event source mapping.' : undefined,
  });
  return out;
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
  const subs = graph.edges.filter((e) => e.dlq === q.id);
  if (subs.length) {
    out.push({
      title: 'DLQ de assinatura SNS',
      lang: 'bash',
      code: subs
        .map((e) => {
          const t = findNode(graph, e.from);
          return `# assinatura ${t?.name} → ${findNode(graph, e.to)?.name}\naws sns set-subscription-attributes \\\n  --subscription-arn <arn-da-assinatura> \\\n  --attribute-name RedrivePolicy \\\n  --attribute-value '{"deadLetterTargetArn":"${queueArn(q)}"}'`;
        })
        .join('\n\n'),
      note: 'A fila também precisa de uma policy permitindo sqs:SendMessage a partir do tópico.',
    });
  }
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
    if (q.kind === 'consumer') {
      const attrs: Record<string, string> = {};
      const dlq = e.dlq ? findNode(graph, e.dlq) : undefined;
      if (dlq) attrs.RedrivePolicy = JSON.stringify({ deadLetterTargetArn: queueArn(dlq) });
      if (e.filterPolicy && Object.keys(e.filterPolicy).length) attrs.FilterPolicy = JSON.stringify(e.filterPolicy);
      const attrFlag = Object.keys(attrs).length ? ` \\\n  --attributes '${JSON.stringify(attrs)}'` : '';
      out.push({
        title: `Assinatura HTTPS → ${q.name}`,
        lang: 'bash',
        code: `aws sns subscribe \\\n  --topic-arn ${topicArn(t)} \\\n  --protocol https \\\n  --notification-endpoint https://${awsName(q)}.exemplo.com/sns${attrFlag}`,
        note: `O endpoint precisa confirmar a assinatura (SubscriptionConfirmation). Se ele falhar, o SNS tenta de novo conforme a delivery policy (padrão HTTP/S: 3 retries com 20 s de intervalo)${dlq ? '; esgotadas as tentativas, a mensagem vai para a DLQ da assinatura' : ' e depois descarta a mensagem'}.`,
      });
      continue;
    }
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
  if (source?.kind === 'topic') {
    return [
      {
        title: 'Endpoint HTTPS assinado no SNS',
        lang: 'ts',
        code: `app.post('/sns', async (req, res) => {\n  const msg = req.body;\n  if (msg.Type === 'SubscriptionConfirmation') {\n    await fetch(msg.SubscribeURL); // confirma a assinatura\n    return res.sendStatus(200);\n  }\n  await processar(JSON.parse(msg.Message));\n  res.sendStatus(200); // qualquer erro ou timeout faz o SNS tentar de novo\n});`,
        note: 'Em produção, valide a assinatura da mensagem SNS (SigningCertURL).',
      },
    ];
  }
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
    ...(cfg.heartbeat
      ? [
          {
            title: 'Heartbeat durante o processamento',
            lang: 'ts' as const,
            code: `import { ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';\n\nconst VT = ${(source as GraphNode<'queue'>).config.visibilityTimeout}; // visibility timeout da fila (s)\nconst timer = setInterval(() => {\n  sqs.send(new ChangeMessageVisibilityCommand({\n    QueueUrl,\n    ReceiptHandle: m.ReceiptHandle!,\n    VisibilityTimeout: VT, // "mais VT segundos a partir de agora"\n  }));\n}, VT * 600); // renova com folga, antes de expirar\ntry {\n  await processar(pedido);\n} finally {\n  clearInterval(timer);\n}`,
            note: 'Se o processo cair, o heartbeat para e a mensagem volta em até um visibility timeout.',
          },
        ]
      : []),
  ];
}

function producerSnippets(graph: Graph, p: GraphNode<'producer'>): Snippet[] {
  const cfg = p.config;
  const dst = graph.edges.find((e) => e.from === p.id);
  const target = dst ? findNode(graph, dst.to) : undefined;
  const group = cfg.groups > 0 ? `\n  MessageGroupId: pedido.clienteId, // ordem por cliente` : '';
  const dedup = cfg.dedupId ? `\n  MessageDeduplicationId: \`pedido-\${pedido.id}\`,` : '';
  const attrs = `\n  MessageAttributes: {\n    tipo: { DataType: 'String', StringValue: pedido.tipo },\n  },`;
  const extended: Snippet[] =
    cfg.largeRate > 0
      ? [
          {
            title: cfg.extendedClient ? 'Extended Client (anexos no S3)' : 'Anexos grandes',
            lang: cfg.extendedClient ? 'python' : 'ts',
            code: cfg.extendedClient
              ? `# Python: amazon-sqs-extended-client\nimport boto3\nimport sqs_extended_client  # adiciona suporte a payload grande ao client\n\nsqs = boto3.client('sqs')\nsqs.large_payload_support = 'notas-fiscais-bucket'\nsqs.use_legacy_attribute = False\n\n# acima do limite, o corpo vai para o S3 e a fila recebe só o ponteiro\nsqs.send_message(QueueUrl=QUEUE_URL, MessageBody=pdf_em_base64)`
              : `// ${cfg.largeKb} KB não cabe numa mensagem SQS (máximo 1 MiB)\n// e cada bloco de 64 KB já é cobrado como uma requisição.\n// Guarde o arquivo no S3 e envie só a referência,\n// ou use o Extended Client, que faz isso automaticamente.`,
            note: 'O Extended Client existe para Java e Python; o consumidor também precisa usá-lo para buscar o payload no S3.',
          },
        ]
      : [];
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
      ...extended,
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
