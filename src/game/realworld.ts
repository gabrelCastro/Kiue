import type { Graph, GraphNode } from '../sim/types';
import { findNode } from './graph';

/*
 * Aba "Na vida real": como a peça selecionada ficaria num sistema de verdade, sem amarrar a um
 * provedor. A configuração sai num YAML genérico (no estilo de infraestrutura como código) e o
 * código usa um cliente de fila genérico (`fila.receber`, `fila.apagar`...). Os nomes de campo
 * descrevem o conceito; cada provedor tem o seu equivalente.
 */

/** Nome de recurso a partir do nome da peça: minúsculas, sem acento, com hífens. */
export function resourceName(n: GraphNode): string {
  const name = n.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name || n.id;
}

export interface Snippet {
  title: string;
  lang: 'yaml' | 'ts';
  code: string;
  note?: string;
}

/** YAML simples: objeto aninhado → linhas indentadas (só o que a aba precisa). */
type Yaml = string | number | boolean | null | Yaml[] | { [k: string]: Yaml | undefined };
function yaml(v: Yaml, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? `${pad}- ${yaml(x, indent + 1).trimStart()}` : `${pad}- ${scalar(x)}`)).join('\n');
  if (v && typeof v === 'object') {
    return Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => (x && typeof x === 'object' ? `${pad}${k}:\n${yaml(x as Yaml, indent + 1)}` : `${pad}${k}: ${scalar(x as Yaml)}`))
      .join('\n');
  }
  return pad + scalar(v);
}
function scalar(v: Yaml): string {
  if (typeof v === 'string') return /^[\w./-]+$/.test(v) ? v : JSON.stringify(v);
  return String(v);
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
      return functionSnippets(graph, node as GraphNode<'lambda'>);
  }
}

function functionSnippets(graph: Graph, fn: GraphNode<'lambda'>): Snippet[] {
  const c = fn.config;
  const src = graph.edges.find((e) => e.to === fn.id);
  const source = src ? findNode(graph, src.from) : undefined;
  const out: Snippet[] = [];
  const funcao: Record<string, Yaml | undefined> = {
    nome: resourceName(fn),
    timeout: `${c.timeout}s`,
    concorrenciaReservada: (c.reserved ?? 0) > 0 ? c.reserved : undefined,
    instanciasProvisionadas: (c.provisioned ?? 0) > 0 ? c.provisioned : undefined,
  };
  if (source?.kind === 'queue') {
    const vt = (source as GraphNode<'queue'>).config.visibilityTimeout;
    funcao.origem = {
      fila: resourceName(source),
      tamanhoDoLote: c.batchSize,
      janelaDeLote: (c.batchWindow ?? 0) > 0 ? `${c.batchWindow}s` : undefined,
      concorrenciaMaxima: c.maxConcurrency > 0 ? Math.max(2, c.maxConcurrency) : undefined,
      reportarFalhasPorItem: c.reportBatchItemFailures || undefined,
    };
    out.push({
      title: 'Função ligada à fila',
      lang: 'yaml',
      code: yaml({ funcao }),
      note:
        vt < c.timeout * 6
          ? `Atenção: a recomendação é visibility timeout da fila ≥ 6× o timeout da função (aqui: ${vt}s < ${c.timeout * 6}s).`
          : 'Recomendação: visibility timeout da fila ≥ 6× o timeout da função.',
    });
  } else if (source?.kind === 'topic') {
    const dest = c.onFailure ? findNode(graph, c.onFailure) : undefined;
    funcao.origem = { topico: resourceName(source), invocacao: 'assincrona' };
    funcao.novasTentativas = 2;
    funcao.destinoDeFalha = dest ? { fila: resourceName(dest) } : undefined;
    out.push({
      title: 'Função assinando o tópico',
      lang: 'yaml',
      code: yaml({ funcao }),
      note: dest
        ? 'Depois de 2 novas tentativas, o evento (com o erro) vai para a fila de destino. A função precisa de permissão para enviar nela.'
        : 'Sem destino de falha, o evento é descartado depois das novas tentativas. O tópico também precisa de permissão para invocar a função.',
    });
  } else {
    out.push({ title: 'Função', lang: 'yaml', code: yaml({ funcao }) });
  }
  if ((c.reserved ?? 0) > 0 && source?.kind === 'queue') {
    out[out.length - 1].note +=
      ' Com fila como origem, invocações acima da concorrência reservada são recusadas (throttling) e o lote volta depois do visibility timeout. Para limitar o que a fila dispara, use a concorrência máxima do leitor.';
  }
  if ((c.provisioned ?? 0) > 0) {
    out.push({
      title: 'Instâncias provisionadas',
      lang: 'yaml',
      code: yaml({ funcao: { nome: resourceName(fn), versao: 'prod', instanciasProvisionadas: c.provisioned } }),
      note: 'Valem para uma versão publicada da função. São cobradas por hora, mesmo sem invocações.',
    });
  }
  const body = c.reportBatchItemFailures
    ? `export async function handler(lote: Mensagem[]): Promise<{ falhas: string[] }> {\n  const falhas: string[] = [];\n  for (const msg of lote) {\n    try {\n      await processar(JSON.parse(msg.corpo));\n    } catch {\n      // só esta mensagem volta para a fila\n      falhas.push(msg.id);\n    }\n  }\n  return { falhas };\n}`
    : `export async function handler(lote: Mensagem[]): Promise<void> {\n  for (const msg of lote) {\n    // se uma mensagem lançar erro, o lote INTEIRO volta para a fila,\n    // inclusive as que já foram processadas\n    await processar(JSON.parse(msg.corpo));\n  }\n}`;
  out.push({
    title: 'Handler (TypeScript)',
    lang: 'ts',
    code: body,
    note: c.reportBatchItemFailures ? 'Exige "reportarFalhasPorItem" ligado na origem.' : undefined,
  });
  return out;
}

