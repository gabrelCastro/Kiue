import { defineChapter } from '../src/study/catalog';
import type { Chapter } from '../src/study/types';

/*
 * Capítulos da apostila que pedem conta. Este arquivo NÃO pode ser importado por nada em `src/`:
 * só o servidor o carrega e entrega pela API (`GET /api/study/:id`) para quem está logado.
 * O build confere que nenhum texto daqui foi parar no bundle (scripts/check-bundle.ts).
 */

const cap03 = defineChapter({
  id: 'cap03',
  blocks: [
    {
      t: 'p',
      text: 'Um pedido confirmado interessa a vários sistemas: o estoque precisa reservar o produto, o financeiro precisa emitir a nota e o atendimento precisa mandar o e-mail. Se o site colocar o pedido numa fila só e ligar os três sistemas nela, eles vão **dividir** os pedidos (capítulo 2): cada pedido chega a um só. Não é isso que se quer.',
    },
    {
      t: 'p',
      text: 'Um **{{tópico|Tópico (topic)}}** resolve. O produtor publica a mensagem uma vez; o tópico entrega uma **cópia para cada {{assinatura|Assinatura (subscription)}}**. Esse modelo é o publish/subscribe, e o tópico é **push**: ele empurra a cópia para cada destino assim que a mensagem chega.',
    },
    { t: 'flow', steps: [{ label: 'Produtor' }, { label: 'Tópico', kind: 'vis' }, { label: 'Fila do estoque' }, { label: 'Fila da nota' }, { label: 'Fila do e-mail' }], arrows: ['publica', 'cópia', 'cópia', 'cópia'] },
    { t: 'h', text: 'Fan-out: tópico na frente, uma fila por sistema' },
    {
      t: 'p',
      text: 'O tópico entrega na hora e **não guarda mensagens**. Se um assinante estiver fora do ar ou lento, o tópico não tem onde deixar a mensagem esperando. Por isso o padrão clássico é o **{{fan-out}}**: o tópico entrega para **filas**, uma por sistema, e cada sistema lê a sua fila no próprio ritmo.',
    },
    {
      t: 'list',
      items: [
        'Cada sistema tem a sua fila: um consumidor lento não atrasa os outros.',
        'Cada fila tem a sua configuração: visibility timeout, DLQ e retenção próprios.',
        'Sistema novo? Crie uma fila e assine o tópico. O produtor não muda nada.',
      ],
    },
    {
      t: 'note',
      kind: 'pratica',
      text: 'A fila precisa de uma permissão que deixe o tópico enviar mensagens para ela. Esquecer essa permissão é o motivo mais comum de "assinei o tópico e não chega nada".',
    },
    {
      t: 'p',
      text: 'Por padrão, o tópico entrega na fila um envelope com metadados (de qual tópico veio, quando foi publicado) e o corpo original dentro. Com **{{raw message delivery}}** ligado, a fila recebe só o corpo, como se o produtor tivesse enviado direto para ela.',
    },
    { t: 'h', text: 'Filter policy: cada um recebe só o que importa' },
    {
      t: 'p',
      text: 'Nem todo sistema quer todas as mensagens. O setor de livros só precisa dos pedidos de livros. Em vez de receber tudo e descartar o resto (pagando por cada mensagem descartada), a assinatura pode ter uma **{{filter policy}}**: uma regra sobre os atributos da mensagem que decide se aquela cópia é entregue.',
    },
    {
      t: 'table',
      head: ['Regra na assinatura', 'Entrega quando'],
      rows: [
        ['tipo = [livro]', 'o atributo tipo é livro'],
        ['tipo = [livro, eletronico]', 'tipo é livro **ou** eletronico (lista = OU)'],
        ['tipo = [livro] e prioridade = [alta]', 'as duas condições valem (chaves diferentes = E)'],
      ],
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'A filter policy fica na **assinatura**, não no tópico nem na fila. Um mesmo tópico pode ter assinaturas com filtros diferentes, e uma assinatura sem filtro recebe tudo.',
    },
    {
      t: 'p',
      text: 'Para o filtro funcionar, o produtor precisa enviar o atributo junto com a mensagem (por exemplo, tipo = livro). Filtrar pelo corpo também é possível, mas atributos são o caminho mais comum e mais barato.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Tópico é publish/subscribe e push: entrega uma cópia para cada assinatura e não guarda nada.',
        'Fan-out: tópico → uma fila por sistema → consumidores de cada fila.',
        'A filter policy fica na assinatura e decide quais cópias ela recebe.',
      ],
    },
  ],
});

