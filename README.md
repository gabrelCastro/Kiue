# SQSLearn

Jogo 3D (three.js + Preact) para aprender **Amazon SQS** e **Amazon SNS**. Você monta arquiteturas de mensageria, roda uma simulação fiel ao comportamento da AWS e vê os pedidos circulando, sendo perdidos, duplicados, reordenados ou indo para a DLQ.

```bash
npm install
npm run dev        # http://localhost:5173
```

## Conteúdo

**Trilha Iniciante** (10 fases): fila SQS, buffer em picos, consumidores concorrentes, SNS fan-out, filter policy, DLQ, visibility timeout, at-least-once/idempotência, FIFO, long polling e custo.

**Trilha Certificação** (6 fases, libera após a fase 5): SNS FIFO → SQS FIFO, retenção, delay queue, batch × visibility timeout, deduplicação FIFO e um exame final que junta tudo.

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

## Simplificações conscientes

Tempos e volumes são reduzidos para caber num jogo. O SNS entrega só para filas SQS (na AWS também entrega para Lambda, HTTP, e-mail etc.). A filter policy usa apenas o atributo `tipo`. Cotas de vazão do FIFO não são simuladas. As regras de entrega, visibilidade, redrive, ordem por grupo, deduplicação, retenção, delay e polling seguem a documentação da AWS (veja `docs/REQUISITOS.md`).
