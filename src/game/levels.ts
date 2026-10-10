import { ALL_CONCEPTS } from './catalog';
import { add, C, defineLevel, E, link, LIVRO_ELETRO_ROUPA, P, Q, unlink, type Level } from './level-types';

/*
 * Fases que vão no bundle: as abertas para visitantes e o sandbox. Funcionam mesmo sem o servidor.
 * As demais ficam em `content/levels.ts` e só chegam pela API, para quem tem conta.
 */

// ═══════════════════════════ TRILHA INICIANTE ═══════════════════════════

const l1 = defineLevel('i01', {
  story:
    'A loja online "Bits & Bytes" acabou de abrir. O site (produtor) gera pedidos e o setor de Separação (consumidor) prepara as caixas. Hoje eles não se falam.',
  objective: 'Coloque uma fila SQS entre o site e a Separação e ligue tudo.',
  hint: 'Clique em "Fila SQS" na paleta e depois no chão. Selecione o produtor, clique em "Conectar" e depois na fila. Faça o mesmo da fila para o consumidor.',
  lesson: [
    'O produtor envia para a fila (SendMessage) e segue a vida; ele não precisa saber quem vai processar.',
    'O consumidor busca mensagens na fila (ReceiveMessage), processa e apaga (DeleteMessage).',
    'Isso é desacoplamento: produtor e consumidor podem cair, escalar ou mudar sem afetar o outro.',
  ],
  quiz: [
    {
      question: 'No SQS, quem inicia a entrega da mensagem para o consumidor?',
      options: ['A fila empurra a mensagem para o consumidor', 'O consumidor busca a mensagem (pull) com ReceiveMessage', 'O produtor chama o consumidor diretamente'],
      answer: 1,
      explanation: 'SQS é pull: o consumidor faz ReceiveMessage. Quem empurra (push) é o SNS.',
    },
    {
      question: 'Depois de processar uma mensagem com sucesso, o consumidor deve…',
      options: ['Não fazer nada; a fila apaga sozinha', 'Chamar DeleteMessage com o receipt handle', 'Reenviar a mensagem para a fila'],
      answer: 1,
      explanation: 'Receber não apaga. Se o consumidor não chamar DeleteMessage, a mensagem volta a ficar visível quando o visibility timeout acabar.',
    },
  ],
  concepts: [],
  palette: [{ kind: 'queue', label: 'Fila SQS', name: 'fila-pedidos', count: 1 }],
  graph: {
    nodes: [P('site', 'Site da loja', -7, 0, { rate: 1, total: 15 }), C('separacao', 'Separação', 7, 0, { processingTime: 0.6 })],
    edges: [],
  },
  solve: (g) => {
    add(g, Q('fila', 'fila-pedidos', 0, 0));
    link(g, 'site', 'fila');
    link(g, 'fila', 'separacao');
  },
  sim: { seed: 11, duration: 60 },
  goals: [{ type: 'processedAll', consumer: 'separacao' }, { type: 'noLost' }],
  stars: { p95: 4 },
});

const l2 = defineLevel('i02', {
  story:
    'Hoje é Black Friday. O site chama o Faturamento diretamente (uma chamada HTTP síncrona). Quando chega um pico, o Faturamento fica ocupado e os pedidos são recusados — e perdidos.',
  objective: 'Não perca nenhum pedido durante o pico.',
  hint: 'Rode uma vez para ver o problema. Depois selecione a conexão direta (no inspetor do produtor) e remova-a. Coloque uma fila no meio: ela guarda os pedidos enquanto o consumidor trabalha.',
  lesson: [
    'Uma fila funciona como buffer: absorve picos de tráfego que o consumidor não consegue atender na hora.',
    'O consumidor processa no próprio ritmo; os pedidos esperam na fila em vez de serem perdidos.',
    'A fila padrão do SQS não tem limite prático de mensagens armazenadas.',
  ],
  quiz: [
    {
      question: 'O que acontece com as mensagens quando o consumidor é mais lento que o produtor?',
      options: ['Elas são perdidas', 'Elas acumulam na fila até serem processadas (ou até expirar a retenção)', 'O SQS desacelera o produtor automaticamente'],
      answer: 1,
      explanation: 'A fila acumula. Elas só somem se passarem do MessageRetentionPeriod (padrão de 4 dias, máximo de 14).',
    },
  ],
  concepts: [],
  palette: [{ kind: 'queue', label: 'Fila SQS', name: 'fila-faturamento', count: 1 }],
  graph: {
    nodes: [
      P('site', 'Site da loja', -7, 0, { rate: 0.5, total: 40, bursts: [{ at: 8, duration: 10, multiplier: 8 }] }),
      C('faturamento', 'Faturamento', 7, 0, { processingTime: 0.7 }),
    ],
    edges: [E('site', 'faturamento')],
  },
  solve: (g) => {
    unlink(g, 'site', 'faturamento');
    add(g, Q('fila', 'fila-faturamento', 0, 0));
    link(g, 'site', 'fila');
    link(g, 'fila', 'faturamento');
  },
  sim: { seed: 21, duration: 90 },
  goals: [{ type: 'noLost' }, { type: 'processedAll', consumer: 'faturamento' }],
  stars: { p95: 30 },
});

// ═══════════════════════════ SANDBOX ═══════════════════════════

export const sandbox = defineLevel('sandbox', {
  story: 'Tudo liberado. Monte qualquer arquitetura, mude o produtor e experimente.',
  objective: 'Experimente à vontade.',
  hint: 'Selecione o produtor para mudar taxa, tipos, grupos, venenosas e retries.',
  lesson: [],
  quiz: [],
  concepts: ALL_CONCEPTS,
  palette: [
    { kind: 'producer', label: 'Produtor', name: 'Produtor', count: 4 },
    { kind: 'topic', label: 'Tópico SNS', name: 'topico', count: 10 },
    { kind: 'queue', label: 'Fila SQS', name: 'fila', count: 20 },
    { kind: 'consumer', label: 'Consumidor', name: 'Consumidor', count: 20 },
    { kind: 'lambda', label: 'Função Lambda', name: 'funcao', count: 10 },
  ],
  graph: {
    nodes: [{ ...P('p1', 'Produtor', -7, 0, { rate: 1, total: 30, types: LIVRO_ELETRO_ROUPA }), locked: false }],
    edges: [],
  },
  solve: () => {},
  sim: { seed: 1, duration: 300 },
  goals: [],
  stars: {},
});

/** Fases das trilhas que vêm no bundle. */
export const FREE_LEVELS: Level[] = [l1, l2];