const cap04 = defineChapter({
  id: 'cap04',
  blocks: [
    {
      t: 'p',
      text: 'Quando um consumidor recebe uma mensagem, a fila **não a apaga**. Ela só fica invisível para os outros consumidores durante um tempo: o **{{visibility timeout}}**. Nesse intervalo a mensagem está **{{em voo|Em voo (in flight)}}**. Se o consumidor terminar e apagar a mensagem dentro do prazo, pronto. Se não, ela volta a ficar visível e outro consumidor a recebe de novo.',
    },
    {
      t: 'flow',
      steps: [{ label: 'visível', kind: 'vis' }, { label: 'em voo', kind: 'inv' }, { label: 'apagada', kind: 'ok' }],
      arrows: ['receive', 'delete'],
    },
    {
      t: 'p',
      text: 'Esse desenho é o que garante que nada se perde: se o consumidor cair no meio do trabalho, ele nunca apaga, o prazo acaba e a mensagem volta para a fila sozinha. O preço é que o mesmo prazo vale para quem só está **demorando**.',
    },
    { t: 'h', text: 'Timeout curto demais' },
    {
      t: 'p',
      text: 'Se o processamento leva 40 segundos e o visibility timeout é 30, a mensagem reaparece no meio do trabalho. Outro consumidor a recebe e processa de novo. Quando o primeiro termina e tenta apagar, o apagar **falha**: cada recebimento gera um **{{receipt handle}}** novo, e só o do último recebimento vale.',
    },
    {
      t: 'table',
      head: ['Instante', 'Consumidor A', 'Consumidor B'],
      rows: [
        ['0 s', 'recebe (handle 1)', ''],
        ['30 s', 'ainda processando', 'recebe a mesma mensagem (handle 2)'],
        ['40 s', 'tenta apagar com o handle 1: falha', 'processando'],
        ['70 s', '', 'apaga com o handle 2'],
      ],
    },
    {
      t: 'p',
      text: 'Resultado: o pedido foi processado duas vezes. Com cobrança no meio, o cliente pagou duas vezes.',
    },
    {
      t: 'note',
      kind: 'pratica',
      text: 'O timeout precisa cobrir o **lote inteiro**, não uma mensagem: o prazo começa a contar no receive para todas as mensagens que vieram juntas. Lote de 10 com 3 s cada pede pelo menos 30 s, com folga.',
    },
    {
      t: 'p',
      text: 'O padrão costuma ser 30 s e o máximo, 12 horas. Mas aumentar demais tem custo: se o consumidor cair, a mensagem fica presa esse tempo todo antes de voltar.',
    },
    { t: 'h', text: 'Heartbeat: estender a visibilidade enquanto trabalha' },
    {
      t: 'p',
      text: 'Quando o tempo de processamento varia muito (um relatório leva 5 s, outro leva 5 min), não existe um timeout bom: curto, duplica os lentos; longo, prende as mensagens de quem caiu. A saída é **{{estender a visibilidade}}** enquanto o trabalho acontece: o consumidor usa um timeout curto e, de tempos em tempos, avisa "ainda estou nisso, me dá mais N segundos".',
    },
    {
      t: 'list',
      items: [
        'O novo prazo conta **a partir de agora**, não soma ao anterior.',
        'Renove antes de expirar, com folga (por exemplo, a cada 60% do prazo).',
        'Se o processo cair, o heartbeat para e a mensagem volta rápido.',
        'Mudar a visibilidade para 0 devolve a mensagem à fila na hora: útil para desistir de uma mensagem sem esperar o prazo.',
      ],
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Processamento longo e imprevisível → timeout curto + heartbeat (estender a visibilidade periodicamente). Timeout gigante "para garantir" é a resposta errada clássica.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Receber deixa a mensagem invisível pelo visibility timeout; só o delete a remove.',
        'Timeout menor que o processamento do lote causa processamento duplicado.',
        'Cada recebimento tem um receipt handle novo; o delete usa o mais recente.',
        'Tempo imprevisível: timeout curto + heartbeat.',
      ],
    },
  ],
});

