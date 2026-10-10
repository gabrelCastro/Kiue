import { CATALOG } from '../src/game/level-catalog';
import { FREE_LEVELS, sandbox } from '../src/game/levels';
import { add, C, configure, defineLevel, E, L, link, LIVRO_ELETRO_ROUPA, P, Q, setEdge, T, type Level } from '../src/game/level-types';

/*
 * Conteúdo das fases que pedem conta. Este arquivo NÃO pode ser importado por nada em `src/`:
 * só o servidor o carrega e entrega pela API (`GET /api/levels/:id`) para quem está logado.
 * O build confere que nenhum texto daqui foi parar no bundle (scripts/check-bundle.mjs).
 */

const l3 = defineLevel('i03', {
  story:
    'Os pedidos não se perdem mais, mas os clientes reclamam da demora: a fila cresce mais rápido do que a Separação consegue esvaziar.',
  objective: 'Mantenha a latência p95 em até 8 segundos.',
  hint: 'Coloque mais consumidores lendo a MESMA fila. Cada mensagem vai para apenas um deles, então eles dividem o trabalho.',
  lesson: [
    'Vários consumidores na mesma fila competem pelas mensagens: cada mensagem é entregue a um só (enquanto está em voo, fica invisível para os outros).',
    'Esse é o jeito clássico de escalar horizontalmente um processamento com SQS.',
    'Na AWS isso costuma ser feito com Auto Scaling baseado na métrica ApproximateNumberOfMessagesVisible.',
  ],
  quiz: [
    {
      question: 'Três consumidores leem da mesma fila SQS. Uma mensagem é entregue para…',
      options: ['Os três consumidores', 'Apenas um deles', 'Nenhum, até todos confirmarem'],
      answer: 1,
      explanation: 'Fila = consumo competitivo. Para todos receberem a mesma mensagem, você precisa de fan-out (SNS), que é o próximo assunto.',
    },
  ],
  concepts: [],
  palette: [{ kind: 'consumer', label: 'Consumidor', name: 'Separação', count: 3, config: { processingTime: 0.9 } }],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 3, total: 60 }),
      Q('fila', 'fila-pedidos', 0, 0),
      C('sep1', 'Separação 1', 7, 0, { processingTime: 0.9 }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'sep1', undefined, true)],
  },
  solve: (g) => {
    add(g, C('sep2', 'Separação 2', 7, -3, { processingTime: 0.9 }));
    add(g, C('sep3', 'Separação 3', 7, 3, { processingTime: 0.9 }));
    add(g, C('sep4', 'Separação 4', 7, 6, { processingTime: 0.9 }));
    link(g, 'fila', 'sep2');
    link(g, 'fila', 'sep3');
    link(g, 'fila', 'sep4');
  },
  sim: { seed: 31, duration: 90 },
  goals: [{ type: 'processedAll' }, { type: 'maxP95', seconds: 8 }],
  stars: { p95: 3 },
});

const l4 = defineLevel('i04', {
  story:
    'Cada pedido agora precisa chegar a TRÊS sistemas: Estoque (baixa o produto), E-mail (avisa o cliente) e Faturamento (emite a nota). Todos precisam receber TODOS os pedidos.',
  objective: 'Faça cada pedido chegar aos três sistemas.',
  hint: 'Se você ligar uma fila só nos três consumidores, eles vão dividir os pedidos (lembra da fase anterior?). Use um tópico SNS: ele entrega uma cópia para cada fila assinante.',
  lesson: [
    'SNS é publish/subscribe: o produtor publica uma vez e o tópico entrega uma cópia para cada assinatura.',
    'O padrão "SNS → várias SQS" (fan-out) dá a cada sistema a própria fila, com o próprio ritmo, retries e DLQ.',
    'SNS é push e não guarda mensagens; quem guarda é a fila. Por isso as filas ficam entre o tópico e os consumidores.',
    'Na AWS, a fila precisa de uma policy permitindo sqs:SendMessage a partir do ARN do tópico.',
  ],
  quiz: [
    {
      question: 'Por que colocar filas SQS entre o tópico SNS e os consumidores?',
      options: [
        'Porque o SNS não consegue entregar direto para nada',
        'Para cada consumidor ter um buffer próprio: se um ficar lento ou cair, não perde mensagens nem atrasa os outros',
        'Para garantir ordem entre os consumidores',
      ],
      answer: 1,
      explanation: 'O SNS entrega na hora e não armazena. A fila de cada assinante guarda as mensagens até o consumidor dar conta.',
    },
    {
      question: 'Um tópico SNS com 3 filas assinantes recebe 10 mensagens. Quantas mensagens chegam às filas no total?',
      options: ['10', '30', '3'],
      answer: 1,
      explanation: 'Cada assinatura recebe a sua cópia: 10 × 3 = 30.',
    },
  ],
  concepts: [],
  palette: [
    { kind: 'topic', label: 'Tópico SNS', name: 'pedidos-criados', count: 1 },
    { kind: 'queue', label: 'Fila SQS', name: 'fila', count: 3 },
  ],
  graph: {
    nodes: [
      P('site', 'Site da loja', -8, 0, { rate: 1, total: 20 }),
      C('estoque', 'Estoque', 8, -4, { processingTime: 0.5 }),
      C('email', 'E-mail', 8, 0, { processingTime: 0.5 }),
      C('faturamento', 'Faturamento', 8, 4, { processingTime: 0.5 }),
    ],
    edges: [],
  },
  solve: (g) => {
    add(g, T('topico', 'pedidos-criados', -3, 0));
    add(g, Q('q1', 'fila-estoque', 3, -4));
    add(g, Q('q2', 'fila-email', 3, 0));
    add(g, Q('q3', 'fila-faturamento', 3, 4));
    link(g, 'site', 'topico');
    for (const [q, c] of [['q1', 'estoque'], ['q2', 'email'], ['q3', 'faturamento']]) {
      link(g, 'topico', q);
      link(g, q, c);
    }
  },
  sim: { seed: 41, duration: 60 },
  goals: [
    { type: 'processedAll', consumer: 'estoque' },
    { type: 'processedAll', consumer: 'email' },
    { type: 'processedAll', consumer: 'faturamento' },
  ],
  stars: { p95: 3 },
});