function queueSnippets(graph: Graph, q: GraphNode<'queue'>): Snippet[] {
  const c = q.config;
  const dlq = c.dlq ? findNode(graph, c.dlq) : undefined;
  const out: Snippet[] = [
    {
      title: 'Criar a fila',
      lang: 'yaml',
      code: yaml({
        fila: {
          nome: resourceName(q),
          tipo: c.fifo ? 'fifo' : 'standard',
          visibilityTimeout: `${c.visibilityTimeout}s`,
          atrasoDeEntrega: `${c.delaySeconds}s`,
          retencao: `${c.retention}s`,
          deduplicacaoPorConteudo: c.fifo ? c.contentDedup : undefined,
          dlq: dlq ? { fila: resourceName(dlq), maximoDeRecebimentos: c.maxReceiveCount } : undefined,
        },
      }),
    },
  ];
  const isDlqOf = graph.nodes.filter((n) => n.kind === 'queue' && (n as GraphNode<'queue'>).config.dlq === q.id);
  const subs = graph.edges.filter((e) => e.dlq === q.id);
  if (subs.length) {
    out.push({
      title: 'DLQ de assinatura do tópico',
      lang: 'yaml',
      code: yaml({
        assinaturas: subs.map((e) => ({ topico: resourceName(findNode(graph, e.from)!), destino: resourceName(findNode(graph, e.to)!), dlq: resourceName(q) })),
      }),
      note: 'A fila também precisa de uma permissão que deixe o tópico enviar mensagens para ela.',
    });
  }
  if (isDlqOf.length) {
    out.push({
      title: 'Alarme para a DLQ',
      lang: 'yaml',
      code: yaml({ alarme: { nome: `${resourceName(q)}-tem-mensagens`, metrica: 'mensagens visíveis', fila: resourceName(q), condicao: '> 0', janela: '60s' } }),
      note: `Esta fila é a DLQ de: ${isDlqOf.map((n) => n.name).join(', ')}. Depois de corrigir o bug, use o redrive para devolver as mensagens à origem.`,
    });
  }
  const fromTopic = graph.edges.filter((e) => e.to === q.id).map((e) => findNode(graph, e.from)).filter((n) => n?.kind === 'topic');
  if (fromTopic.length) {
    out.push({
      title: 'Permissão da fila (o tópico pode enviar)',
      lang: 'yaml',
      code: yaml({ permissao: { recurso: resourceName(q), acao: 'enviar mensagem', permitidoPara: fromTopic.map((t) => ({ topico: resourceName(t!) })) } }),
      note: 'Sem essa permissão, o tópico não consegue entregar na fila.',
    });
  }
  return out;
}