const cap05 = defineChapter({
  id: 'cap05',
  blocks: [
    {
      t: 'p',
      text: 'Algumas mensagens nunca vão dar certo: um pedido com um campo que o consumidor não sabe ler, um cliente que não existe mais. O consumidor falha, não apaga, o visibility timeout acaba, a mensagem volta e falha de novo. Para sempre. Essa é a **{{mensagem venenosa|Mensagem venenosa (poison)}}**.',
    },
    {
      t: 'p',
      text: 'Além de gastar processamento à toa, ela ocupa consumidores que poderiam estar cuidando das mensagens boas e enche os logs de erro, escondendo os problemas novos.',
    },
    { t: 'h', text: 'DLQ: a fila das mensagens que falharam' },
    {
      t: 'p',
      text: 'A solução é uma **{{DLQ|Dead-letter queue (DLQ)}}** (dead-letter queue): uma fila comum, configurada como destino das mensagens que falharam vezes demais. A fila de origem conta quantas vezes cada mensagem foi recebida. Quando passa do **{{máximo de recebimentos}}**, a mensagem é movida para a DLQ em vez de ser entregue de novo.',
    },
    {
      t: 'flow',
      steps: [{ label: 'Fila de pedidos', kind: 'vis' }, { label: 'Consumidor' }, { label: 'DLQ', kind: 'bad' }],
      arrows: ['recebe e falha', 'depois de N recebimentos'],
    },
    {
      t: 'p',
      text: 'Essa regra (qual é a DLQ e qual é o máximo) é a **política de redrive** da fila de origem. A DLQ em si não tem nada de especial: é uma fila como outra qualquer, sem consumidor.',
    },
    {
      t: 'table',
      head: ['Máximo de recebimentos', 'Efeito'],
      rows: [
        ['1', 'uma falha passageira (banco piscou) já manda para a DLQ: agressivo demais'],
        ['3 a 5', 'tolera falhas passageiras e isola a venenosa em poucos minutos'],
        ['muito alto', 'a venenosa fica rodando por muito tempo antes de sair'],
      ],
    },
    {
      t: 'note',
      kind: 'cuidado',
      text: 'A retenção da DLQ conta a partir de quando a mensagem **entrou na fila de origem**, não de quando chegou na DLQ. Uma DLQ com a mesma retenção da origem pode apagar mensagens pouco depois de elas chegarem. Deixe a DLQ com retenção maior.',
    },
    { t: 'h', text: 'O que fazer com a DLQ' },
    {
      t: 'list',
      items: [
        '**Alarmar**: qualquer mensagem visível na DLQ é sinal de bug. Um alarme com limite "maior que 0" avisa na hora.',
        '**Investigar**: as mensagens ficam lá intactas, com o corpo e os atributos, para reproduzir o erro.',
        '**Reprocessar**: depois de corrigir o bug, o redrive devolve as mensagens da DLQ para a fila de origem.',
      ],
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Mensagem que expira pela retenção é apagada, não vai para a DLQ. A DLQ só recebe mensagens que passaram do máximo de recebimentos.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Mensagem venenosa falha sempre e volta para a fila para sempre.',
        'A DLQ isola essas mensagens depois de N recebimentos (política de redrive).',
        'Alarme na DLQ, investigação, correção e redrive de volta para a origem.',
      ],
    },
  ],
});

const cap06 = defineChapter({
  id: 'cap06',
  blocks: [
    {
      t: 'p',
      text: 'Uma **{{fila Standard}}** entrega cada mensagem **pelo menos uma vez**. Às vezes, mais de uma. Isso não é defeito: é o preço da vazão praticamente ilimitada e da tolerância a falhas. A garantia se chama **{{at-least-once}}**.',
    },
    { t: 'h', text: 'De onde vêm as duplicatas' },
    {
      t: 'list',
      items: [
        '**Visibility timeout curto**: o consumidor demora, a mensagem reaparece e outro processa (capítulo 4).',
        '**Consumidor cai depois de processar e antes de apagar**: o trabalho foi feito, mas a mensagem volta.',
        '**Produtor reenvia**: a rede falhou na resposta do envio, o SDK tentou de novo e a mensagem entrou duas vezes.',
        '**A própria fila**: em casos raros, um servidor da fila entrega uma cópia que já tinha sido entregue.',
      ],
    },
    {
      t: 'p',
      text: 'Dá para reduzir as duplicatas, mas não zerar. Por isso o caminho é o consumidor ser **{{idempotente|Idempotência}}**: processar a mesma mensagem duas vezes tem o mesmo efeito que processar uma.',
    },
    { t: 'h', text: 'Como ficar idempotente' },
    {
      t: 'p',
      text: 'O jeito mais comum é registrar um **identificador do trabalho** antes (ou junto) de fazer o efeito, numa tabela com escrita condicional ("insira se ainda não existir"). Se a inserção falhar porque o ID já existe, o trabalho já foi feito: o consumidor só apaga a mensagem e segue.',
    },
    {
      t: 'flow',
      steps: [{ label: 'recebe pedido 42' }, { label: 'já existe o 42?', kind: 'vis' }, { label: 'cobra e registra', kind: 'ok' }, { label: 'só apaga', kind: 'plain' }],
      arrows: ['', 'não', 'sim'],
    },
    {
      t: 'note',
      kind: 'cuidado',
      text: 'Use um ID do **negócio** (o número do pedido), não o ID da mensagem: se o produtor reenviar, a mensagem nova tem outro ID, mas é o mesmo pedido.',
    },
    {
      t: 'p',
      text: 'Algumas operações já são idempotentes por natureza: "definir o status do pedido como pago" pode rodar duas vezes sem problema; "somar 10 ao saldo" não. Sempre que der, prefira escrever o estado final em vez de aplicar um incremento.',
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Fila Standard: at-least-once e ordem best-effort. Se a pergunta fala em processamento duplicado numa fila Standard, a resposta envolve idempotência no consumidor (ou, se a ordem e a deduplicação forem requisitos, fila FIFO, capítulo 7).',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Fila Standard entrega pelo menos uma vez; duplicatas acontecem.',
        'Consumidor idempotente: o mesmo trabalho duas vezes tem o efeito de uma.',
        'Registre o ID do negócio com escrita condicional antes de aplicar o efeito.',
      ],
    },
  ],
});

