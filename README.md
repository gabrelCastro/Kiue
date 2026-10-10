# Kiuê

Jogo 3D (three.js + Preact) para aprender **Amazon SQS** e **Amazon SNS**. Você monta arquiteturas de mensageria, roda uma simulação fiel ao comportamento da AWS e vê os pedidos circulando, sendo perdidos, duplicados, reordenados ou indo para a DLQ.

```bash
npm install
npm run dev        # jogo em http://localhost:5173 + API de contas em :8787
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
src/auth    estado de login no navegador (AuthStore); src/api: cliente HTTP
server/     API de contas (Hono + SQLite); testes em server/tests
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
| `npm run dev` | jogo (Vite) + API juntos; `dev:web` e `dev:api` sobem cada um |
| `npm start` | build + jogo e API num processo só, em modo produção (porta 8787) |
| `npm test` | testes unitários (Vitest) |
| `npm run e2e` | build + testes Playwright |
| `npm run check` | typecheck + testes + build + e2e |
| `npm run build` | gera o site estático em `dist/` |
| `npm run bench` | mede o simulador (fases e cenários de carga) |
| `npm run bench:render` | mede o custo por frame no navegador com um sandbox pesado (`LEVEL=c12` mede uma fase real) |

## Contas (back-end)

Visitantes jogam as fases 1 e 2 da trilha Iniciante e um sandbox limitado (1 produtor, 1 tópico, 2 filas, 2 consumidores, 1 Lambda); o resto pede conta. A regra fica em `src/game/access.ts` e é aplicada no cliente (o conteúdo das fases está no bundle), então é uma porta de produto, não de segurança. Sem a API, o jogo segue no modo visitante e o botão **Entrar** avisa que as contas estão indisponíveis. Com a API, o jogador cria conta, entra, sai, troca o nome e a senha, desconecta outros aparelhos, redefine a senha por e-mail e exclui a conta.

```
server/src/app.ts            rotas (Hono) e middlewares: CSRF, sessão, limites, erros
server/src/auth/service.ts   regras de negócio do login
server/src/auth/password.ts  hash scrypt com parâmetros no próprio hash (permite subir o custo)
server/src/repos.ts          interfaces de dados + implementação SQLite
server/src/db.ts             SQLite nativo do Node (node:sqlite) com migrações versionadas
server/src/mail.ts           envio de e-mail (console em desenvolvimento)
```

| Rota | O que faz |
|---|---|
| `GET /api/auth/session` | usuário logado ou `null` (usado a cada carga da página) |
| `POST /api/auth/register` · `login` · `logout` | cadastro, login e saída |
| `GET`/`PATCH /api/auth/me` | dados da conta / trocar o nome |
| `POST /api/auth/password` | trocar a senha (pede a atual) |
| `POST /api/auth/logout-others` | encerra as sessões dos outros aparelhos |
| `POST /api/auth/password-reset/request` · `confirm` | link de uso único por e-mail |
| `DELETE /api/auth/account` | exclui a conta (pede a senha) |

**Decisões de segurança**
- **Sessão em cookie** `httpOnly` + `SameSite=Lax` (+ `Secure` e prefixo `__Host-` em produção), em vez de JWT no `localStorage`: o JavaScript da página nunca vê o token. O banco guarda só o SHA-256 do token. A sessão expira em 30 dias sem uso (renova com o uso) e em 180 dias no máximo.
- **CSRF**: toda requisição que muda estado precisa de `Origin` na lista permitida, além do `SameSite`.
- **Senhas**: scrypt (N=2¹⁵) com sal por senha, comparação em tempo constante, regras do NIST (mínimo de 8 caracteres, bloqueio das mais óbvias, sem regras de composição).
- **Sem enumeração de contas**: login responde igual para e-mail inexistente e senha errada (e gasta o mesmo tempo); "esqueci a senha" sempre responde 202.
- **Limites de tentativa**: 5 falhas de login por conta e 30 por IP a cada 15 min; limites também para cadastro e redefinição.
- **Troca ou redefinição de senha** derruba as outras sessões; o link de redefinição vale 30 min, é de uso único e um pedido novo invalida o anterior.

Variáveis de ambiente (todas opcionais): `PORT` (8787), `DATABASE_PATH` (`data/kiue.db`), `APP_URL` (URL pública do jogo, usada nos links e como origem permitida), `ALLOWED_ORIGINS`, `SECURE_COOKIES`, `TRUST_PROXY` (atrás de proxy/CDN), `SESSION_IDLE_DAYS`, `SESSION_MAX_DAYS`, `RESET_TOKEN_MINUTES`, `SCRYPT_COST`, `STATIC_DIR`.

Em desenvolvimento, o e-mail de redefinição aparece no terminal da API. Para produção falta plugar um `Mailer` real (ex.: Amazon SES). O serviço não conhece o SQLite: para levar a API para Lambda + DynamoDB basta outra implementação de `UserRepo`/`SessionRepo`/`ResetRepo`, e o Hono roda na Lambda sem mudar as rotas. Os limites de tentativa ficam em memória: com várias instâncias, precisam de um armazenamento compartilhado.

## Simplificações conscientes

Tempos e volumes são reduzidos para caber num jogo (por exemplo, os retries HTTP do SNS acontecem a cada 5 s, não 20 s). O SNS entrega para filas SQS e endpoints HTTPS (na AWS também invoca Lambda e envia e-mail/SMS). A Lambda escala de 1 em 1 por segundo até no máximo 20. A filter policy usa apenas o atributo `tipo`. Cotas de vazão do FIFO e criptografia aparecem só nas lições e no quiz. As regras de entrega, visibilidade, redrive, ordem por grupo, deduplicação, retenção, delay e polling seguem a documentação da AWS (veja `docs/REQUISITOS.md`).