const l5 = defineLevel('i05', {
  story:
    'A loja agora vende livros, eletrônicos e roupas. A Livraria só quer pedidos de livros, a equipe de Eletrônicos só quer eletrônicos e a Auditoria quer ver tudo.',
  objective: 'Cada sistema recebe só os pedidos que lhe interessam (e todos eles).',
  hint: 'Selecione a fila assinante e, no inspetor, edite a "Filter policy" da assinatura. Sem filtro, a assinatura recebe tudo.',
  lesson: [
    'Uma filter policy fica na assinatura (subscription), não no tópico nem na fila.',
    'Ela avalia os atributos da mensagem (MessageAttributes) — ou o corpo, se você usar FilterPolicyScope=MessageBody.',
    'Valores em lista funcionam como OU; chaves diferentes funcionam como E. Também existem operadores como anything-but, prefix, numeric e exists.',
    'Filtrar no SNS evita que cada consumidor receba, pague e descarte mensagens que não usa.',
  ],
  quiz: [
    {
      question: 'Onde se configura a filter policy do SNS?',
      options: ['No tópico', 'Na assinatura (subscription)', 'Na fila SQS'],
      answer: 1,
      explanation: 'Cada assinatura tem a sua filter policy; o mesmo tópico pode ter assinantes com filtros diferentes.',
    },
    {
      question: 'Qual policy aceita pedidos de livro OU roupa?',
      options: ['{"tipo": ["livro", "roupa"]}', '{"tipo": ["livro"], "tipo2": ["roupa"]}', '{"tipo": [{"anything-but": ["livro", "roupa"]}]}'],
      answer: 0,
      explanation: 'Uma lista de valores na mesma chave é OU. A terceira opção é o contrário: tudo exceto livro e roupa.',
    },
  ],
  concepts: ['filter'],
  palette: [{ kind: 'queue', label: 'Fila SQS', name: 'fila', count: 3 }],
  graph: {
    nodes: [
      P('site', 'Site da loja', -8, 0, { rate: 1.5, total: 30, types: LIVRO_ELETRO_ROUPA }),
      T('topico', 'pedidos-criados', -3, 0),
      C('livraria', 'Livraria', 8, -4, { processingTime: 0.5, interest: ['livro'] }),
      C('eletro', 'Eletrônicos', 8, 0, { processingTime: 0.5, interest: ['eletronico'] }),
      C('auditoria', 'Auditoria', 8, 4, { processingTime: 0.3 }),
    ],
    edges: [E('site', 'topico', undefined, true)],
  },
  solve: (g) => {
    add(g, Q('q1', 'fila-livraria', 3, -4));
    add(g, Q('q2', 'fila-eletronicos', 3, 0));
    add(g, Q('q3', 'fila-auditoria', 3, 4));
    link(g, 'topico', 'q1', { tipo: ['livro'] });
    link(g, 'topico', 'q2', { tipo: ['eletronico'] });
    link(g, 'topico', 'q3');
    link(g, 'q1', 'livraria');
    link(g, 'q2', 'eletro');
    link(g, 'q3', 'auditoria');
  },
  sim: { seed: 51, duration: 60 },
  goals: [
    { type: 'processedAll', consumer: 'livraria' },
    { type: 'processedAll', consumer: 'eletro' },
    { type: 'processedAll', consumer: 'auditoria' },
    { type: 'noWrongDelivery' },
  ],
  stars: { p95: 3 },
});

const l6 = defineLevel('i06', {
  story:
    'Alguns pedidos chegam corrompidos (cubos escuros). O consumidor falha toda vez que tenta processá-los, não apaga a mensagem, ela volta para a fila… e assim para sempre.',
  objective: 'Mande as mensagens venenosas para uma dead-letter queue (DLQ) e processe todo o resto.',
  hint: 'Coloque uma segunda fila (ela será a DLQ; não precisa de consumidor). Depois selecione a fila de pedidos e escolha a DLQ e o maxReceiveCount no inspetor.',
  lesson: [
    'Quando o consumidor não apaga a mensagem, ela volta a ficar visível após o visibility timeout e o ApproximateReceiveCount aumenta.',
    'A redrive policy (deadLetterTargetArn + maxReceiveCount) move para a DLQ a mensagem recebida mais vezes do que o limite.',
    'A DLQ é uma fila SQS comum. Use-a para investigar, alarmar (CloudWatch) e reprocessar (redrive de volta para a origem).',
    'A DLQ de uma fila Standard precisa ser Standard; a de uma FIFO precisa ser FIFO.',
  ],
  quiz: [
    {
      question: 'Com maxReceiveCount = 3, quando a mensagem vai para a DLQ?',
      options: ['Na primeira falha', 'Depois de ter sido recebida 3 vezes sem ser apagada', 'Quando a retenção expira'],
      answer: 1,
      explanation: 'Quando o receive count passa do maxReceiveCount, o SQS move a mensagem para a DLQ em vez de entregá-la de novo.',
    },
    {
      question: 'Uma fila FIFO pode usar uma fila Standard como DLQ?',
      options: ['Sim', 'Não, a DLQ precisa ser do mesmo tipo (FIFO)'],
      answer: 1,
      explanation: 'A DLQ de uma fila FIFO precisa ser FIFO, e a de uma fila Standard precisa ser Standard.',
    },
  ],
  concepts: ['dlq', 'visibility'],
  palette: [{ kind: 'queue', label: 'Fila SQS (DLQ)', name: 'fila-pedidos-dlq', count: 1 }],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 1, total: 30, poisonRate: 0.15 }),
      Q('fila', 'fila-pedidos', 0, 0, { visibilityTimeout: 5 }),
      C('separacao', 'Separação', 7, 0, { processingTime: 0.5, workers: 2 }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'separacao', undefined, true)],
  },
  solve: (g) => {
    add(g, Q('dlq', 'fila-pedidos-dlq', 0, 4));
    configure(g, 'fila', { dlq: 'dlq', maxReceiveCount: 3 });
  },
  sim: { seed: 61, duration: 120 },
  goals: [{ type: 'processedAll', consumer: 'separacao' }, { type: 'poisonToDlq' }],
  stars: { p95: 3 },
});

const l7 = defineLevel('i07', {
  story:
    'O processamento de cada pedido demora uns 3 segundos, mas alguém configurou o visibility timeout da fila em 2 segundos. Os clientes estão recebendo duas caixas do mesmo pedido!',
  objective: 'Nenhum pedido pode ser processado duas vezes.',
  hint: 'Enquanto a mensagem está "em voo", ela fica invisível. Se o visibility timeout acabar antes do processamento, outro consumidor pega a mesma mensagem. Ajuste o timeout para ser maior que o tempo de processamento.',
  lesson: [
    'O visibility timeout precisa ser maior que o tempo máximo de processamento (a AWS recomenda folga; o padrão é 30 s e o máximo, 12 h).',
    'Se o timeout acabar, a mensagem reaparece e outro consumidor a processa de novo. O DeleteMessage do primeiro falha, pois o receipt handle dele ficou velho.',
    'Para processamentos longos e variáveis, o consumidor pode estender o prazo com ChangeMessageVisibility (heartbeat).',
  ],
  quiz: [
    {
      question: 'O processamento leva até 40 s e o visibility timeout é de 30 s. O que acontece?',
      options: [
        'Nada; o SQS espera o consumidor terminar',
        'A mensagem volta a ficar visível e pode ser processada de novo por outro consumidor',
        'A mensagem vai direto para a DLQ',
      ],
      answer: 1,
      explanation: 'O SQS não sabe que você ainda está processando. Aumente o timeout ou chame ChangeMessageVisibility periodicamente.',
    },
  ],
  concepts: ['visibility'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 1, total: 30 }),
      Q('fila', 'fila-pedidos', 0, 0, { visibilityTimeout: 2 }),
      C('sep1', 'Separação 1', 7, -2, { processingTime: 3, jitter: 0.2 }),
      C('sep2', 'Separação 2', 7, 2, { processingTime: 3, jitter: 0.2 }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'sep1', undefined, true), E('fila', 'sep2', undefined, true)],
  },
  solve: (g) => configure(g, 'fila', { visibilityTimeout: 10 }),
  sim: { seed: 71, duration: 120 },
  goals: [{ type: 'processedAll' }, { type: 'noDuplicates' }],
  stars: { p95: 25 },
});

