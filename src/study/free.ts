import { defineChapter } from './catalog';
import type { Chapter } from './types';

/*
 * Capítulos abertos para visitantes (vão no bundle, como as fases 1 e 2). Os demais ficam em
 * `content/study.ts` e só chegam pela API, para quem tem conta.
 */

const cap01 = defineChapter({
  id: 'cap01',
  blocks: [
    {
      t: 'p',
      text: 'Imagine uma loja on-line. O site recebe um pedido e precisa avisar o estoque, emitir a nota, cobrar o cartão e mandar o e-mail de confirmação. O jeito mais direto é o site chamar cada um desses sistemas na hora, um depois do outro. Funciona, até o dia em que um deles fica lento ou cai: o cliente espera, a página dá erro e o pedido se perde no meio do caminho.',
    },
    {
      t: 'p',
      text: 'Uma **{{fila|Fila (queue)}}** resolve isso colocando um intermediário entre quem produz o trabalho e quem o executa. O site (o **produtor**) só registra o pedido na fila e segue a vida. Do outro lado, o sistema de separação (o **consumidor**) busca os pedidos no ritmo dele, processa e avisa que terminou.',
    },
    { t: 'flow', steps: [{ label: 'Produtor' }, { label: 'Fila', kind: 'vis' }, { label: 'Consumidor' }], arrows: ['envia', 'busca'] },
    { t: 'h', text: 'Desacoplar' },
    {
      t: 'p',
      text: 'Com a fila no meio, produtor e consumidor não precisam estar no ar ao mesmo tempo, nem andar na mesma velocidade, nem saber um do outro. O produtor não sabe quem vai processar nem quantos consumidores existem. O consumidor não sabe de onde veio a mensagem. Cada lado pode ser trocado, escalado ou ficar fora do ar por um tempo sem derrubar o outro.',
    },
    {
      t: 'list',
      items: [
        '**Falha isolada**: se o consumidor cai, as mensagens esperam na fila em vez de se perderem.',
        '**Ritmos diferentes**: o produtor pode mandar 100 pedidos por segundo e o consumidor processar 10; a diferença vira fila.',
        '**Evolução independente**: dá para trocar o consumidor por uma versão nova sem mexer no site.',
      ],
    },
    { t: 'h', text: 'Absorver picos' },
    {
      t: 'p',
      text: 'Numa Black Friday, os pedidos chegam muito mais rápido do que o normal por algumas horas. Sem fila, o sistema de faturamento teria de aguentar o pico inteiro na hora, ou recusaria pedidos. Com fila, o pico vira **acúmulo**: a fila cresce durante a enxurrada e esvazia depois, quando o movimento cai. Ninguém é recusado; alguns pedidos só demoram mais para ser processados.',
    },
    {
      t: 'note',
      kind: 'pratica',
      text: 'Fila como buffer troca falha por espera. Isso é ótimo para trabalho que pode esperar alguns segundos ou minutos (faturar, enviar e-mail, gerar relatório) e ruim para o que o cliente precisa ver na hora (mostrar o saldo da conta).',
    },
    {
      t: 'p',
      text: 'Uma fila gerenciada Standard não tem limite prático de mensagens armazenadas: ela não "enche". O limite que importa é outro: quanto tempo cada mensagem pode ficar esperando (a retenção, assunto do capítulo 9). Se o acúmulo nunca diminui, o problema não é a fila, é falta de consumidores (capítulo 2).',
    },
    { t: 'h', text: 'Pull: o consumidor busca' },
    {
      t: 'p',
      text: 'Numa fila, quem inicia a entrega é o consumidor. Ele pergunta "tem mensagem?" (um **{{receive|Receive (receber)}}**), recebe algumas, processa e depois **{{apaga|Delete (apagar)}}** cada uma. Esse modelo se chama **pull**. O contrário, **push**, é quando o intermediário empurra a mensagem para o destino assim que ela chega; é o que faz um tópico (capítulo 3).',
    },
    {
      t: 'flow',
      steps: [{ label: 'visível', kind: 'vis' }, { label: 'em voo', kind: 'inv' }, { label: 'apagada', kind: 'ok' }],
      arrows: ['receive', 'delete'],
    },
    {
      t: 'p',
      text: 'Repare no detalhe que pega muita gente: **receber não apaga**. A mensagem recebida só fica invisível para os outros consumidores por um tempo. Se o consumidor terminar e não apagar, ela volta para a fila e é processada de novo. Esse mecanismo é o que garante que nada se perde quando um consumidor cai no meio do trabalho, e é o assunto do capítulo 4.',
    },
    {
      t: 'note',
      kind: 'cuidado',
      text: 'Esquecer o delete é um dos bugs mais comuns: tudo parece funcionar, mas cada mensagem é processada várias vezes, uma a cada vez que o tempo de invisibilidade acaba.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'A fila fica entre produtor e consumidor e guarda as mensagens até alguém processá-las.',
        'Ela desacopla os dois lados e transforma picos em acúmulo temporário.',
        'É pull: o consumidor busca (receive), processa e apaga (delete).',
        'Receber não apaga; sem o delete, a mensagem volta.',
      ],
    },
  ],
});