const cap07 = defineChapter({
  id: 'cap07',
  blocks: [
    {
      t: 'p',
      text: 'Num banco, depósito e saque da mesma conta precisam ser processados na ordem em que aconteceram. Numa fila Standard, com vários consumidores, isso não é garantido: a ordem é best-effort e o paralelismo embaralha ainda mais. A **{{fila FIFO}}** garante ordem e deduplicação.',
    },
    { t: 'h', text: 'Ordem por grupo' },
    {
      t: 'p',
      text: 'A ordem da FIFO vale **dentro de cada grupo de mensagens**. Cada mensagem é enviada com um **{{ID de grupo|ID do grupo (group ID)}}** (por exemplo, o número da conta). Mensagens do mesmo grupo saem em ordem, **uma de cada vez**: a próxima só é entregue quando a anterior for apagada. Grupos diferentes são entregues em paralelo.',
    },
    {
      t: 'table',
      head: ['Fila', 'Mensagens', 'Entregues'],
      rows: [
        ['FIFO, grupo por cliente', 'cliente A: depósito, saque · cliente B: depósito', 'A em ordem, B em paralelo com A'],
        ['FIFO, um grupo só', 'todos os pedidos', 'um por vez, mesmo com 10 consumidores'],
      ],
    },
    {
      t: 'note',
      kind: 'cuidado',
      text: 'Um ID de grupo só para tudo transforma a FIFO numa fila de um consumidor: os outros ficam parados. Escolha o grupo pelo que realmente precisa de ordem (cliente, conta, pedido), não pela fila inteira.',
    },
    {
      t: 'p',
      text: 'Uma mensagem venenosa numa FIFO **bloqueia o grupo dela** até ser apagada ou ir para a DLQ. Por isso, em FIFO, a DLQ com máximo de recebimentos baixo é ainda mais importante.',
    },
    { t: 'h', text: 'Deduplicação' },
    {
      t: 'p',
      text: 'A FIFO descarta reenvios dentro de uma janela de 5 minutos. Para saber o que é reenvio, ela usa um **{{ID de deduplicação}}**, enviado pelo produtor, ou, com **{{deduplicação por conteúdo}}** ligada, um hash do corpo da mensagem. Sem nenhum dos dois, o envio para a FIFO falha.',
    },
    {
      t: 'note',
      kind: 'pratica',
      text: 'Deduplicação por conteúdo só funciona se reenvios tiverem exatamente o mesmo corpo. Se o corpo tem um carimbo de horário, cada reenvio é "diferente": nesse caso, mande um ID de deduplicação do negócio (pedido-42).',
    },
    { t: 'h', text: 'Tópico FIFO' },
    {
      t: 'p',
      text: 'Para fan-out com ordem, existe o **{{tópico FIFO}}**. Ele preserva a ordem por grupo e deduplica, e só entrega para **filas FIFO**. Do outro lado, fila FIFO só pode assinar tópico FIFO.',
    },
    { t: 'h', text: 'O custo: vazão' },
    {
      t: 'p',
      text: 'Ordem e deduplicação têm preço. Neste jogo, as **{{cotas FIFO}}** são 300 transações por segundo por operação (enviar, receber, apagar), ou 3.000 mensagens por segundo com lotes de 10. Modos de alta vazão aumentam muito o limite, distribuindo por grupo, o que é mais um motivo para usar vários grupos.',
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Não dá para converter uma fila Standard em FIFO: é preciso criar uma fila nova. E a ordem da FIFO é por grupo, nunca global.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'FIFO garante ordem dentro de cada grupo e entrega um por vez por grupo.',
        'Grupos diferentes vão em paralelo: escolha o grupo pelo que precisa de ordem.',
        'Deduplica numa janela de 5 min, por ID de deduplicação ou por conteúdo.',
        'Tópico FIFO só entrega para fila FIFO. A vazão é limitada.',
      ],
    },
  ],
});