const l8 = defineLevel('i08', {
  story:
    'O visibility timeout está certo, mas mesmo assim alguns clientes foram cobrados duas vezes. O site às vezes reenvia o pedido quando a rede oscila, e a fila Standard garante entrega "pelo menos uma vez" — ou seja, às vezes mais de uma.',
  objective: 'Nenhum cliente pode ser cobrado duas vezes.',
  hint: 'Você não controla a rede nem a garantia da fila Standard. O que dá para fazer é tornar o consumidor idempotente: processar o mesmo pedido duas vezes tem o mesmo efeito que processar uma.',
  lesson: [
    'A fila Standard entrega cada mensagem pelo menos uma vez (at-least-once): duplicatas são raras, mas acontecem.',
    'Produtores também geram duplicatas (retry depois de um timeout de rede).',
    'A solução robusta é a idempotência: guarde um ID do pedido (ex.: numa tabela DynamoDB com escrita condicional) e ignore o que já foi processado.',
    'Filas FIFO têm deduplicação (exactly-once processing dentro de uma janela de 5 min), mas com limite de vazão e custo maiores.',
  ],
  quiz: [
    {
      question: 'Qual a garantia de entrega da fila SQS Standard?',
      options: ['Exatamente uma vez', 'Pelo menos uma vez (at-least-once)', 'No máximo uma vez'],
      answer: 1,
      explanation: 'Standard: at-least-once e ordem best-effort. FIFO: exactly-once processing e ordem por grupo.',
    },
    {
      question: 'O que torna um consumidor idempotente?',
      options: ['Processar mais rápido', 'Registrar o ID do pedido e ignorar pedidos já processados', 'Usar batch de 10 mensagens'],
      answer: 1,
      explanation: 'Idempotência = repetir a operação não muda o resultado. Normalmente com uma chave de idempotência persistida.',
    },
  ],
  concepts: ['idempotency', 'visibility'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 2, total: 40, retryRate: 0.1 }),
      Q('fila', 'fila-cobranca', 0, 0),
      C('cobranca', 'Cobrança', 7, 0, { processingTime: 0.3, workers: 2 }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'cobranca', undefined, true)],
  },
  solve: (g) => configure(g, 'cobranca', { idempotent: true }),
  sim: { seed: 81, duration: 90, standardDupRate: 0.08 },
  goals: [{ type: 'processedAll', consumer: 'cobranca' }, { type: 'noDuplicates' }],
  stars: { p95: 3 },
});

const l9 = defineLevel('i09', {
  story:
    'O banco digital processa movimentações de conta: depósito, saque, depósito… Se um saque for processado antes do depósito anterior, o cliente fica negativo sem motivo. Cada cubo é colorido pelo cliente (MessageGroupId).',
  objective: 'As movimentações de cada cliente devem ser processadas na ordem em que foram feitas.',
  hint: 'A fila Standard tem ordem "best-effort" e dois consumidores em paralelo embaralham ainda mais. Selecione a fila e mude o tipo para FIFO: ela garante ordem por MessageGroupId.',
  lesson: [
    'A fila FIFO garante ordem dentro de cada MessageGroupId (aqui, um grupo por cliente).',
    'Enquanto uma mensagem de um grupo está em voo, as próximas do mesmo grupo esperam. Grupos diferentes são processados em paralelo.',
    'Escolha o group ID com cuidado: um grupo só = tudo em série; um grupo por entidade (cliente, conta) = paralelismo com ordem.',
    'Na AWS não dá para converter uma fila Standard em FIFO: crie uma nova (o nome precisa terminar em .fifo).',
    'Repare na latência: ordem tem preço. Mensagens do mesmo grupo esperam umas pelas outras, e filas FIFO têm limite de vazão menor que as Standard.',
  ],
  quiz: [
    {
      question: 'Em uma fila FIFO, a ordem é garantida…',
      options: ['Globalmente, para a fila toda', 'Dentro de cada MessageGroupId', 'Só se houver um único consumidor'],
      answer: 1,
      explanation: 'A ordem é por grupo. Mensagens de grupos diferentes podem ser processadas em paralelo e em qualquer ordem relativa.',
    },
    {
      question: 'É possível transformar uma fila Standard existente em FIFO?',
      options: ['Sim, alterando o atributo FifoQueue', 'Não; é preciso criar uma nova fila com nome terminando em .fifo'],
      answer: 1,
      explanation: 'O tipo é definido na criação e não pode ser alterado.',
    },
  ],
  concepts: ['fifo'],
  palette: [],
  graph: {
    nodes: [
      P('app', 'App do banco', -7, 0, { rate: 3, total: 45, groups: 3, dedupId: true }),
      Q('fila', 'movimentacoes', 0, 0),
      C('ext1', 'Extrato 1', 7, -2, { processingTime: 0.6, jitter: 0.8, workers: 2 }),
      C('ext2', 'Extrato 2', 7, 2, { processingTime: 0.6, jitter: 0.8, workers: 2 }),
    ],
    edges: [E('app', 'fila', undefined, true), E('fila', 'ext1', undefined, true), E('fila', 'ext2', undefined, true)],
  },
  solve: (g) => configure(g, 'fila', { fifo: true }),
  sim: { seed: 91, duration: 90 },
  goals: [{ type: 'processedAll' }, { type: 'noOutOfOrder' }],
  stars: { p95: 11 },
  highlightGroups: true,
});

