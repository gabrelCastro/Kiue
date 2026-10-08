export interface GlossaryEntry {
  term: string;
  service: 'SQS' | 'SNS' | 'Geral';
  text: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'Fila (queue)', service: 'SQS', text: 'Armazena mensagens até um consumidor buscá-las. Desacopla quem produz de quem processa e absorve picos.' },
  { term: 'Tópico (topic)', service: 'SNS', text: 'Canal de publish/subscribe. Cada mensagem publicada é entregue (push) a todas as assinaturas. Não armazena mensagens.' },
  { term: 'Assinatura (subscription)', service: 'SNS', text: 'Liga um tópico a um destino (fila SQS, Lambda, HTTP, e-mail…). Pode ter filter policy própria.' },
  { term: 'Fan-out', service: 'Geral', text: 'Padrão SNS → várias filas SQS: cada sistema recebe a sua cópia e processa no próprio ritmo.' },
  { term: 'Consumidores concorrentes', service: 'SQS', text: 'Vários consumidores lendo a mesma fila dividem as mensagens; cada mensagem vai para um só.' },
  { term: 'ReceiveMessage', service: 'SQS', text: 'Busca de 1 a 10 mensagens. Elas não são apagadas: ficam invisíveis durante o visibility timeout.' },
  { term: 'DeleteMessage', service: 'SQS', text: 'Apaga a mensagem usando o receipt handle do último recebimento. Deve ser chamado depois de processar com sucesso.' },
  { term: 'Receipt handle', service: 'SQS', text: 'Identificador de um recebimento específico. Cada novo recebimento gera um handle novo; para apagar, use o mais recente.' },
  { term: 'Visibility timeout', service: 'SQS', text: 'Tempo em que a mensagem recebida fica invisível para os outros consumidores. Padrão de 30 s, máximo de 12 h. Ajustável com ChangeMessageVisibility.' },
  { term: 'Em voo (in flight)', service: 'SQS', text: 'Mensagem recebida, ainda não apagada e dentro do visibility timeout.' },
  { term: 'Dead-letter queue (DLQ)', service: 'SQS', text: 'Fila que recebe as mensagens que falharam mais vezes que o maxReceiveCount. Serve para investigar e reprocessar.' },
  { term: 'maxReceiveCount', service: 'SQS', text: 'Quantas vezes uma mensagem pode ser recebida antes de ir para a DLQ (parte da RedrivePolicy).' },
  { term: 'Mensagem venenosa (poison)', service: 'Geral', text: 'Mensagem que sempre faz o consumidor falhar. Sem DLQ, ela volta para a fila para sempre.' },
  { term: 'At-least-once', service: 'SQS', text: 'Garantia da fila Standard: cada mensagem é entregue pelo menos uma vez, às vezes mais. Exige consumidores idempotentes.' },
  { term: 'Idempotência', service: 'Geral', text: 'Processar a mesma mensagem duas vezes tem o mesmo efeito que processar uma. Normalmente usa um ID gravado com escrita condicional.' },
  { term: 'Fila Standard', service: 'SQS', text: 'Vazão praticamente ilimitada, entrega at-least-once e ordem best-effort.' },
  { term: 'Fila FIFO', service: 'SQS', text: 'Ordem garantida por MessageGroupId e deduplicação em janela de 5 min. Nome termina em .fifo; vazão limitada (maior com high throughput mode).' },
  { term: 'MessageGroupId', service: 'SQS', text: 'Em FIFO, define o escopo da ordem. Mensagens do mesmo grupo são entregues em ordem, uma de cada vez; grupos diferentes vão em paralelo.' },
  { term: 'MessageDeduplicationId', service: 'SQS', text: 'Em FIFO, mensagens com o mesmo ID dentro de 5 min são aceitas, mas não entregues de novo.' },
  { term: 'ContentBasedDeduplication', service: 'SQS', text: 'Em FIFO, usa o hash SHA-256 do corpo como deduplication ID quando o produtor não envia um.' },
  { term: 'Filter policy', service: 'SNS', text: 'JSON na assinatura que filtra mensagens pelos atributos (ou pelo corpo). Lista = OU; chaves diferentes = E. Operadores: anything-but, prefix, numeric, exists…' },
  { term: 'Short polling', service: 'SQS', text: 'WaitTimeSeconds = 0. Responde na hora, consultando só parte dos servidores; gera muitas respostas vazias (e cobradas).' },
  { term: 'Long polling', service: 'SQS', text: 'WaitTimeSeconds de 1 a 20. Espera chegar mensagem antes de responder: menos chamadas vazias e menor custo.' },
  { term: 'Batch', service: 'SQS', text: 'Operações em lote (até 10 mensagens): ReceiveMessage com MaxNumberOfMessages, SendMessageBatch, DeleteMessageBatch. Reduz custo.' },
  { term: 'Delay queue', service: 'SQS', text: 'DelaySeconds (0 a 900 s) esconde cada mensagem nova antes da primeira entrega.' },
  { term: 'Retenção', service: 'SQS', text: 'MessageRetentionPeriod: de 60 s a 14 dias (padrão de 4 dias). Mensagens mais velhas são apagadas.' },
  { term: 'Tópico SNS FIFO', service: 'SNS', text: 'Mantém ordem por grupo e deduplica. Só entrega para filas SQS FIFO.' },
  { term: 'Raw message delivery', service: 'SNS', text: 'Entrega só o corpo da mensagem para a fila, sem o envelope JSON do SNS.' },
  { term: 'Latência p95', service: 'Geral', text: '95% dos pedidos foram processados em até esse tempo (do envio até o fim do processamento).' },
];