const cap08 = defineChapter({
  id: 'cap08',
  blocks: [
    {
      t: 'p',
      text: 'Serviços de fila gerenciados cobram por **requisição**: cada envio, cada receive e cada delete. Inclusive o receive que volta vazio. Um consumidor que pergunta "tem mensagem?" sem parar numa fila quase vazia gera milhares de requisições por hora que não trazem nada, e todas entram na conta.',
    },
    { t: 'h', text: 'Short polling e long polling' },
    {
      t: 'table',
      head: ['', 'Short polling', 'Long polling'],
      rows: [
        ['Wait time', '0', '1 a 20 s'],
        ['Fila vazia', 'responde vazio na hora', 'espera chegar mensagem até o wait time'],
        ['Respostas vazias', 'muitas (e cobradas)', 'poucas'],
        ['Latência', 'igual', 'igual: a resposta volta assim que a mensagem chega'],
      ],
    },
    {
      t: 'p',
      text: 'Com **{{long polling}}**, o receive espera até chegar mensagem (até 20 s) em vez de voltar vazio na hora. Não piora a latência: assim que uma mensagem chega, a resposta sai. Com **{{short polling}}**, além das respostas vazias, a fila consulta só parte dos servidores e pode responder vazio mesmo havendo mensagens.',
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Muitas respostas vazias e conta alta → ligar long polling (wait time de até 20 s), na fila ou em cada chamada de receive.',
    },
    { t: 'h', text: 'Lotes' },
    {
      t: 'p',
      text: 'Um receive pode trazer de 1 a 10 mensagens, e enviar e apagar também têm versões em **{{lote|Batch}}** de até 10. Dez mensagens num lote custam uma requisição em vez de dez. É a outra grande alavanca de custo.',
    },
    {
      t: 'note',
      kind: 'cuidado',
      text: 'O visibility timeout começa a contar no receive para **todas** as mensagens do lote. Lote de 10 com 4 s cada leva 40 s: com timeout de 30 s, as últimas reaparecem antes de serem processadas (capítulo 4).',
    },
    {
      t: 'p',
      text: 'O tamanho também conta: neste jogo, cada bloco de 64 KB de uma mensagem é cobrado como uma requisição. Uma mensagem de 200 KB custa 4.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Cada requisição é cobrada, inclusive o receive vazio.',
        'Long polling (wait time até 20 s) elimina quase todas as respostas vazias sem piorar a latência.',
        'Lotes de até 10 dividem o custo por 10; o lote inteiro precisa caber no visibility timeout.',
      ],
    },
  ],
});

const cap09 = defineChapter({
  id: 'cap09',
  blocks: [
    { t: 'h', text: 'Retenção: quanto tempo a mensagem vive' },
    {
      t: 'p',
      text: 'Toda mensagem tem prazo de validade: a **{{retenção}}**, de 60 s a 14 dias (o padrão costuma ser 4 dias). Mensagens mais velhas que isso são **apagadas**, mesmo sem nunca terem sido lidas. Elas não vão para a DLQ.',
    },
    {
      t: 'p',
      text: 'Isso importa em paradas planejadas: se o consumidor vai ficar fora do ar durante uma manutenção de 5 dias, uma fila com retenção de 4 dias perde as mensagens do primeiro dia. A retenção precisa cobrir a parada mais longa que você aceita, com folga.',
    },
    { t: 'h', text: 'Delay queue: esperar antes de entregar' },
    {
      t: 'p',
      text: 'Às vezes uma mensagem não deve ser processada na hora: o e-mail "esqueceu algo no carrinho?" só faz sentido depois de alguns minutos. A **{{delay queue}}** esconde cada mensagem nova por um tempo (de 0 a 900 s, ou seja, até 15 min) antes da primeira entrega.',
    },
    {
      t: 'list',
      items: [
        'O atraso da fila vale para todas as mensagens novas.',
        'Na fila Standard, também dá para definir o atraso por mensagem (message timer).',
        'Para atrasos maiores que 15 min, use um agendador de eventos ou um orquestrador de workflows.',
      ],
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Delay queue atrasa a **primeira** entrega de cada mensagem; o visibility timeout esconde a mensagem **depois** de recebida. São coisas diferentes que confundem fácil.',
    },
    { t: 'h', text: 'Tamanho: o que não cabe na mensagem' },
    {
      t: 'p',
      text: 'Mensagens têm **{{tamanho máximo}}**: neste jogo, 1 MiB na fila e 256 KB no tópico. Um PDF de nota fiscal de 3 MB não cabe, e o envio falha com "mensagem grande demais". Limites assim existem em todo serviço de mensageria e mudam com o tempo: confira a documentação do serviço que você usa.',
    },
    {
      t: 'p',
      text: 'A saída é o padrão **{{claim check}}**: o produtor guarda o arquivo num armazenamento de objetos (um bucket) e manda pela fila só a **referência** (o caminho do arquivo). O consumidor lê a referência e busca o arquivo. Há bibliotecas que fazem isso de forma transparente acima de um certo tamanho.',
    },
    {
      t: 'flow',
      steps: [{ label: 'Produtor' }, { label: 'Bucket', kind: 'plain' }, { label: 'Fila', kind: 'vis' }, { label: 'Consumidor' }],
      arrows: ['grava o PDF', 'envia só a referência', 'lê e busca o PDF'],
    },
    { t: 'h', text: 'Criptografia em repouso' },
    {
      t: 'p',
      text: 'A **{{criptografia em repouso|Criptografia em repouso}}** protege as mensagens guardadas na fila. Há duas opções: chave gerenciada pelo próprio serviço (o mais simples, sem nada para administrar) ou uma chave sua num serviço de chaves, quando é preciso controlar quem pode usar a chave e auditar cada uso.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Retenção de 60 s a 14 dias; o que passa disso é apagado, não vai para a DLQ.',
        'Delay queue atrasa a primeira entrega em até 15 min.',
        'Payload grande: claim check (arquivo no bucket, referência na fila).',
        'Criptografia: chave do serviço (simples) ou chave sua (controle e auditoria).',
      ],
    },
  ],
});