const l10 = defineLevel('i10', {
  story:
    'O sistema funciona, mas a conta da AWS assustou: milhares de requisições ReceiveMessage, quase todas voltando vazias. Os três consumidores perguntam "tem mensagem?" sem parar (short polling).',
  objective: 'Processe todos os pedidos usando no máximo 300 chamadas de API.',
  hint: 'Com long polling (WaitTimeSeconds > 0), o ReceiveMessage espera até chegar mensagem (até 20 s) em vez de voltar vazio na hora. Ajuste o "Wait time" de cada consumidor.',
  lesson: [
    'O SQS cobra por requisição (incluindo as que voltam vazias). Um bloco de até 64 KB conta como uma requisição.',
    'Short polling (WaitTimeSeconds = 0) responde na hora e consulta só parte dos servidores; pode voltar vazio mesmo havendo mensagens.',
    'Long polling (1 a 20 s) espera chegar mensagem, consulta todos os servidores e reduz drasticamente as respostas vazias.',
    'Dá para ativar long polling na fila (ReceiveMessageWaitTimeSeconds) ou em cada chamada (WaitTimeSeconds).',
  ],
  quiz: [
    {
      question: 'Qual o valor máximo de WaitTimeSeconds no long polling?',
      options: ['5 segundos', '20 segundos', '60 segundos'],
      answer: 1,
      explanation: 'O long polling vai de 1 a 20 s. Com 0 é short polling.',
    },
    {
      question: 'Qual a principal vantagem do long polling?',
      options: ['Garante a ordem', 'Reduz respostas vazias, custo e latência de detecção', 'Aumenta o visibility timeout'],
      answer: 1,
      explanation: 'Menos chamadas vazias = menos custo. E a mensagem é devolvida assim que chega.',
    },
  ],
  concepts: ['longpoll', 'batch'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 0.2, total: 20 }),
      Q('fila', 'fila-pedidos', 0, 0),
      C('c1', 'Separação 1', 7, -3, { processingTime: 0.3, waitTime: 0 }),
      C('c2', 'Separação 2', 7, 0, { processingTime: 0.3, waitTime: 0 }),
      C('c3', 'Separação 3', 7, 3, { processingTime: 0.3, waitTime: 0 }),
    ],
    edges: [
      E('site', 'fila', undefined, true),
      E('fila', 'c1', undefined, true),
      E('fila', 'c2', undefined, true),
      E('fila', 'c3', undefined, true),
    ],
  },
  solve: (g) => {
    for (const c of ['c1', 'c2', 'c3']) configure(g, c, { waitTime: 20 });
  },
  sim: { seed: 101, duration: 120 },
  goals: [{ type: 'processedAll' }, { type: 'maxApiCalls', max: 300 }],
  stars: { p95: 3, apiCalls: 120 },
});

// ═══════════════════════════ TRILHA CERTIFICAÇÃO ═══════════════════════════

const c1 = defineLevel('c01', {
  story:
    'O banco quer que cada movimentação vá para o Saldo e para as Notificações, e os dois precisam respeitar a ordem de cada cliente. Cada consumidor roda com 2 workers em paralelo.',
  objective: 'Os dois sistemas recebem todas as movimentações, em ordem por cliente.',
  hint: 'Para ordem com fan-out você precisa de um tópico SNS FIFO, e ele só entrega para filas SQS FIFO. Ajuste o tipo das peças no inspetor antes de conectar.',
  lesson: [
    'Tópicos SNS FIFO preservam a ordem por MessageGroupId e deduplicam, assim como as filas FIFO.',
    'Tópico FIFO só aceita filas SQS FIFO como assinantes; fila FIFO só pode assinar tópico FIFO.',
    'O nome do tópico FIFO também precisa terminar em .fifo.',
  ],
  quiz: [
    {
      question: 'Um tópico SNS FIFO pode entregar para…',
      options: ['Qualquer tipo de assinante (Lambda, HTTP, e-mail, SQS)', 'Somente filas SQS FIFO', 'Somente filas SQS Standard'],
      answer: 1,
      explanation: 'Assinaturas de tópicos FIFO são limitadas a filas SQS FIFO.',
    },
  ],
  concepts: ['fifo', 'dedup'],
  palette: [
    { kind: 'topic', label: 'Tópico SNS', name: 'movimentacoes', count: 1 },
    { kind: 'queue', label: 'Fila SQS', name: 'fila', count: 2 },
  ],
  graph: {
    nodes: [
      P('app', 'App do banco', -8, 0, { rate: 2, total: 30, groups: 2, dedupId: true }),
      C('saldo', 'Saldo', 8, -3, { processingTime: 0.5, jitter: 0.6, workers: 2 }),
      C('notif', 'Notificações', 8, 3, { processingTime: 0.5, jitter: 0.6, workers: 2 }),
    ],
    edges: [],
  },
  solve: (g) => {
    add(g, T('t', 'movimentacoes.fifo', -3, 0, { fifo: true }));
    add(g, Q('q1', 'saldo.fifo', 3, -3, { fifo: true }));
    add(g, Q('q2', 'notificacoes.fifo', 3, 3, { fifo: true }));
    link(g, 'app', 't');
    link(g, 't', 'q1');
    link(g, 't', 'q2');
    link(g, 'q1', 'saldo');
    link(g, 'q2', 'notif');
  },
  sim: { seed: 111, duration: 90 },
  goals: [
    { type: 'processedAll', consumer: 'saldo' },
    { type: 'processedAll', consumer: 'notif' },
    { type: 'noOutOfOrder' },
  ],
  stars: { p95: 4 },
  highlightGroups: true,
});

const c2 = defineLevel('c02', {
  story:
    'O consumidor vai ficar fora do ar por 90 segundos para manutenção (do segundo 20 ao 110). Alguém configurou a retenção da fila no mínimo possível: 60 segundos.',
  objective: 'Nenhuma mensagem pode se perder durante a manutenção.',
  hint: 'Mensagens mais velhas que o MessageRetentionPeriod são apagadas pelo SQS, mesmo sem nunca terem sido lidas. Aumente a retenção.',
  lesson: [
    'MessageRetentionPeriod vai de 60 s a 14 dias; o padrão é 4 dias.',
    'Mensagens que passam do período são apagadas silenciosamente: não vão para a DLQ.',
    'Numa DLQ, a idade conta a partir do envio original (na fila Standard), então a retenção da DLQ costuma ser maior que a da origem.',
  ],
  quiz: [
    {
      question: 'Qual o período máximo de retenção de mensagens no SQS?',
      options: ['4 dias', '7 dias', '14 dias'],
      answer: 2,
      explanation: 'De 1 minuto a 14 dias, com padrão de 4 dias.',
    },
    {
      question: 'Uma mensagem expirou pela retenção. Para onde ela vai?',
      options: ['Para a DLQ', 'É apagada', 'Volta para o produtor'],
      answer: 1,
      explanation: 'Expirar pela retenção apaga a mensagem; a DLQ só recebe mensagens que excederam o maxReceiveCount.',
    },
  ],
  concepts: ['retention'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 0.5, total: 60 }),
      Q('fila', 'fila-pedidos', 0, 0, { retention: 60 }),
      C('sep', 'Separação', 7, 0, { processingTime: 0.3, workers: 2, outages: [{ from: 20, to: 110 }] }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'sep', undefined, true)],
  },
  solve: (g) => configure(g, 'fila', { retention: 345600 }),
  sim: { seed: 121, duration: 200 },
  goals: [{ type: 'noLost' }, { type: 'processedAll', consumer: 'sep' }],
  stars: {},
});