function topicSnippets(graph: Graph, t: GraphNode<'topic'>): Snippet[] {
  const assinaturas: Yaml[] = [];
  const notes: string[] = [];
  for (const e of graph.edges.filter((x) => x.from === t.id)) {
    const dest = findNode(graph, e.to);
    if (!dest) continue;
    const filtro = e.filterPolicy && Object.keys(e.filterPolicy).length ? (e.filterPolicy as unknown as Yaml) : undefined;
    if (dest.kind === 'consumer') {
      const dlq = e.dlq ? findNode(graph, e.dlq) : undefined;
      assinaturas.push({ protocolo: 'https', endpoint: `https://${resourceName(dest)}.exemplo.com/eventos`, filtro, dlq: dlq ? resourceName(dlq) : undefined });
      notes.push(
        `${dest.name}: se o endpoint falhar, o tópico tenta de novo conforme a política de entrega (um padrão comum para HTTP/S: 3 retries com 20 s de intervalo)${dlq ? '; esgotadas as tentativas, a mensagem vai para a DLQ da assinatura' : ' e depois descarta a mensagem'}.`,
      );
    } else if (dest.kind === 'lambda') {
      assinaturas.push({ protocolo: 'funcao', funcao: resourceName(dest), filtro });
    } else {
      assinaturas.push({ protocolo: 'fila', fila: resourceName(dest), entregaSoOCorpo: true, filtro });
    }
  }
  if (assinaturas.some((a) => (a as { filtro?: unknown }).filtro)) notes.push('A filter policy fica na assinatura e, por padrão, avalia os atributos da mensagem.');
  return [
    {
      title: 'Criar o tópico e as assinaturas',
      lang: 'yaml',
      code: yaml({
        topico: {
          nome: resourceName(t),
          tipo: t.config.fifo ? 'fifo' : 'standard',
          deduplicacaoPorConteudo: t.config.fifo ? t.config.contentDedup : undefined,
          assinaturas: assinaturas.length ? assinaturas : undefined,
        },
      }),
      note: notes.join(' ') || undefined,
    },
  ];
}