const cap10 = defineChapter({
  id: 'cap10',
  blocks: [
    {
      t: 'p',
      text: 'Uma **{{função sob demanda}}** é código que a plataforma executa quando chega um evento: você não mantém servidores ligados, ela sobe instâncias conforme a demanda e cobra por invocação e tempo de execução. Ligada a uma fila, ela substitui os consumidores que você mantinha rodando.',
    },
    { t: 'h', text: 'O leitor da fila' },
    {
      t: 'p',
      text: 'A função não lê a fila sozinha. Um componente da plataforma, o **{{leitor da fila|Leitor da fila (poller)}}**, faz o long polling, junta as mensagens em **lotes** e invoca a função com cada lote. Se a função terminar sem erro, o leitor apaga o lote inteiro. Se der erro, não apaga nada: o lote todo volta depois do visibility timeout.',
    },
    {
      t: 'flow',
      steps: [{ label: 'Fila', kind: 'vis' }, { label: 'Leitor da fila' }, { label: 'Função' }],
      arrows: ['long polling', 'lote de até N'],
    },
    { t: 'h', text: 'Falha parcial do lote' },
    {
      t: 'p',
      text: 'Lote de 10, a 7ª mensagem é venenosa e a função lança erro. Por padrão, as 10 voltam para a fila, inclusive as 9 que já foram processadas. Elas são processadas (e cobradas) de novo e, depois de algumas voltas, as boas acabam na DLQ junto com a venenosa.',
    },
    {
      t: 'p',
      text: 'Com **{{falhas por item do lote}}** ligado, a função devolve a lista de IDs que falharam e o leitor apaga o resto. Só as mensagens que falharam voltam.',
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Lote com uma mensagem ruim derrubando as boas → reportar falhas por item do lote. Sem isso, a invocação é tratada como falha do lote inteiro.',
    },
    { t: 'h', text: 'A regra dos 6×' },
    {
      t: 'p',
      text: 'O leitor tenta de novo quando a invocação falha por limite de concorrência, e essas tentativas acontecem enquanto a mensagem está em voo. A recomendação é **visibility timeout da fila de pelo menos 6× o timeout da função** ({{regra dos 6×}}): função com timeout de 30 s pede fila com 180 s.',
    },
    { t: 'h', text: 'Concorrência máxima: proteger quem vem depois' },
    {
      t: 'p',
      text: 'Fila cheia, função escalando: ótimo, até cada instância abrir uma conexão com um banco que aguenta 4. A **{{concorrência máxima}}** do leitor da fila (de 2 a 1.000) limita quantas invocações simultâneas ele dispara. O leitor simplesmente não busca mais lotes do que o limite; as mensagens esperam na fila, que é exatamente o papel dela.',
    },
    {
      t: 'note',
      kind: 'cuidado',
      text: 'Concorrência reservada da função também limita, mas de outro jeito: as invocações acima do limite são recusadas (throttling), o lote volta para a fila e conta como recebimento, e mensagens boas podem acabar na DLQ (capítulo 11). Para limitar o que a fila dispara, use a concorrência máxima do leitor.',
    },
    { t: 'h', text: 'Batching window: juntar antes de invocar' },
    {
      t: 'p',
      text: 'Com tráfego pingado (3 mensagens por segundo), o leitor invoca assim que tem alguma coisa, e os lotes saem com 1 ou 2 mensagens. Muitas invocações, cada uma cobrada. A **{{batching window}}** (0 a 300 s) faz o leitor esperar até o lote encher ou a janela vencer, o que vier primeiro.',
    },
    {
      t: 'table',
      head: ['Batch size 10, chegam 3/s', 'Invocações por minuto', 'Espera extra'],
      rows: [
        ['sem janela', '~180 (lotes de 1)', 'nenhuma'],
        ['janela de 2 s', '~30 (lotes de ~6)', 'até 2 s'],
        ['janela de 5 s', '~18 (lotes cheios)', 'até ~3,3 s'],
      ],
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'O leitor da fila busca lotes e invoca a função; sucesso apaga o lote, erro devolve o lote.',
        'Falhas por item do lote: só as mensagens que falharam voltam.',
        'Visibility timeout da fila ≥ 6× o timeout da função.',
        'Concorrência máxima do leitor protege recursos a jusante sem throttling.',
        'Batching window troca um pouco de latência por bem menos invocações.',
      ],
    },
  ],
});