const c3 = defineLevel('c03', {
  story:
    'Novo requisito do negócio: o cliente pode cancelar o pedido nos primeiros 10 segundos. Nenhum pedido pode ser faturado antes disso.',
  objective: 'Nenhum pedido pode ser processado em menos de 10 segundos.',
  hint: 'Uma delay queue (DelaySeconds) esconde cada mensagem nova por um tempo antes de ela ficar visível.',
  lesson: [
    'DelaySeconds (0 a 900 s = 15 min) atrasa a primeira entrega de cada mensagem.',
    'Na fila Standard, também dá para definir DelaySeconds por mensagem (message timer). Em filas FIFO só vale o delay da fila.',
    'Não confunda: delay esconde a mensagem ANTES da primeira entrega; visibility timeout esconde DEPOIS de recebida.',
  ],
  quiz: [
    {
      question: 'Qual a diferença entre delay queue e visibility timeout?',
      options: [
        'Nenhuma, são a mesma coisa',
        'Delay esconde antes da primeira entrega; visibility esconde depois de recebida',
        'Delay é só para FIFO',
      ],
      answer: 1,
      explanation: 'Delay atrasa a entrega inicial; visibility timeout protege a mensagem enquanto um consumidor a processa.',
    },
    {
      question: 'Qual o máximo de DelaySeconds?',
      options: ['60 s', '15 min', '12 h'],
      answer: 1,
      explanation: '900 segundos (15 minutos). Para atrasos maiores, use EventBridge Scheduler ou Step Functions.',
    },
  ],
  concepts: ['delay'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 1, total: 20 }),
      Q('fila', 'fila-faturamento', 0, 0),
      C('fat', 'Faturamento', 7, 0, { processingTime: 0.3, workers: 2 }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'fat', undefined, true)],
  },
  solve: (g) => configure(g, 'fila', { delaySeconds: 10 }),
  sim: { seed: 131, duration: 90 },
  goals: [{ type: 'processedAll', consumer: 'fat' }, { type: 'minLatency', seconds: 10 }],
  stars: { p95: 13 },
});

const c4 = defineLevel('c04', {
  story:
    'Para economizar, o time passou a ler lotes de 10 mensagens. Cada mensagem leva ~0,5 s, então um lote inteiro leva ~5 s… mas o visibility timeout é de 4 s. Pedidos começaram a duplicar.',
  objective: 'Sem duplicatas e com no máximo 200 chamadas de API.',
  hint: 'O visibility timeout começa a contar no ReceiveMessage para TODAS as mensagens do lote. Ele precisa cobrir o lote inteiro, não só uma mensagem.',
  lesson: [
    'MaxNumberOfMessages vai de 1 a 10. Lotes reduzem chamadas (e custo), mas o lote inteiro precisa caber no visibility timeout.',
    'DeleteMessageBatch apaga até 10 mensagens numa única chamada.',
    'Regra prática: visibility timeout > tamanho do lote × tempo por mensagem, com folga.',
  ],
  quiz: [
    {
      question: 'Quantas mensagens um ReceiveMessage retorna no máximo?',
      options: ['1', '10', '100'],
      answer: 1,
      explanation: 'MaxNumberOfMessages vai de 1 a 10.',
    },
    {
      question: 'Lote de 10 mensagens, 6 s por mensagem, processamento sequencial. Qual visibility timeout evita reentrega?',
      options: ['30 s', '60 s', 'Mais de 60 s, com folga (ex.: 90 s)'],
      answer: 2,
      explanation: 'O lote leva ~60 s; o timeout vale para todas as mensagens desde o recebimento, então precisa ser maior que isso.',
    },
  ],
  concepts: ['batch', 'visibility', 'longpoll'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 4, total: 80 }),
      Q('fila', 'fila-pedidos', 0, 0, { visibilityTimeout: 4 }),
      C('sep', 'Separação', 7, 0, { processingTime: 0.5, jitter: 0.1, workers: 2, batchSize: 10 }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'sep', undefined, true)],
  },
  solve: (g) => configure(g, 'fila', { visibilityTimeout: 30 }),
  sim: { seed: 141, duration: 120 },
  goals: [{ type: 'processedAll', consumer: 'sep' }, { type: 'noDuplicates' }, { type: 'maxApiCalls', max: 200 }],
  stars: {},
});

const c5 = defineLevel('c05', {
  story:
    'O app manda pedidos para uma fila FIFO, mas todo envio está falhando! E, quando funcionar, o app às vezes reenvia o mesmo pedido (retry de rede). O consumidor NÃO é idempotente e não pode ser alterado.',
  objective: 'Nenhum pedido perdido e nenhum processado duas vezes.',
  hint: 'Toda mensagem para uma fila FIFO precisa de um ID de deduplicação: ou o produtor manda MessageDeduplicationId, ou a fila usa ContentBasedDeduplication (hash SHA-256 do corpo).',
  lesson: [
    'Filas FIFO deduplicam mensagens com o mesmo deduplication ID dentro de uma janela de 5 minutos.',
    'O ID vem do MessageDeduplicationId ou, com ContentBasedDeduplication, do hash SHA-256 do corpo.',
    'Sem nenhum dos dois, o SendMessage para FIFO falha.',
    'A deduplicação protege contra retries do produtor; duplicatas causadas por visibility timeout e consumidores ainda exigem cuidado.',
  ],
  quiz: [
    {
      question: 'Qual é a janela de deduplicação de uma fila FIFO?',
      options: ['1 minuto', '5 minutos', '24 horas'],
      answer: 1,
      explanation: 'Mensagens com o mesmo deduplication ID enviadas em até 5 minutos são aceitas, mas não entregues de novo.',
    },
  ],
  concepts: ['dedup'],
  palette: [],
  graph: {
    nodes: [
      P('app', 'App de pedidos', -7, 0, { rate: 1, total: 30, groups: 2, retryRate: 0.25 }),
      Q('fila', 'pedidos.fifo', 0, 0, { fifo: true }),
      C('fat', 'Faturamento', 7, 0, { processingTime: 0.3 }),
    ],
    edges: [E('app', 'fila', undefined, true), E('fila', 'fat', undefined, true)],
  },
  solve: (g) => configure(g, 'fila', { contentDedup: true }),
  sim: { seed: 151, duration: 90 },
  goals: [{ type: 'noLost' }, { type: 'noDuplicates' }, { type: 'processedAll', consumer: 'fat' }],
  stars: { p95: 3 },
  highlightGroups: true,
});

