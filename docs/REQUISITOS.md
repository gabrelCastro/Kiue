# SQSLearn — Requisitos

Jogo 3D (three.js) de puzzle de arquitetura que ensina **Amazon SQS** e **Amazon SNS**.
O jogador monta arquiteturas de mensageria, roda uma simulação fiel ao comportamento
da AWS e vê, em 3D, as mensagens circulando.

## 1. Público e objetivos

- **Trilha Iniciante:** devs que conhecem backend, mas nunca usaram mensageria.
- **Trilha Certificação:** quem estuda para AWS Developer / Solutions Architect.

Ao terminar, o jogador sabe explicar:

| # | Conceito | Onde é ensinado |
|---|---|---|
| C1 | Desacoplamento e buffer (por que usar fila) | Fases 1–2 |
| C2 | Consumidores concorrentes (cada mensagem vai para um só) | Fase 3 |
| C3 | SNS fan-out (cópia para cada assinatura) | Fase 4 |
| C4 | Filter policy | Fase 5 |
| C5 | Visibility timeout, retries, maxReceiveCount, DLQ | Fases 6–7 |
| C6 | At-least-once e idempotência | Fase 8 |
| C7 | FIFO, MessageGroupId, ordem | Fase 9 |
| C8 | Custo: short vs long polling, batch | Fase 10 |
| C9 | SNS FIFO → SQS FIFO | Fase 11 |
| C10 | Retenção de mensagens | Fase 12 |
| C11 | Delay queue | Fase 13 |
| C12 | Batch × visibility timeout | Fase 14 |
| C13 | Deduplicação FIFO (content-based / dedup ID) | Fase 15 |
| C14 | Integração de tudo | Fase 16 (exame final) |

## 2. Requisitos funcionais

### RF1 — Menu e progresso
- RF1.1 Menu com duas trilhas (Iniciante e Certificação) e um modo Sandbox.
- RF1.2 Cada fase mostra as estrelas obtidas (0–3).
- RF1.3 Fases da trilha são desbloqueadas em sequência; a trilha Certificação libera após a fase 5 da Iniciante.
- RF1.4 Progresso salvo no `localStorage` (falha silenciosa se indisponível).
- RF1.5 Glossário acessível de qualquer tela.

### RF2 — Modo Construção
- RF2.1 Briefing da fase ao entrar (história, objetivo, dica do conceito).
- RF2.2 Paleta com as peças liberadas na fase, com limite de quantidade.
- RF2.3 Colocar peça clicando na paleta e depois no chão (grid).
- RF2.4 Selecionar peça para abrir o Inspetor; arrastar para mover.
- RF2.5 Conectar peças (botão "Conectar" + clique no destino) e remover conexões.
- RF2.6 Remover peças não bloqueadas.
- RF2.7 O Inspetor mostra só as configurações cujo conceito está liberado na fase.
- RF2.8 Validação de conexões com mensagem explicativa (ex.: tópico FIFO só entrega para fila FIFO).
- RF2.9 Painel "Na vida real" com o comando AWS CLI / código SDK equivalente à peça selecionada.
- RF2.10 Botão "Ver solução" após uma tentativa falha.

### RF3 — Modo Execução
- RF3.1 Rodar a simulação; velocidades 1×, 2×, 4×, 8× e pausa.
- RF3.2 Botão "Concluir agora" (simula instantaneamente até o fim).
- RF3.3 Mensagens visíveis como cubos coloridos: em trânsito, na fila, em voo, sendo processadas, na DLQ.
- RF3.4 Efeitos para processada, perdida, duplicada e enviada à DLQ.
- RF3.5 HUD com métricas: produzidas, processadas, perdidas, duplicadas, fora de ordem, DLQ, chamadas de API, latência p95.
- RF3.6 Checklist dos objetivos atualizado ao vivo.
- RF3.7 Log de eventos em português ("fila-pedidos: visibility timeout expirou para #12").
- RF3.8 Voltar ao modo Construção a qualquer momento.

### RF4 — Resultado
- RF4.1 Ao fim: objetivos atingidos/falhos, estrelas e explicação do porquê.
- RF4.2 Resumo "O que você aprendeu" da fase.
- RF4.3 Quiz rápido (1–2 perguntas de múltipla escolha com explicação).
- RF4.4 Ir para a próxima fase / tentar de novo.