const cap11 = defineChapter({
  id: 'cap11',
  blocks: [
    { t: 'h', text: 'Cold start' },
    {
      t: 'p',
      text: 'Quando a função precisa de uma instância nova, a plataforma baixa o código e roda a inicialização (tudo o que está fora do handler: carregar bibliotecas, abrir conexões) antes de atender o primeiro evento. Essa primeira invocação lenta é o **{{cold start}}**. As próximas na mesma instância já são rápidas.',
    },
    {
      t: 'list',
      items: [
        'O cold start soma latência, mas **não entra no timeout** da função.',
        'Ele acontece quando a função escala (instância nova) e depois de um tempo parada (a instância esfria).',
        'Inicialização pesada fora do handler deixa o cold start mais longo, mas é reaproveitada nas invocações seguintes.',
      ],
    },
    { t: 'h', text: 'Instâncias provisionadas' },
    {
      t: 'p',
      text: 'Quando um pico é previsível (a loja abre às 9h), dá para manter instâncias **já iniciadas** esperando: a **{{provisioned concurrency}}**. Elas atendem sem cold start. O que passar delas escala sob demanda, com cold start.',
    },
    {
      t: 'note',
      kind: 'cuidado',
      text: 'Instâncias provisionadas são cobradas por hora, mesmo sem invocações. E valem para uma versão publicada da função, não para a versão em edição.',
    },
    { t: 'h', text: 'Concorrência reservada' },
    {
      t: 'p',
      text: 'A **{{concorrência reservada}}** faz duas coisas ao mesmo tempo: separa uma fatia da concorrência da conta só para a função (outras funções não podem usá-la) e é o **teto** dela. Com 0, a função fica desligada.',
    },
    { t: 'h', text: 'Throttling' },
    {
      t: 'p',
      text: 'Quando não há concorrência livre, a invocação é recusada: **{{throttling}}**. O que acontece depois depende de quem chamou:',
    },
    {
      t: 'table',
      head: ['Origem', 'O que acontece com o evento recusado'],
      rows: [
        ['Fila (leitor da fila)', 'o lote não é apagado e volta depois do visibility timeout, contando como recebimento: pode cair na DLQ'],
        ['Tópico (invocação assíncrona)', 'a plataforma guarda o evento e tenta de novo por até 6 h'],
      ],
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Concorrência reservada menor que o que a fila dispara → throttling → mensagens boas podem ir para a DLQ. Para limitar o consumo de uma fila, a resposta é a concorrência máxima do leitor (capítulo 10). Para eliminar cold start num pico previsível, provisioned concurrency.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Cold start: instância nova inicializando; soma latência, fora do timeout.',
        'Provisioned concurrency: instâncias prontas, sem cold start, cobradas por hora.',
        'Concorrência reservada: reserva e teto; acima dela, throttling.',
        'Throttling vindo de fila conta como recebimento; vindo de tópico, vira nova tentativa.',
      ],
    },
  ],
});

const cap12 = defineChapter({
  id: 'cap12',
  blocks: [
    {
      t: 'p',
      text: 'Um tópico pode entregar direto para uma função ou para um endpoint HTTPS, sem fila no meio. É mais simples, mas o comportamento em falhas muda bastante, e é aí que pedidos somem sem ninguém perceber.',
    },
    { t: 'h', text: 'Tópico → função: invocação assíncrona' },
    {
      t: 'p',
      text: 'O tópico invoca a função de forma **{{assíncrona|Invocação assíncrona}}**: a plataforma guarda o evento numa fila interna própria e já devolve "recebido" ao tópico. Para o tópico, a entrega deu certo. Se a função falhar, quem tenta de novo é a **plataforma**: até 2 vezes (configurável de 0 a 2), com intervalos crescentes, por até 6 horas.',
    },
    {
      t: 'flow',
      steps: [{ label: 'Tópico' }, { label: 'Fila interna', kind: 'inv' }, { label: 'Função' }, { label: 'Destino de falha', kind: 'bad' }],
      arrows: ['aceita na hora', 'até 3 tentativas', 'esgotou'],
    },
    {
      t: 'p',
      text: 'Esgotadas as tentativas, o evento é **descartado**, a menos que a função tenha um **{{destino de falha|Destino de falha (on-failure)}}**: para onde o evento é mandado junto com o motivo do erro (pode ser uma fila, um tópico, outra função ou um barramento de eventos).',
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Tópico → função falhando sempre: a DLQ da assinatura **não ajuda**, porque para o tópico a entrega deu certo. Quem precisa do destino de falha é a função.',
    },
    {
      t: 'p',
      text: 'A alternativa mais comum é colocar uma fila no meio: tópico → fila → função. A fila guarda as mensagens, permite lotes, e a DLQ dela pega as falhas (capítulos 5 e 10).',
    },
    { t: 'h', text: 'Tópico → endpoint HTTPS' },
    {
      t: 'p',
      text: 'Para um endpoint HTTPS (um parceiro que recebe webhooks), o tópico tenta entregar e, se o endpoint falhar ou demorar, tenta de novo conforme a **{{política de entrega}}**. Para HTTP/S, um padrão comum é 3 novas tentativas com 20 s de intervalo (no jogo, 5 s). Para filas e funções, tenta-se por muito mais tempo.',
    },
    {
      t: 'p',
      text: 'Esgotadas as tentativas, a mensagem é descartada, a menos que a **assinatura** tenha uma **{{DLQ da assinatura}}**: uma fila (do mesmo tipo do tópico) configurada na política de redrive da assinatura.',
    },
    {
      t: 'table',
      head: ['Destino do tópico', 'Quem tenta de novo', 'Onde ficam as falhas'],
      rows: [
        ['Fila', 'o tópico (por muito tempo)', 'raramente falha; depois, a DLQ da própria fila'],
        ['Endpoint HTTPS', 'o tópico, pela política de entrega', 'DLQ da assinatura'],
        ['Função', 'a plataforma da função', 'destino de falha da função'],
      ],
    },
    {
      t: 'note',
      kind: 'pratica',
      text: 'Se o destino aceitasse ler uma fila, o melhor seria tópico → fila → consumidor: a fila seguraria as mensagens durante a queda, sem limite de tentativas.',
    },
    { t: 'h', text: 'Resumo' },
    {
      t: 'list',
      items: [
        'Tópico → função é assíncrono: a plataforma tenta mais 2 vezes e depois usa o destino de falha (ou descarta).',
        'Tópico → HTTPS: o tópico tenta pela política de entrega e depois usa a DLQ da assinatura (ou descarta).',
        'Na dúvida, uma fila no meio resolve: guarda, permite lotes e tem DLQ.',
      ],
    },
  ],
});