const c6 = defineLevel('c06', {
  story:
    'O processamento de pedidos agora é uma função Lambda ligada à fila (event source mapping), com lotes de 10. Quando chega um pedido venenoso, a função lança um erro e… o lote INTEIRO volta para a fila. Pedidos bons são cobrados de novo e, depois de 3 tentativas, vão parar na DLQ junto com o venenoso.',
  objective: 'Só os pedidos venenosos podem ir para a DLQ, e nenhum pedido pode ser cobrado duas vezes.',
  hint: 'Ative "Report batch item failures" na Lambda: a função passa a devolver só os IDs das mensagens que falharam, e o resto do lote é apagado.',
  lesson: [
    'Com SQS como origem, a Lambda recebe um lote; se a função lançar erro, nenhuma mensagem do lote é apagada e todas voltam após o visibility timeout.',
    'Com ReportBatchItemFailures, a função devolve { batchItemFailures: [{ itemIdentifier }] } e só essas mensagens voltam para a fila.',
    'Lote menor (batch size 1) também resolve, mas multiplica invocações e chamadas.',
    'A AWS recomenda visibility timeout da fila de pelo menos 6× o timeout da função, para cobrir os retries do próprio poller.',
  ],
  quiz: [
    {
      question: 'Uma Lambda com batch size 10 lança exceção no 7º registro. O que acontece por padrão?',
      options: [
        'Os 6 primeiros são apagados e só os outros 4 voltam',
        'Nenhuma mensagem é apagada: o lote inteiro volta após o visibility timeout',
        'O lote vai direto para a DLQ',
      ],
      answer: 1,
      explanation: 'Sem ReportBatchItemFailures, a invocação é tratada como falha do lote inteiro.',
    },
    {
      question: 'O timeout da função é 30 s. Qual visibility timeout a AWS recomenda para a fila?',
      options: ['30 s', 'Pelo menos 180 s (6×)', '12 horas'],
      answer: 1,
      explanation: 'A recomendação é pelo menos 6× o timeout da função.',
    },
  ],
  concepts: ['lambda', 'batch'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -8, 0, { rate: 6, total: 60, poisonRate: 0.08 }),
      Q('fila', 'fila-pedidos', -1, 0, { visibilityTimeout: 60, maxReceiveCount: 3, dlq: 'dlq' }),
      Q('dlq', 'fila-pedidos-dlq', -1, 4),
      L('fn', 'cobrar-pedido', 6, 0, { batchSize: 10, maxConcurrency: 2, processingTime: 0.5, timeout: 10 }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'fn', undefined, true)],
  },
  solve: (g) => configure<'lambda'>(g, 'fn', { reportBatchItemFailures: true }),
  sim: { seed: 171, duration: 400 },
  goals: [{ type: 'processedAll', consumer: 'fn' }, { type: 'noDuplicates' }, { type: 'poisonToDlq' }, { type: 'noGoodInDlq' }],
  stars: { p95: 12, apiCalls: 150 },
});

const c7 = defineLevel('c07', {
  story:
    'Na promoção relâmpago, a fila encheu e a Lambda fez o que sabe fazer: escalou. Só que cada invocação abre uma conexão com o banco de dados, que aguenta no máximo 4 ao mesmo tempo. O resto é recusado.',
  objective: 'O banco nunca pode receber mais conexões do que aguenta.',
  hint: 'Configure a concorrência máxima do event source mapping (MaximumConcurrency). Ela limita quantos lotes a fila entrega à função ao mesmo tempo, sem precisar mexer na concorrência reservada da função.',
  lesson: [
    'Com SQS, o event source mapping começa com alguns pollers e escala enquanto houver mensagens na fila.',
    'MaximumConcurrency (2 a 1.000) limita quantas invocações simultâneas o mapeamento dispara, protegendo recursos como bancos de dados.',
    'Antes dela existir, o comum era usar concorrência reservada (reserved concurrency), mas isso gera throttling e mensagens voltando para a fila.',
    'A fila absorve o excesso: com concorrência limitada, as mensagens só esperam um pouco mais.',
  ],
  quiz: [
    {
      question: 'Qual configuração limita as invocações simultâneas disparadas por uma fila SQS sem causar throttling na função?',
      options: ['Reserved concurrency da função', 'MaximumConcurrency do event source mapping', 'Batch size'],
      answer: 1,
      explanation: 'MaximumConcurrency é aplicada no mapeamento: o poller simplesmente não busca mais lotes do que o limite.',
    },
  ],
  concepts: ['lambda'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -8, 0, { rate: 1, total: 120, bursts: [{ at: 5, duration: 6, multiplier: 15 }] }),
      Q('fila', 'fila-pedidos', -1, 0, { visibilityTimeout: 60 }),
      L('fn', 'gravar-pedido', 6, 0, { batchSize: 5, processingTime: 0.4, timeout: 10, dbLimit: 4 }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'fn', undefined, true)],
  },
  solve: (g) => configure<'lambda'>(g, 'fn', { maxConcurrency: 4 }),
  sim: { seed: 181, duration: 200 },
  goals: [{ type: 'noDbOverload' }, { type: 'processedAll', consumer: 'fn' }],
  stars: { p95: 20 },
});

const c8 = defineLevel('c08', {
  story:
    'Gerar a nota fiscal leva de meio segundo a quase 8 segundos, e o visibility timeout da fila é de 5 s. Notas saem duplicadas. Aumentar o timeout para 60 s resolveria… mas o serviço reinicia de vez em quando, e aí os pedidos que estavam com ele ficariam um minuto parados.',
  objective: 'Nenhuma nota duplicada e nenhum pedido esperando mais de 25 s.',
  hint: 'Mantenha o timeout curto e ative o heartbeat: enquanto processa, o consumidor chama ChangeMessageVisibility para estender o prazo. Se ele cair, o heartbeat para e a mensagem volta rápido.',
  lesson: [
    'ChangeMessageVisibility muda o visibility timeout de uma mensagem já recebida (contando a partir de agora).',
    'O padrão "heartbeat" estende o prazo periodicamente enquanto o processamento continua: timeout curto para falhas, sem duplicar trabalho longo.',
    'Também dá para usar ChangeMessageVisibility com 0 para devolver uma mensagem imediatamente à fila.',
    'O total de visibilidade de uma mensagem não pode passar de 12 horas desde o primeiro recebimento.',
  ],
  quiz: [
    {
      question: 'O processamento varia de 1 s a 10 min. Qual a melhor estratégia?',
      options: [
        'Visibility timeout de 12 h para nunca duplicar',
        'Timeout curto + ChangeMessageVisibility periódico enquanto processa',
        'Short polling',
      ],
      answer: 1,
      explanation: 'Um timeout enorme deixa a mensagem presa por horas se o consumidor morrer. O heartbeat combina segurança e recuperação rápida.',
    },
    {
      question: 'O que ChangeMessageVisibility com VisibilityTimeout = 0 faz?',
      options: ['Apaga a mensagem', 'Torna a mensagem visível de novo imediatamente', 'Desativa a fila'],
      answer: 1,
      explanation: 'É um jeito de "devolver" uma mensagem à fila sem esperar o prazo.',
    },
  ],
  concepts: ['visibility', 'heartbeat'],
  palette: [],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 0.6, total: 40 }),
      Q('fila', 'fila-notas', 0, 0, { visibilityTimeout: 5 }),
      C('nf', 'Emissor de NF', 7, 0, { processingTime: 4, jitter: 0.9, workers: 3, outages: [{ from: 30, to: 33 }] }),
    ],
    edges: [E('site', 'fila', undefined, true), E('fila', 'nf', undefined, true)],
  },
  solve: (g) => configure<'consumer'>(g, 'nf', { heartbeat: true }),
  sim: { seed: 191, duration: 200 },
  goals: [{ type: 'processedAll', consumer: 'nf' }, { type: 'noDuplicates' }, { type: 'maxLatency', seconds: 25 }],
  stars: { p95: 12 },
});

