# SQSLearn

Jogo 3D (three.js + Preact) para aprender **Amazon SQS** e **Amazon SNS**. Você monta arquiteturas de mensageria, roda uma simulação fiel ao comportamento da AWS e vê os pedidos circulando, sendo perdidos, duplicados, reordenados ou indo para a DLQ.

```bash
npm install
npm run dev        # http://localhost:5173
```

## Conteúdo

**Trilha Iniciante** (10 fases): fila SQS, buffer em picos, consumidores concorrentes, SNS fan-out, filter policy, DLQ, visibility timeout, at-least-once/idempotência, FIFO, long polling e custo.

**Trilha Certificação** (12 fases, libera após a fase 5): SNS FIFO → SQS FIFO, retenção, delay queue, batch × visibility timeout, deduplicação FIFO, SQS + Lambda (falha parcial de lote e MaximumConcurrency), heartbeat com ChangeMessageVisibility, retries do SNS e DLQ de assinatura, paralelismo por MessageGroupId, limite de tamanho com Extended Client e um exame final que junta tudo.

**Sandbox**: tudo liberado, inclusive o produtor.

Cada fase tem briefing, dica, objetivos medidos ao vivo, 3 estrelas (objetivos, latência p95 e chamadas de API), resumo do que foi aprendido, quiz e o painel **Na vida real**, com o comando AWS CLI / código SDK v3 equivalente a cada peça.

## Como jogar

- Clique numa peça da paleta e depois no chão para colocá-la.
- Selecione uma peça, clique em **Conectar** e depois no destino.
- Arraste para mover. Botão direito/do meio move a câmera; a roda dá zoom.
- `Espaço` roda/pausa, `Esc` cancela, `Del` remove a peça selecionada.

## Arquitetura

```
src/sim     motor de simulação determinístico (TS puro, sem three.js)
src/game    fases, objetivos, validação do grafo, controller, save, glossário, "na vida real"
src/render  cena three.js: peças, conexões, mensagens (InstancedMesh), efeitos
src/ui      interface Preact
tests/      testes do simulador, do controller e de todas as fases
e2e/        testes Playwright que jogam pela interface
docs/REQUISITOS.md  requisitos e regras de fidelidade
```

O simulador roda em passos fixos de 50 ms com RNG de seed fixa, então a mesma arquitetura sempre produz o mesmo resultado. O renderer só lê o estado (`sim.queues`, `sim.transits`, `sim.consumers`) e o stream de eventos; nunca altera a simulação.

### Desempenho

O jogo roda em tempo real com dezenas de milhares de mensagens (sandbox), então o simulador evita qualquer varredura O(n) por passo:

| Onde | Estrutura | O que evita |
|---|---|---|
| Fila (`sim/queue.ts`) | lista em ordem de chegada com lápides e compactação; índice `receipt → mensagem` | `findIndex`/`splice` no DeleteMessage e no heartbeat |
| Fila | contadores por estado (atrasada, visível, em voo) | contar a fila inteira para HUD e escala da Lambda |
| Fila | min-heaps para delay, visibility timeout e retenção | percorrer todas as mensagens a cada passo |
| Fila | piso de `seq` das visíveis + busca binária | pular as mensagens em voo no começo da fila |
| Fila Standard | reordenamento best-effort gerado sob demanda | sortear um número por mensagem visível a cada ReceiveMessage |
| Fila FIFO | índice por `MessageGroupId` + merge k-way das cabeças dos grupos | varrer a fila inteira para achar grupos livres |
| Janela de dedup, retries do SNS, reenvios, trânsitos | filas FIFO (`Deque`): prazos fixos vencem em ordem | filtrar listas inteiras a cada passo |
| Log de eventos | buffers circulares (todos e só os notáveis) | `splice(0, …)` a cada evento e o log "sumir" sob carga |
| Métricas | latências ordenadas com merge incremental; máximo e mínimo acumulados | reordenar tudo a cada consulta da HUD; `Math.max(...array)` estourar a pilha |

No renderer: cena desenhada só quando algo muda (montando, pausado ou no resultado não gasta GPU), cubos de mensagem sem sombra, cores pré-convertidas e nenhuma alocação por frame. three.js fica num chunk separado, baixado em segundo plano enquanto o menu está aberto.

`tests/perf/golden.test.ts` guarda uma impressão digital do stream de eventos de todas as fases e de cenários de carga: uma otimização que mude qualquer resultado quebra o teste.

### Adicionar uma fase

Fases são dados em `src/game/levels.ts`: grafo inicial, paleta, conceitos liberados no inspetor, objetivos, metas de estrela, lições, quiz e uma função `solve` com a solução de referência. O teste `tests/game/levels.test.ts` garante automaticamente que o estado inicial falha e que a solução vence com 3 estrelas.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm test` | testes unitários (Vitest) |
| `npm run e2e` | build + testes Playwright |
| `npm run check` | typecheck + testes + build + e2e |
| `npm run build` | gera o site estático em `dist/` |
| `npm run bench` | mede o simulador (fases e cenários de carga) |
| `npm run bench:render` | mede o custo por frame no navegador com um sandbox pesado |

## Simplificações conscientes

Tempos e volumes são reduzidos para caber num jogo (por exemplo, os retries HTTP do SNS acontecem a cada 5 s, não 20 s). O SNS entrega para filas SQS e endpoints HTTPS (na AWS também invoca Lambda e envia e-mail/SMS). A Lambda escala de 1 em 1 por segundo até no máximo 20. A filter policy usa apenas o atributo `tipo`. Cotas de vazão do FIFO e criptografia aparecem só nas lições e no quiz. As regras de entrega, visibilidade, redrive, ordem por grupo, deduplicação, retenção, delay e polling seguem a documentação da AWS (veja `docs/REQUISITOS.md`).
