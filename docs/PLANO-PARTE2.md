# Parte 2 — Conteúdo de certificação

Objetivo: cobrir os tópicos de SQS/SNS mais cobrados nas provas AWS que ficaram de fora da primeira versão.
A trilha Certificação passa de 6 para 12 fases; o exame final continua por último.

## 1. Escopo

| Tópico | Como entra | Fase |
|---|---|---|
| SQS + Lambda: falha parcial de lote (`ReportBatchItemFailures`) | Peça nova **Lambda** | c06 |
| SQS + Lambda: `MaximumConcurrency` protegendo o banco | Peça Lambda + limite do banco | c07 |
| Regra "visibility timeout ≥ 6× timeout da função" | Lição + quiz (c06) e timeout da função simulado | c06 |
| `ChangeMessageVisibility` (heartbeat) | Opção nova no consumidor | c08 |
| Retries de entrega do SNS + DLQ da assinatura | Assinatura SNS → endpoint HTTP | c09 |
| Paralelismo FIFO por `MessageGroupId` | Produtor com grupos editáveis | c10 |
| Cotas de vazão FIFO / high throughput | Lição + quiz (c10) | c10 |
| Limite de 1 MiB no SQS (256 KB até ago/2025) e 256 KB no SNS, cobrança por bloco de 64 KB, Extended Client (S3) | Tamanho de mensagem no produtor | c11 |
| Criptografia SSE-SQS / SSE-KMS | Glossário + quiz (c11) | c11 |
| Exame final | Já existe | c12 |

**Fica fora (só no glossário/quiz):** criptografia não vira mecânica; cotas FIFO não são simuladas (os números reais, 300/3.000 msg/s, não cabem na escala do jogo); `MaximumBatchingWindowInSeconds` aparece só na lição.

## 2. Regras novas da simulação

### Lambda (event source mapping)
- L1 O ESM faz long polling na fila e invoca a função com lotes de até `batchSize`.
- L2 Concorrência começa em 5 lotes simultâneos e sobe +1 por segundo enquanto há fila, até `MaximumConcurrency` (sem limite = teto do jogo, 20). Desce quando a fila esvazia.
- L3 A função processa o lote em sequência. Duração > `timeout` → invocação falha (timeout).
- L4 Sem `ReportBatchItemFailures`: a primeira falha lança erro; os itens anteriores já tiveram efeito, mas **nenhum** é apagado → o lote inteiro volta para a fila.
- L5 Com `ReportBatchItemFailures`: a função trata item a item; só os que falharam voltam.
- L6 Banco com limite de conexões: invocações simultâneas acima do limite falham ("too many connections").
- L7 Chamadas do ESM (Receive/Delete) contam como chamadas de API.

### Heartbeat
- H1 Consumidor com heartbeat chama `ChangeMessageVisibility` quando falta menos de 40% do timeout, estendendo a visibilidade das mensagens que ainda está processando (inclusive as do lote).
- H2 Se o consumidor cair, o heartbeat para e a mensagem volta após o timeout.

### SNS → endpoint HTTP
- N4 Assinatura de tópico para consumidor = endpoint HTTP (push). Endpoints marcados como "só HTTP" não podem ler filas.
- N5 Se o endpoint estiver ocupado ou fora do ar, o SNS tenta de novo (3 retries a cada 5 s no jogo; a política real padrão para HTTP é 3 retries com 20 s).
- N6 Esgotados os retries: vai para a DLQ da assinatura (fila SQS, mesmo tipo do tópico) ou é perdida.

### Tamanho de mensagem
- S10 Mensagem > 1 MiB → `SendMessage` falha (MessageTooLong); `Publish` no SNS falha acima de 256 KB.
- S11 Cada bloco de 64 KB conta como uma requisição.
- S12 Extended Client: payload acima de 256 KB vai para o S3 e a fila recebe só um ponteiro (~1 KB).

## 3. Mudanças por camada

- **sim:** `NodeKind` ganha `lambda`; `ConsumerConfig` ganha `heartbeat` e `httpOnly`; `ProducerConfig` ganha `largeRate`, `largeKb`, `extendedClient`; `GraphEdge` ganha `dlq`; eventos novos (`invocation_failed`, `visibility_extended`, `sns_retry`, `sns_dlq`, `scaled`); métricas (`dbOverloads`, invocações, pico de concorrência, chamadas S3).
- **game:** validação de conexões (fila → Lambda; tópico → endpoint HTTP; DLQ de assinatura), conceitos novos (`lambda`, `heartbeat`, `snsdlq`, `groups`, `payload`), objetivos novos (`maxLatency`, `onlyPoisonInDlq`, `noDbOverload`), 6 fases, glossário, "Na vida real" para Lambda/ESM, heartbeat e assinatura com DLQ.
- **render:** peça Lambda (λ), linha tracejada da DLQ de assinatura, efeitos novos, rótulos.
- **ui:** inspetor da Lambda, opção de heartbeat, DLQ da assinatura, campos do produtor por conceito.

## 4. Verificação
- Testes de unidade para cada regra (L1–L6, H1–H2, N4–N6, S10–S12).
- Teste de fases existente cobre as novas automaticamente (estado inicial falha, solução vence com 3 estrelas).
- E2E: tour roda a solução das 12 fases de certificação; um teste do inspetor para a Lambda.