const cap02 = defineChapter({
  id: 'cap02',
  blocks: [
    {
      t: 'p',
      text: 'Uma fila acumulando sem parar quer dizer uma coisa simples: entra mais trabalho do que sai. Se o produtor envia 6 pedidos por segundo e o consumidor leva meio segundo para cada um, ele dá conta de 2 por segundo. A fila cresce 4 mensagens por segundo, para sempre.',
    },
    {
      t: 'p',
      text: 'A solução clássica é colocar **mais consumidores lendo a mesma fila**. Eles são chamados de **{{consumidores concorrentes|Consumidores concorrentes}}**: competem pelas mensagens, e cada mensagem vai para um só deles.',
    },
    { t: 'flow', steps: [{ label: 'Fila', kind: 'vis' }, { label: 'Consumidor A' }, { label: 'Consumidor B' }, { label: 'Consumidor C' }], arrows: ['msg 1', 'msg 2', 'msg 3'] },
    { t: 'h', text: 'Cada mensagem vai para um só' },
    {
      t: 'p',
      text: 'Quando o consumidor A recebe uma mensagem, ela fica invisível para B e C até A apagá-la (ou até o tempo de invisibilidade acabar). Por isso os três não fazem o mesmo trabalho em dobro: eles **dividem** a fila. Três consumidores iguais processam, em média, três vezes mais rápido que um.',
    },
    {
      t: 'note',
      kind: 'cuidado',
      text: 'Consumidores concorrentes dividem as mensagens; eles não recebem cópias. Se você precisa que três sistemas diferentes (estoque, nota fiscal, e-mail) vejam o mesmo pedido, isso é fan-out com tópico, assunto do capítulo 3.',
    },
    { t: 'h', text: 'Quantos consumidores?' },
    {
      t: 'p',
      text: 'A conta é a mesma de uma fila de supermercado. Para a fila parar de crescer, a vazão dos consumidores precisa ser pelo menos igual à taxa de chegada:',
    },
    {
      t: 'table',
      head: ['Chegada', 'Tempo por mensagem', 'Um consumidor faz', 'Mínimo de consumidores'],
      rows: [
        ['2 por segundo', '0,5 s', '2 por segundo', '1'],
        ['6 por segundo', '0,5 s', '2 por segundo', '3'],
        ['6 por segundo', '1,5 s', '0,67 por segundo', '9'],
      ],
    },
    {
      t: 'p',
      text: 'O mínimo só empata: qualquer pico já faz a fila crescer de novo. Na prática se deixa folga, e o mais comum é **escalar conforme o tamanho da fila**: quando há muitas mensagens visíveis esperando, sobem mais consumidores; quando a fila esvazia, alguns são desligados. Esse é o jeito clássico de escalar um processamento com fila.',
    },
    {
      t: 'note',
      kind: 'pratica',
      text: 'A métrica para escalar é o número de mensagens visíveis na fila (o acúmulo), não o uso de CPU dos consumidores. Um consumidor esperando um banco lento pode estar com CPU baixa e mesmo assim a fila crescendo.',
    },
    { t: 'h', text: 'O que pode dar errado' },
    {
      t: 'list',
      items: [
        '**Ordem**: com vários consumidores em paralelo, as mensagens terminam fora da ordem em que chegaram. Quando a ordem importa, veja as filas FIFO (capítulo 7).',
        '**Recurso compartilhado**: dez consumidores podem derrubar um banco que aguentava dois. Escalar o consumidor desloca o gargalo para o próximo sistema (capítulo 10 mostra como limitar).',
        '**Duplicatas**: um consumidor lento pode perder o prazo de invisibilidade e outro recebe a mesma mensagem. Por isso consumidores precisam ser idempotentes (capítulo 6).',
      ],
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Vários consumidores na mesma fila dividem o trabalho; cada mensagem vai para um só.',
        'Para a fila não crescer, a vazão somada dos consumidores precisa cobrir a taxa de chegada, com folga.',
        'Escale pelo tamanho da fila.',
        'Mais paralelismo traz efeitos colaterais: ordem, recursos compartilhados e duplicatas.',
      ],
    },
  ],
});

export const FREE_CHAPTERS: Chapter[] = [cap01, cap02];