### RF5 — Sandbox
- RF5.1 Todas as peças e configurações liberadas, inclusive o produtor.

## 3. Regras de simulação (fidelidade AWS)

### SQS Standard
- S1 Entrega at-least-once: com probabilidade configurável pela fase, a fila entrega uma cópia extra.
- S2 Ordem best-effort: a fila pode inverter mensagens próximas.
- S3 `ReceiveMessage` torna a mensagem invisível por `VisibilityTimeout`; sem `DeleteMessage` ela volta a ficar visível e `ApproximateReceiveCount` aumenta.
- S4 `DeleteMessage` exige o receipt handle mais recente; um handle antigo falha.
- S5 Redrive: se `receiveCount >= maxReceiveCount` ao tentar receber de novo, a mensagem vai para a DLQ.
- S6 `MaxNumberOfMessages` de 1 a 10; `WaitTimeSeconds` de 0 a 20 (long polling).
- S7 Short polling consulta só parte dos servidores e pode voltar vazio mesmo com mensagens.
- S8 `MessageRetentionPeriod` (60 s a 14 dias): mensagens mais velhas são apagadas.
- S9 `DelaySeconds` (0 a 900).

### SQS FIFO
- F1 Ordem estrita por `MessageGroupId`.
- F2 Enquanto um grupo tem mensagem em voo, as próximas do mesmo grupo não são entregues.
- F3 Deduplicação em janela de 5 min por `MessageDeduplicationId` ou por conteúdo (`ContentBasedDeduplication`).
- F4 Envio sem dedup ID e sem content-based dedup falha.
- F5 A DLQ de uma fila FIFO precisa ser FIFO (e a de uma Standard precisa ser Standard).

### SNS
- N1 Publicar entrega uma cópia independente para cada assinatura.
- N2 Filter policy por atributos: igualdade (lista = OU), `anything-but`, `exists`; todas as chaves precisam casar (E).
- N3 Tópico FIFO só aceita assinaturas de filas FIFO.

### Produtor e consumidor (modelo do jogo)
- P1 O produtor gera mensagens com atributo `tipo`, `MessageGroupId` opcional, número de sequência por grupo e pode mandar mensagens "venenosas".
- P2 O produtor pode reenviar (retry de rede), gerando duplicata na origem.
- P3 Produtor ligado direto no consumidor = chamada síncrona: se todos os workers estiverem ocupados, a mensagem se perde.
- K1 Consumidor tem workers, batch size, wait time, tempo de processamento, taxa de falha, idempotência e janelas de indisponibilidade.
- K2 Mensagem venenosa sempre falha.
- K3 Processamento repetido do mesmo pedido = efeito colateral duplicado (a menos que o consumidor seja idempotente).

### Determinismo
- D1 Passo fixo de 50 ms de jogo; RNG com seed; mesma configuração gera o mesmo resultado.

## 4. Pontuação
- ⭐ 1: todos os objetivos cumpridos.
- ⭐ 2: latência p95 dentro da meta da fase.
- ⭐ 3: chamadas de API dentro da meta da fase.

## 5. Requisitos não funcionais
- RNF1 Interface 100% em português.
- RNF2 60 fps com ~2.000 mensagens na tela (InstancedMesh).
- RNF3 Simulador sem dependência de three.js, coberto por testes unitários.
- RNF4 Toda fase tem uma solução de referência testada automaticamente (fase é vencível).
- RNF5 Funciona offline, sem backend (`npm run build` gera estático).

## 6. Arquitetura

```
UI (Preact, DOM)  ◄── estado ──  Controller (game/)  ── comandos ──►  Simulação (sim/, TS puro)
                                       │                                   │ snapshot + eventos
                                       ▼                                   ▼
                                 Renderer (render/, three.js) ◄────────────┘
```

- `src/sim`: motor determinístico, filas, tópicos, produtores, consumidores, métricas.
- `src/game`: fases (dados), validação do grafo, objetivos, controller, save, glossário, "na vida real".
- `src/render`: cena isométrica, peças, conexões, tokens (InstancedMesh), efeitos.
- `src/ui`: componentes Preact.
- `tests/`: testes do simulador e das soluções de cada fase.

## 7. Parte 2

Lambda (event source mapping), heartbeat, retries/DLQ de assinatura SNS, paralelismo FIFO e tamanho de mensagem: regras e fases em `docs/PLANO-PARTE2.md`.