const c9 = defineLevel('c09', {
  story:
    'Além do Estoque, um parceiro de entregas recebe cada pedido por um webhook HTTPS assinado no tópico. Ele vai ficar fora do ar por 35 segundos. O SNS tenta entregar de novo algumas vezes, mas depois desiste e o pedido some.',
  objective: 'Nenhum pedido pode se perder, nem mesmo os do parceiro.',
  hint: 'Assinaturas SNS também podem ter DLQ (RedrivePolicy da assinatura). Coloque uma fila e escolha-a como "DLQ da assinatura" na conexão tópico → Parceiro (selecione o tópico).',
  lesson: [
    'O SNS retenta entregas que falham conforme a delivery policy. Para HTTP/S, o padrão é 3 retries com 20 s de intervalo; para SQS e Lambda, a AWS tenta por muito mais tempo.',
    'Esgotadas as tentativas, a mensagem é descartada, a menos que a assinatura tenha uma DLQ (fila SQS) configurada na RedrivePolicy.',
    'A DLQ é da ASSINATURA, não do tópico: cada assinante pode ter a sua.',
    'Se o destino aceitasse ler uma fila, o melhor seria SNS → SQS → consumidor, e a própria fila seguraria as mensagens.',
  ],
  quiz: [
    {
      question: 'Onde se configura a DLQ para entregas do SNS que falharam?',
      options: ['No tópico', 'Na assinatura (RedrivePolicy da subscription)', 'No produtor'],
      answer: 1,
      explanation: 'Cada assinatura pode ter a sua DLQ; ela recebe as mensagens que esgotaram os retries daquela entrega.',
    },
    {
      question: 'A DLQ de uma assinatura SNS precisa ser…',
      options: ['Outro tópico SNS', 'Uma fila SQS (FIFO se o tópico for FIFO)', 'Um bucket S3'],
      answer: 1,
      explanation: 'É sempre uma fila SQS, do mesmo tipo do tópico.',
    },
  ],
  concepts: ['snsdlq'],
  palette: [{ kind: 'queue', label: 'Fila SQS (DLQ)', name: 'parceiro-dlq', count: 1 }],
  graph: {
    nodes: [
      P('site', 'Site da loja', -8, 0, { rate: 1, total: 40 }),
      T('topico', 'pedidos-criados', -3, 0),
      Q('fila', 'fila-estoque', 3, -3),
      C('estoque', 'Estoque', 8, -3, { processingTime: 0.3 }),
      C('parceiro', 'Parceiro (HTTPS)', 8, 3, { processingTime: 0.3, workers: 3, httpOnly: true, outages: [{ from: 10, to: 45 }] }),
    ],
    edges: [E('site', 'topico', undefined, true), E('topico', 'fila', undefined, true), E('fila', 'estoque', undefined, true), E('topico', 'parceiro', undefined, true)],
  },
  solve: (g) => {
    add(g, Q('dlq', 'parceiro-dlq', 3, 6));
    setEdge(g, 'topico', 'parceiro', { dlq: 'dlq' });
  },
  sim: { seed: 201, duration: 120 },
  goals: [{ type: 'noLost' }, { type: 'processedAll', consumer: 'estoque' }],
  stars: {},
});

const c10 = defineLevel('c10', {
  story:
    'A fila FIFO de pedidos tem três consumidores, mas só um trabalha por vez. O motivo: todo pedido é enviado com o mesmo MessageGroupId, "pedidos". A ordem só importa entre pedidos do mesmo cliente.',
  objective: 'Mantenha a ordem por cliente e a latência p95 em até 8 s.',
  hint: 'Selecione o produtor e use um MessageGroupId por cliente. Grupos diferentes são entregues em paralelo.',
  lesson: [
    'Em FIFO, mensagens do mesmo grupo são entregues uma de cada vez: um grupo único transforma a fila em fila indiana.',
    'Use como group ID a entidade cuja ordem importa (cliente, conta, pedido). Mais grupos = mais paralelismo.',
    'Cotas FIFO: 300 transações/s por ação sem lote (até 3.000 mensagens/s com lotes de 10). O high throughput mode aumenta muito esse limite, distribuindo por MessageGroupId.',
  ],
  quiz: [
    {
      question: 'Uma fila FIFO tem 10 consumidores, mas todas as mensagens usam o mesmo MessageGroupId. Quantas são processadas ao mesmo tempo?',
      options: ['10', '1', 'Depende do batch size'],
      answer: 1,
      explanation: 'Enquanto uma mensagem do grupo está em voo, as seguintes do mesmo grupo não são entregues.',
    },
    {
      question: 'Sem lotes, qual é a cota padrão de uma fila FIFO (sem high throughput)?',
      options: ['300 transações por segundo por ação de API', 'Ilimitada', '10 mensagens por segundo'],
      answer: 0,
      explanation: '300 TPS por ação (SendMessage, ReceiveMessage, DeleteMessage); com lotes de 10 chega a 3.000 mensagens/s.',
    },
  ],
  concepts: ['groups'],
  palette: [],
  graph: {
    nodes: [
      P('app', 'App de pedidos', -7, 0, { rate: 3, total: 60, groups: 1, dedupId: true }),
      Q('fila', 'pedidos.fifo', 0, 0, { fifo: true }),
      C('c1', 'Separação 1', 7, -3, { processingTime: 0.8, jitter: 0.3 }),
      C('c2', 'Separação 2', 7, 0, { processingTime: 0.8, jitter: 0.3 }),
      C('c3', 'Separação 3', 7, 3, { processingTime: 0.8, jitter: 0.3 }),
    ],
    edges: [E('app', 'fila', undefined, true), E('fila', 'c1', undefined, true), E('fila', 'c2', undefined, true), E('fila', 'c3', undefined, true)],
  },
  solve: (g) => configure<'producer'>(g, 'app', { groups: 6 }),
  sim: { seed: 211, duration: 150 },
  goals: [{ type: 'processedAll' }, { type: 'noOutOfOrder' }, { type: 'maxP95', seconds: 8 }],
  stars: { p95: 6 },
  highlightGroups: true,
});