const cap13 = defineChapter({
  id: 'cap13',
  blocks: [
    {
      t: 'p',
      text: 'Arquiteturas reais combinam quase tudo o que veio antes. Este capítulo é um checklist para desenhar (ou revisar) um fluxo de mensageria de ponta a ponta. Ele é a teoria do exame final.',
    },
    { t: 'h', text: 'Antes de desenhar' },
    {
      t: 'list',
      items: [
        '**Quem precisa da mensagem?** Um sistema: fila. Vários: tópico com uma fila por sistema (fan-out).',
        '**A ordem importa?** Só onde importa, e por qual chave: FIFO com grupo por cliente, conta ou pedido.',
        '**Duplicata é aceitável?** Quase nunca para dinheiro: consumidor idempotente, sempre.',
        '**Quanto pode esperar?** Defina a latência aceitável (por exemplo, p95 de 5 s) antes de escolher lotes e janelas.',
      ],
    },
    { t: 'h', text: 'Em cada fila' },
    {
      t: 'list',
      items: [
        'DLQ configurada, com máximo de recebimentos entre 3 e 5 (mais baixo em FIFO).',
        'Alarme na DLQ: mensagens visíveis > 0.',
        'Visibility timeout que cobre o lote inteiro (ou heartbeat, se o tempo varia).',
        'Retenção que cobre a maior parada aceitável; DLQ com retenção maior que a origem.',
        'Long polling ligado.',
      ],
    },
    { t: 'h', text: 'Em cada consumidor ou função' },
    {
      t: 'list',
      items: [
        'Idempotente pelo ID do negócio.',
        'Lotes com falha parcial reportada por item.',
        'Concorrência máxima do leitor quando há um recurso limitado a jusante.',
        'Visibility timeout da fila ≥ 6× o timeout da função.',
        'Cold start medido; provisionadas só se o pico for previsível e a latência importar.',
      ],
    },
    { t: 'h', text: 'Nas entregas sem fila' },
    {
      t: 'list',
      items: [
        'Tópico → HTTPS: DLQ da assinatura.',
        'Tópico → função: destino de falha da função.',
        'Ou: uma fila no meio.',
      ],
    },
    { t: 'h', text: 'Como saber se está bom' },
    {
      t: 'p',
      text: 'Três números contam a história: **nenhuma mensagem perdida**, **nenhum efeito duplicado** e a **{{latência p95}}** (95% dos pedidos processados em até esse tempo) dentro da meta. O custo vem logo atrás: chamadas de API e invocações.',
    },
    {
      t: 'note',
      kind: 'prova',
      text: 'Em perguntas de arquitetura, procure a palavra que define o requisito: "ordem" (FIFO e grupo), "vários sistemas" (fan-out), "não perder" (fila e DLQ), "duplicado" (idempotência), "custo" (long polling, lotes, batching window), "banco não aguenta" (concorrência máxima).',
    },
  ],
});

export const CONTENT_CHAPTERS: Chapter[] = [cap03, cap04, cap05, cap06, cap07, cap08, cap09, cap10, cap11, cap12, cap13];
