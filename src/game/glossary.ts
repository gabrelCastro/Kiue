export type GlossaryService = 'fila' | 'topico' | 'funcao' | 'geral';

export interface GlossaryEntry {
  term: string;
  service: GlossaryService;
  text: string;
}

/** Selo de cada verbete no glossário. */
export const SERVICE_LABEL: Record<GlossaryService, string> = {
  fila: 'Fila',
  topico: 'Tópico',
  funcao: 'Função',
  geral: 'Geral',
};

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'Fila (queue)', service: 'fila', text: 'Armazena mensagens até um consumidor buscá-las. Desacopla quem produz de quem processa e absorve picos.' },
  { term: 'Tópico (topic)', service: 'topico', text: 'Canal de publish/subscribe. Cada mensagem publicada é entregue (push) a todas as assinaturas. Não armazena mensagens.' },
  { term: 'Assinatura (subscription)', service: 'topico', text: 'Liga um tópico a um destino (fila, função, HTTP, e-mail…). Pode ter filter policy própria.' },
  { term: 'Fan-out', service: 'geral', text: 'Padrão tópico → várias filas: cada sistema recebe a sua cópia e processa no próprio ritmo.' },
  { term: 'Consumidores concorrentes', service: 'fila', text: 'Vários consumidores lendo a mesma fila dividem as mensagens; cada mensagem vai para um só.' },
  { term: 'Receive (receber)', service: 'fila', text: 'Busca de 1 a 10 mensagens. Elas não são apagadas: ficam invisíveis durante o visibility timeout.' },
  { term: 'Delete (apagar)', service: 'fila', text: 'Apaga a mensagem usando o receipt handle do último recebimento. Deve ser feito depois de processar com sucesso.' },
  { term: 'Receipt handle', service: 'fila', text: 'Identificador de um recebimento específico. Cada novo recebimento gera um handle novo; para apagar, use o mais recente.' },
  { term: 'Visibility timeout', service: 'fila', text: 'Tempo em que a mensagem recebida fica invisível para os outros consumidores. Padrão comum de 30 s, máximo de 12 h. Pode ser estendido enquanto o consumidor trabalha.' },
  { term: 'Em voo (in flight)', service: 'fila', text: 'Mensagem recebida, ainda não apagada e dentro do visibility timeout.' },
  { term: 'Dead-letter queue (DLQ)', service: 'fila', text: 'Fila que recebe as mensagens que falharam mais vezes que o máximo de recebimentos. Serve para investigar e reprocessar.' },
  { term: 'Máximo de recebimentos', service: 'fila', text: 'Quantas vezes uma mensagem pode ser recebida antes de ir para a DLQ (parte da política de redrive).' },
  { term: 'Mensagem venenosa (poison)', service: 'geral', text: 'Mensagem que sempre faz o consumidor falhar. Sem DLQ, ela volta para a fila para sempre.' },
  { term: 'At-least-once', service: 'fila', text: 'Garantia da fila Standard: cada mensagem é entregue pelo menos uma vez, às vezes mais. Exige consumidores idempotentes.' },
  { term: 'Idempotência', service: 'geral', text: 'Processar a mesma mensagem duas vezes tem o mesmo efeito que processar uma. Normalmente usa um ID gravado com escrita condicional.' },
  { term: 'Fila Standard', service: 'fila', text: 'Vazão praticamente ilimitada, entrega at-least-once e ordem best-effort.' },
  { term: 'Fila FIFO', service: 'fila', text: 'Ordem garantida por grupo de mensagens e deduplicação numa janela de alguns minutos; vazão limitada.' },
  { term: 'ID do grupo (group ID)', service: 'fila', text: 'Em FIFO, define o escopo da ordem. Mensagens do mesmo grupo são entregues em ordem, uma de cada vez; grupos diferentes vão em paralelo.' },
  { term: 'ID de deduplicação', service: 'fila', text: 'Em FIFO, mensagens com o mesmo ID dentro da janela de deduplicação são aceitas, mas não entregues de novo.' },
  { term: 'Deduplicação por conteúdo', service: 'fila', text: 'Em FIFO, usa um hash do corpo como ID de deduplicação quando o produtor não envia um.' },
  { term: 'Filter policy', service: 'topico', text: 'Regra na assinatura que filtra mensagens pelos atributos (ou pelo corpo). Lista = OU; chaves diferentes = E. Operadores comuns: diferente de, prefixo, numérico, existe…' },
  { term: 'Short polling', service: 'fila', text: 'Wait time = 0. Responde na hora; gera muitas respostas vazias (e cobradas).' },
  { term: 'Long polling', service: 'fila', text: 'Wait time de 1 a 20 s. Espera chegar mensagem antes de responder: menos chamadas vazias e menor custo.' },
  { term: 'Batch', service: 'fila', text: 'Operações em lote (até 10 mensagens) para enviar, receber e apagar. Reduz o número de chamadas e o custo.' },
  { term: 'Delay queue', service: 'fila', text: 'Atraso de entrega (0 a 900 s) que esconde cada mensagem nova antes da primeira entrega.' },
  { term: 'Retenção', service: 'fila', text: 'Período de retenção: de 60 s a 14 dias (padrão comum de 4 dias). Mensagens mais velhas são apagadas.' },
  { term: 'Tópico FIFO', service: 'topico', text: 'Mantém ordem por grupo e deduplica. Só entrega para filas FIFO.' },
  { term: 'Raw message delivery', service: 'topico', text: 'Entrega só o corpo da mensagem para a fila, sem o envelope com os metadados do tópico.' },
  { term: 'Função sob demanda', service: 'funcao', text: 'Código que a plataforma executa quando chega um evento (serverless): sobe instâncias conforme a demanda e cobra por invocação e tempo de execução.' },
  { term: 'Leitor da fila (poller)', service: 'funcao', text: 'Componente da plataforma que faz polling na fila e invoca a função com lotes de mensagens. Apaga o lote se a função terminar sem erro.' },
  { term: 'Falhas por item do lote', service: 'funcao', text: 'A função devolve os IDs das mensagens que falharam, e só elas voltam para a fila; o resto do lote é apagado.' },
  { term: 'Concorrência máxima', service: 'funcao', text: 'Limite (2 a 1.000) de invocações simultâneas que o leitor da fila pode disparar. Protege recursos a jusante sem throttling.' },
  { term: 'Cold start', service: 'funcao', text: 'Primeira invocação numa instância nova: antes de rodar o handler, a plataforma baixa o código e executa a inicialização (fora do handler). Soma latência, mas não entra no timeout da função.' },
  { term: 'Provisioned concurrency', service: 'funcao', text: 'Instâncias mantidas já iniciadas: atendem sem cold start. Cobradas por hora, mesmo paradas; o que passar delas escala sob demanda (com cold start).' },
  { term: 'Batching window', service: 'funcao', text: 'Janela (0 a 300 s) em que o leitor da fila espera juntar um lote cheio antes de invocar. Menos invocações e menor custo, em troca de latência.' },
  { term: 'Invocação assíncrona', service: 'funcao', text: 'Como um tópico aciona a função: o evento entra numa fila interna da plataforma e a chamada responde na hora. Se a função falhar, a plataforma tenta mais 2 vezes (configurável de 0 a 2), por até 6 horas.' },
  { term: 'Destino de falha (on-failure)', service: 'funcao', text: 'Para onde a plataforma manda o evento assíncrono que esgotou as tentativas: uma fila, um tópico, outra função ou um barramento de eventos. Vai junto o motivo do erro.' },
  { term: 'Concorrência reservada', service: 'funcao', text: 'Separa uma fatia da concorrência da conta só para a função e, ao mesmo tempo, é o teto dela. Acima disso, a invocação é recusada (throttling). Com 0, a função fica desligada.' },
  { term: 'Throttling', service: 'funcao', text: 'Invocação recusada por falta de concorrência. Com fila, o lote não é apagado e volta depois do visibility timeout (contando como recebimento: pode cair na DLQ). Em invocação assíncrona, a plataforma tenta de novo por até 6 h.' },
  { term: 'Regra dos 6×', service: 'fila', text: 'Com função sob demanda lendo a fila, use visibility timeout de pelo menos 6× o timeout da função.' },
  { term: 'Estender a visibilidade', service: 'fila', text: 'Altera o visibility timeout de uma mensagem já recebida, contando a partir de agora. Usado como heartbeat em processamentos longos; com 0, devolve a mensagem à fila na hora.' },
  { term: 'Política de entrega', service: 'topico', text: 'Regras de retry das entregas do tópico. Para HTTP/S, um padrão comum é 3 retries com 20 s; para filas e funções, tenta-se por muito mais tempo.' },
  { term: 'DLQ da assinatura', service: 'topico', text: 'Fila configurada na política de redrive de uma assinatura: recebe as mensagens que esgotaram os retries de entrega.' },
  { term: 'Tamanho máximo', service: 'geral', text: 'Neste jogo: 1 MiB por mensagem na fila e 256 KB no tópico. Cada bloco de 64 KB é cobrado como uma requisição. Os limites variam de serviço para serviço.' },
  { term: 'Claim check', service: 'geral', text: 'Padrão para payloads grandes: guarda o conteúdo num armazenamento de objetos (bucket) e envia só a referência pela fila.' },
  { term: 'Criptografia em repouso', service: 'fila', text: 'Com chave gerenciada pelo próprio serviço (o mais simples) ou com chave sua num serviço de chaves, que permite controlar quem usa a chave e auditar cada uso.' },
  { term: 'Cotas FIFO', service: 'fila', text: 'Neste jogo: 300 transações/s por operação (3.000 mensagens/s com lotes de 10). Modos de alta vazão aumentam muito o limite, distribuindo por grupo.' },
  { term: 'Latência p95', service: 'geral', text: '95% dos pedidos foram processados em até esse tempo (do envio até o fim do processamento).' },
];