const c11 = defineLevel('c11', {
  story:
    'Alguns pedidos agora vêm com o PDF da nota fiscal anexado: cerca de 3 MB. O SendMessage desses pedidos falha com MessageTooLong e eles se perdem.',
  objective: 'Nenhum pedido perdido, inclusive os com anexo.',
  hint: 'O SQS aceita no máximo 1 MiB por mensagem. Ative o Extended Client no produtor: o anexo vai para o S3 e a mensagem leva só a referência.',
  lesson: [
    'O tamanho máximo de uma mensagem SQS é 1 MiB (até agosto de 2025 era 256 KB, número que ainda aparece em muitos materiais). No SNS, o limite é 256 KB.',
    'Cada bloco de 64 KB do payload é cobrado como uma requisição: uma mensagem de 256 KB custa 4.',
    'Para payloads maiores, guarde o conteúdo no S3 e envie a referência ("claim check"). O Extended Client Library (Java/Python) faz isso de forma transparente.',
    'Criptografia: SSE-SQS (chaves gerenciadas pelo SQS, padrão em filas novas) ou SSE-KMS (chave do KMS, com controle e auditoria da chave).',
  ],
  quiz: [
    {
      question: 'Como enviar um arquivo de 5 MB "pelo" SQS?',
      options: ['Aumentar o limite da fila', 'Guardar o arquivo no S3 e enviar a referência (ex.: Extended Client)', 'Dividir em várias filas'],
      answer: 1,
      explanation: 'O limite de 1 MiB não é configurável para cima; o padrão é o claim check com S3.',
    },
    {
      question: 'Quantas requisições são cobradas por um SendMessage de 200 KB?',
      options: ['1', '4', '200'],
      answer: 1,
      explanation: 'Cada bloco de 64 KB conta como uma requisição: 200 KB = 4 blocos.',
    },
    {
      question: 'Você precisa auditar o uso da chave de criptografia da fila no CloudTrail. Qual opção?',
      options: ['SSE-SQS', 'SSE-KMS', 'Nenhuma, o SQS não criptografa'],
      answer: 1,
      explanation: 'Com SSE-KMS você usa uma chave do KMS, com políticas próprias e chamadas registradas no CloudTrail.',
    },
  ],
  concepts: ['payload'],
  palette: [],
  graph: {
    nodes: [
      P('loja', 'Loja', -7, 0, { rate: 1, total: 30, largeRate: 0.25, largeKb: 3000 }),
      Q('fila', 'fila-pedidos', 0, 0),
      C('fiscal', 'Fiscal', 7, 0, { processingTime: 0.4 }),
    ],
    edges: [E('loja', 'fila', undefined, true), E('fila', 'fiscal', undefined, true)],
  },
  solve: (g) => configure<'producer'>(g, 'loja', { extendedClient: true }),
  sim: { seed: 221, duration: 90 },
  goals: [{ type: 'noLost' }, { type: 'processedAll', consumer: 'fiscal' }],
  stars: { p95: 3 },
});

const c12 = defineLevel('c12', {
  story:
    'A loja cresceu. Cada pedido (livro, eletrônico ou roupa) vai para três sistemas. Faturamento exige ordem por cliente e nenhuma cobrança duplicada. Estoque só cuida de eletrônicos e roupas. Analytics quer tudo. E ainda chegam pedidos venenosos.',
  objective: 'Cumpra todos os requisitos ao mesmo tempo.',
  hint: 'Ordem → FIFO de ponta a ponta (tópico e filas). Filtro na assinatura do Estoque. Venenosas → uma DLQ FIFO por fila, e um visibility timeout curto para não travar o grupo por muito tempo.',
  lesson: [
    'Arquiteturas reais combinam padrões: fan-out com SNS, filtros por assinatura, FIFO onde a ordem importa e DLQ em todas as filas.',
    'Em filas FIFO, uma mensagem venenosa bloqueia o seu grupo até ir para a DLQ: o visibility timeout e o maxReceiveCount definem quanto tempo o grupo fica parado.',
    'Monitore as DLQs com alarmes do CloudWatch (ApproximateNumberOfMessagesVisible > 0).',
  ],
  quiz: [
    {
      question: 'Em uma fila FIFO, uma mensagem que sempre falha…',
      options: [
        'Não afeta as outras mensagens',
        'Bloqueia as próximas mensagens do mesmo MessageGroupId até ser apagada ou ir para a DLQ',
        'Bloqueia a fila inteira para sempre',
      ],
      answer: 1,
      explanation: 'Só o grupo dela fica parado. Por isso a DLQ (com maxReceiveCount baixo) é ainda mais importante em FIFO.',
    },
  ],
  concepts: ['fifo', 'dedup', 'filter', 'dlq', 'visibility', 'idempotency'],
  palette: [
    { kind: 'topic', label: 'Tópico SNS', name: 'pedidos', count: 1 },
    { kind: 'queue', label: 'Fila SQS', name: 'fila', count: 6 },
  ],
  graph: {
    nodes: [
      P('loja', 'Loja', -9, 0, { rate: 2, total: 45, groups: 3, dedupId: true, poisonRate: 0.08, types: LIVRO_ELETRO_ROUPA }),
      C('fat', 'Faturamento', 9, -5, { processingTime: 0.4, jitter: 0.5, workers: 2 }),
      C('estoque', 'Estoque', 9, 0, { processingTime: 0.4, interest: ['eletronico', 'roupa'] }),
      C('analytics', 'Analytics', 9, 5, { processingTime: 0.2 }),
    ],
    edges: [],
  },
  solve: (g) => {
    add(g, T('t', 'pedidos.fifo', -4, 0, { fifo: true }));
    const subs: [string, string, string, number][] = [
      ['qf', 'faturamento.fifo', 'fat', -5],
      ['qe', 'estoque.fifo', 'estoque', 0],
      ['qa', 'analytics.fifo', 'analytics', 5],
    ];
    for (const [id, name, consumer, z] of subs) {
      add(g, Q(`${id}-dlq`, name.replace('.fifo', '-dlq.fifo'), 1, z + 2, { fifo: true }));
      add(g, Q(id, name, 3, z, { fifo: true, visibilityTimeout: 3, maxReceiveCount: 2, dlq: `${id}-dlq` }));
      link(g, 't', id, consumer === 'estoque' ? { tipo: ['eletronico', 'roupa'] } : undefined);
      link(g, id, consumer);
    }
    link(g, 'loja', 't');
  },
  sim: { seed: 161, duration: 240 },
  goals: [
    { type: 'processedAll', consumer: 'fat' },
    { type: 'processedAll', consumer: 'estoque' },
    { type: 'processedAll', consumer: 'analytics' },
    { type: 'noOutOfOrder' },
    { type: 'noDuplicates' },
    { type: 'noWrongDelivery' },
    { type: 'poisonToDlq' },
  ],
  stars: { p95: 9 },
});

/** Fases fechadas para visitantes, na ordem do catálogo. */
export const CONTENT_LEVELS: Level[] = [l3, l4, l5, l6, l7, l8, l9, l10, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12];

const BY_ID = new Map([...FREE_LEVELS, ...CONTENT_LEVELS].map((l) => [l.id, l]));

/** Todas as fases das trilhas, na ordem do catálogo (para o servidor e os testes). */
export const ALL_LEVELS: Level[] = CATALOG.map((m) => {
  const level = BY_ID.get(m.id);
  if (!level) throw new Error(`fase ${m.id} está no catálogo mas não tem conteúdo`);
  return level;
});

export function levelById(id: string): Level | undefined {
  return id === 'sandbox' ? sandbox : BY_ID.get(id);
}