function consumerSnippets(graph: Graph, c: GraphNode<'consumer'>): Snippet[] {
  const cfg = c.config;
  const src = graph.edges.find((e) => e.to === c.id);
  const source = src ? findNode(graph, src.from) : undefined;
  if (source?.kind === 'topic') {
    return [
      {
        title: 'Endpoint HTTPS assinado no tópico',
        lang: 'ts',
        code: `app.post('/eventos', async (req, res) => {\n  const evento = req.body;\n  if (evento.tipo === 'confirmacao-de-assinatura') {\n    await fetch(evento.urlDeConfirmacao); // confirma a assinatura\n    return res.sendStatus(200);\n  }\n  await processar(JSON.parse(evento.mensagem));\n  res.sendStatus(200); // qualquer erro ou timeout faz o tópico tentar de novo\n});`,
        note: 'Em produção, valide a assinatura digital de cada evento recebido.',
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
    ? `      // idempotência: grava o ID do pedido com escrita condicional\n      // ("insere se não existir") e ignora repetidos\n      if (!(await registrarSeNovo(pedido.id))) { ok.push(msg); continue; }\n`
    : '';
  const del = cfg.batchSize > 1 ? `  if (ok.length) await fila.apagarLote(ok);` : `  for (const msg of ok) await fila.apagar(msg);`;
  return [
    {
      title: 'Loop do consumidor (TypeScript)',
      lang: 'ts',
      code: `const fila = clienteDeFila('${resourceName(source)}');\n\nwhile (true) {\n  const mensagens = await fila.receber({\n    maximo: ${cfg.batchSize},\n    esperaSegundos: ${cfg.waitTime},${cfg.waitTime === 0 ? ' // short polling: volta na hora, mesmo vazio' : ' // long polling'}\n  });\n  const ok = [];\n  for (const msg of mensagens) {\n    try {\n      const pedido = JSON.parse(msg.corpo);\n${idem}      await processar(pedido);\n      ok.push(msg);\n    } catch (err) {\n      // não apaga: a mensagem volta após o visibility timeout${fifo ? '\n      // (FIFO: o grupo fica bloqueado até ela ser apagada ou ir para a DLQ)' : ''}\n    }\n  }\n${del}\n}`,
      note: `Rodando ${cfg.workers} ${cfg.workers === 1 ? 'instância' : 'instâncias'} deste loop em paralelo. "clienteDeFila" representa o SDK do serviço de filas que você usa.`,
    },
    ...(cfg.heartbeat
      ? [
          {
            title: 'Heartbeat durante o processamento',
            lang: 'ts' as const,
            code: `const VT = ${(source as GraphNode<'queue'>).config.visibilityTimeout}; // visibility timeout da fila (s)\nconst timer = setInterval(() => {\n  // "mais VT segundos a partir de agora"\n  fila.estenderVisibilidade(msg, VT);\n}, VT * 600); // renova com folga, antes de expirar\ntry {\n  await processar(pedido);\n} finally {\n  clearInterval(timer);\n}`,
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
  const group = cfg.groups > 0 ? `\n  grupo: pedido.clienteId, // ordem por cliente` : '';
  const dedup = cfg.dedupId ? `\n  idDeduplicacao: \`pedido-\${pedido.id}\`,` : '';
  const attrs = `\n  atributos: { tipo: pedido.tipo },`;
  const large: Snippet[] =
    cfg.largeRate > 0
      ? [
          {
            title: cfg.extendedClient ? 'Claim check (anexos num bucket)' : 'Anexos grandes',
            lang: 'ts',
            code: cfg.extendedClient
              ? `// o anexo vai para o armazenamento de objetos; a mensagem leva só a referência\nconst chave = \`notas/\${pedido.id}.pdf\`;\nawait bucket.gravar(chave, pdf);\nawait fila.enviar({\n  corpo: JSON.stringify({ ...pedido, anexo: chave }),\n});`
              : `// ${cfg.largeKb} KB não cabe numa mensagem (máximo de 1 MiB neste jogo)\n// e cada bloco de 64 KB já é cobrado como uma requisição.\n// Guarde o arquivo num bucket e envie só a referência (claim check).`,
            note: cfg.extendedClient ? 'O consumidor busca o anexo no bucket pela referência. Há bibliotecas que fazem isso de forma transparente.' : undefined,
          },
        ]
      : [];
  if (target?.kind === 'topic') {
    return [
      {
        title: 'Publicar no tópico (TypeScript)',
        lang: 'ts',
        code: `const topico = clienteDeTopico('${resourceName(target)}');\n\nawait topico.publicar({\n  corpo: JSON.stringify(pedido),${attrs}${group}${dedup}\n});`,
      },
    ];
  }
  if (target?.kind === 'queue') {
    return [
      {
        title: 'Enviar para a fila (TypeScript)',
        lang: 'ts',
        code: `const fila = clienteDeFila('${resourceName(target)}');\n\nawait fila.enviar({\n  corpo: JSON.stringify(pedido),${attrs}${group}${dedup}\n});`,
        note: cfg.retryRate > 0 ? 'SDKs costumam fazer retry automático em erros de rede, e isso pode gerar duplicatas.' : undefined,
      },
      ...large,
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
