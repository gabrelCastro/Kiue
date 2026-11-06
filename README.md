# Kiuê

Jogo 3D (three.js + Preact) para aprender **filas, tópicos e mensageria**. Você monta arquiteturas de mensageria, roda uma simulação fiel ao comportamento de serviços de fila gerenciados e vê os pedidos circulando, sendo perdidos, duplicados, reordenados ou indo para a DLQ.

```bash
npm install
npm run dev        # jogo em http://localhost:5173 + API de contas em :8787
```

## Conteúdo

**Trilha Iniciante** (10 fases): fila de mensagens, buffer em picos, consumidores concorrentes, fan-out com tópico, filter policy, DLQ, visibility timeout, at-least-once/idempotência, FIFO, long polling e custo.

**Trilha Certificação** (15 fases, libera após a fase 5): tópico FIFO → fila FIFO, retenção, delay queue, batch × visibility timeout, deduplicação FIFO, fila + função sob demanda (falha parcial de lote, concorrência máxima, cold start com provisioned concurrency e batching window), tópico → função (invocação assíncrona com novas tentativas e destino de falha), heartbeat estendendo a visibilidade, novas tentativas do tópico e DLQ de assinatura, paralelismo por grupo de mensagens, limite de tamanho com claim check e um exame final que junta tudo.

**Sandbox**: tudo liberado, inclusive o produtor.

**Estudos**: a teoria por trás das fases.
- **Apostila** em 13 capítulos, com índice, progresso de leitura salvo na conta e termos do glossário explicados ao passar o mouse.
- **Glossário** com busca.
- **Revisão**: as perguntas dos quizzes das fases já concluídas, embaralhadas.

Cada capítulo aponta as fases que treinam o assunto, e na fase o botão **Estudar** abre o capítulo certo por cima da cena, sem perder a montagem. Visitantes leem os capítulos 1 e 2; os demais seguem a mesma regra das fases: ficam em `content/study.ts`, só no servidor (`GET /api/study/:id`), e o `check-bundle` garante que não vazam para o bundle.

Cada fase tem briefing, dica, objetivos medidos ao vivo, 3 estrelas (objetivos, latência p95 e chamadas de API), resumo do que foi aprendido, quiz e o painel **Na vida real**, com a configuração (num YAML genérico) e o código equivalentes a cada peça, sem amarrar a um provedor.

## Como jogar

- Clique numa peça da paleta e depois no chão para colocá-la.
- Selecione uma peça, clique em **Conectar** e depois no destino.
- Arraste para mover. Botão direito/do meio move a câmera; a roda dá zoom.
- `Espaço` roda/pausa, `Esc` cancela, `Del` remove a peça selecionada.

## Arquitetura

```
src/sim     motor de simulação determinístico (TS puro, sem three.js)
src/game    fases, objetivos, validação do grafo, controller, save, glossário, "na vida real"
src/study   apostila: catálogo de capítulos, capítulos abertos e o estado da sessão de estudos
src/render  cena three.js: peças, conexões, mensagens (InstancedMesh), efeitos
models/     produtor, fila e consumidor modelados em OpenSCAD (ver "Modelos 3D")
src/ui      interface Preact
src/auth    estado de login no navegador (AuthStore); src/api: cliente HTTP
src/account sincronização do progresso, dos capítulos lidos e dos sandboxes salvos com a conta
content/    fases e capítulos da apostila fechados para visitantes (só o servidor importa)
server/     API (Hono + SQLite): contas, fases, progresso, sandboxes; testes em server/tests
tests/      testes do simulador, do controller e de todas as fases
e2e/        testes Playwright que jogam pela interface
docs/REQUISITOS.md  requisitos e regras de fidelidade
```

O simulador roda em passos fixos de 50 ms com RNG de seed fixa, então a mesma arquitetura sempre produz o mesmo resultado. O renderer só lê o estado (`sim.queues`, `sim.transits`, `sim.consumers`) e o stream de eventos; nunca altera a simulação.

### Desempenho

O jogo roda em tempo real com dezenas de milhares de mensagens (sandbox), então o simulador evita qualquer varredura O(n) por passo:

| Onde | Estrutura | O que evita |
|---|---|---|
| Fila (`sim/queue.ts`) | lista em ordem de chegada com lápides e compactação; índice `receipt → mensagem` | `findIndex`/`splice` no delete e no heartbeat |
| Fila | contadores por estado (atrasada, visível, em voo) | contar a fila inteira para HUD e escala da função |
| Fila | min-heaps para delay, visibility timeout e retenção | percorrer todas as mensagens a cada passo |
| Fila | piso de `seq` das visíveis + busca binária | pular as mensagens em voo no começo da fila |
| Fila Standard | reordenamento best-effort gerado sob demanda | sortear um número por mensagem visível a cada receive |
| Fila FIFO | índice por ID de grupo + merge k-way das cabeças dos grupos | varrer a fila inteira para achar grupos livres |
| Janela de dedup, retries do tópico, reenvios, trânsitos | filas FIFO (`Deque`): prazos fixos vencem em ordem | filtrar listas inteiras a cada passo |
| Log de eventos | buffers circulares (todos e só os notáveis) | `splice(0, …)` a cada evento e o log "sumir" sob carga |
| Métricas | latências ordenadas com merge incremental; máximo e mínimo acumulados | reordenar tudo a cada consulta da HUD; `Math.max(...array)` estourar a pilha |

No renderer: cena desenhada só quando algo muda (montando, pausado ou no resultado não gasta GPU), cubos de mensagem sem sombra, cores pré-convertidas e nenhuma alocação por frame. three.js fica num chunk separado, baixado em segundo plano enquanto o menu está aberto.

`tests/perf/golden.test.ts` guarda uma impressão digital do stream de eventos de todas as fases e de cenários de carga: uma otimização que mude qualquer resultado quebra o teste.

### Modelos 3D

Produtor, fila e consumidor são modelados à mão em OpenSCAD (`models/*.scad`, 1 unidade do jogo = 100 mm, Z para cima, frente em −Y). Cada material é uma parte separada (`parte = "corpo"`, `"detalhe"`…), para o jogo dar a cor e trocá-la em tempo de jogo; as partes móveis (portão da doca, célula e articulações dos braços robóticos) saem na própria origem. `node scripts/models.mjs` exporta as partes, une os vértices e grava `src/render/models.gen.ts` (posições Int16 + índices em base64, ~8 mil triângulos no total). O arquivo gerado vai para o repositório, então o build não precisa do OpenSCAD; rode o script de novo depois de mudar um `.scad`. `src/render/models.ts` converte os eixos e calcula as normais (quinas vivas acima de 35°). O produtor é uma doca de expedição (o portão enrola a cada mensagem enviada) e o consumidor, uma bancada de triagem com um braço robótico por worker: `render/robots.ts` move os braços conforme o estado do worker (trabalhando, buscando mensagens, ocioso, desligado, caído), com um InstancedMesh por parte. A função sob demanda é uma estação de robôs (`render/station.ts`): cada instância é um robô que sobe de um alçapão quando a função escala e afunda quando ela encolhe; alçapões além do MaximumConcurrency ficam travados; o lote de cada invocação empilha na bandeja do robô, com uma barra do tempo contra o timeout (azul enquanto a instância inicia, no cold start). Vidro e esteira da fila, pedestais e tópico continuam montados no código (`render/nodes.ts`).

A tela inicial abre com uma vitrine (`render/showcase.ts`): produtor → fila → consumidor com as mesmas peças, numa coreografia própria (sem o simulador) em que rajadas do produtor enchem a fila e os braços esvaziam. Ela só anima visível na tela e com a aba aberta; com movimento reduzido, mostra um quadro parado.

### Adicionar uma fase

Fases são dados: grafo inicial, paleta, conceitos liberados no inspetor, objetivos, metas de estrela, lições, quiz e uma função `solve` com a solução de referência (`defineLevel` a executa e guarda o grafo da solução, então a fase pronta é só JSON). Título e conceito de todas ficam no catálogo público `src/game/level-catalog.ts`; o conteúdo das fases 1, 2 e do sandbox fica em `src/game/levels.ts` (vai no bundle) e o das outras 20 em `content/levels.ts` (só o servidor carrega). O teste `tests/game/levels.test.ts` garante automaticamente que o estado inicial falha e que a solução vence com 3 estrelas.

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
| `node scripts/models.mjs` | regenera `src/render/models.gen.ts` a partir de `models/*.scad` (precisa do `openscad`) |
| `npm run bench:render` | mede o custo por frame no navegador com um sandbox pesado (`LEVEL=c12` mede uma fase real) |

## Contas (back-end)

Visitantes jogam as fases 1 e 2 da trilha Iniciante e um sandbox limitado (1 produtor, 1 tópico, 2 filas, 2 consumidores, 1 função); o resto pede conta. O bloqueio é real: o bundle do jogo traz só o catálogo (títulos) e as fases abertas; o conteúdo das demais chega por `GET /api/levels/:id`, que exige sessão. O `npm run build` falha se algum texto de `content/` aparecer no bundle (`scripts/check-bundle.ts`). Sem a API, o jogo segue no modo visitante e o botão **Entrar** avisa que as contas estão indisponíveis. Com a API, o jogador cria conta, entra, sai, troca o nome e a senha, desconecta outros aparelhos, redefine a senha por e-mail e exclui a conta. Com conta, o progresso e os sandboxes ficam salvos no servidor.

**Progresso**: visitante guarda no navegador. Ao entrar, o progresso de visitante deste navegador é somado ao da conta e sai do navegador. Logado, cada fase concluída vai para o servidor; se a rede falhar, fica pendente (também no navegador) e é reenviada. A gravação é uma mesclagem que fica com o melhor resultado de cada fase, então reenviar ou jogar em dois aparelhos ao mesmo tempo não perde nada (`src/account/progress-sync.ts`).

**Sandboxes salvos**: até 30 por conta, com nome. O painel **Arquivo** do sandbox salva (Ctrl+S), salva cópia e avisa de alterações não salvas; o menu lista, abre e exclui. Cada sandbox tem uma `revision`: se outra aba ou aparelho salvou depois que você abriu, o servidor recusa (409) e o jogo oferece sobrescrever ou salvar cópia. O servidor confere a forma do grafo (tipos de peça, ids, referências, tamanho) e guarda só os campos conhecidos; as regras do jogo continuam no cliente.

```
server/src/app.ts            rotas (Hono) e middlewares: CSRF, sessão, limites, erros
server/src/auth/service.ts   regras de negócio do login
server/src/auth/password.ts  hash scrypt com parâmetros no próprio hash (permite subir o custo)
server/src/game/levels.ts    entrega o conteúdo de content/levels.ts para quem está logado
server/src/game/progress.ts  progresso por conta (mesclagem pelo melhor resultado)
server/src/game/sandboxes.ts sandboxes salvos: validação do grafo, cota, revisão
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
| `GET /api/levels/:id` | conteúdo de uma fase fechada para visitantes (exige sessão) |
| `GET`/`PATCH`/`DELETE /api/progress` | progresso da conta / mesclar fases / zerar |
| `GET`/`POST /api/sandboxes` | lista (sem o grafo) / cria |
| `GET`/`PUT`/`DELETE /api/sandboxes/:id` | abre / salva por cima (com `revision`) / exclui |

**Decisões de segurança**
- **Sessão em cookie** `httpOnly` + `SameSite=Lax` (+ `Secure` e prefixo `__Host-` em produção), em vez de JWT no `localStorage`: o JavaScript da página nunca vê o token. O banco guarda só o SHA-256 do token. A sessão expira em 30 dias sem uso (renova com o uso) e em 180 dias no máximo.
- **CSRF**: toda requisição que muda estado precisa de `Origin` na lista permitida, além do `SameSite`.
- **Senhas**: scrypt (N=2¹⁵) com sal por senha, comparação em tempo constante, regras do NIST (mínimo de 8 caracteres, bloqueio das mais óbvias, sem regras de composição).
- **Sem enumeração de contas**: login responde igual para e-mail inexistente e senha errada (e gasta o mesmo tempo); "esqueci a senha" sempre responde 202.
- **Limites de tentativa**: 5 falhas de login por conta e 30 por IP a cada 15 min; limites também para cadastro e redefinição.
- **Gravações de jogo** (progresso, sandboxes): 120 por conta a cada 10 min; corpo de até 16 KB (104 KB para sandboxes).
- **Troca ou redefinição de senha** derruba as outras sessões; o link de redefinição vale 30 min, é de uso único e um pedido novo invalida o anterior.

Variáveis de ambiente (todas opcionais): `PORT` (8787), `DATABASE_PATH` (`data/kiue.db`), `APP_URL` (URL pública do jogo, usada nos links e como origem permitida), `ALLOWED_ORIGINS`, `SECURE_COOKIES`, `TRUST_PROXY` (atrás de proxy/CDN), `SESSION_IDLE_DAYS`, `SESSION_MAX_DAYS`, `RESET_TOKEN_MINUTES`, `SCRYPT_COST`, `STATIC_DIR`.

### Login com Google

Opcional: com `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` definidos, o diálogo de conta ganha o botão "Entrar com o Google"; sem eles, nada aparece.

1. No Google Cloud Console, crie uma credencial OAuth (tipo *Aplicativo da Web*).
2. Em *URIs de redirecionamento autorizados*, cadastre `<APP_URL>/api/auth/google/callback` (em desenvolvimento, `http://localhost:5173/api/auth/google/callback`).
3. Suba o servidor com as duas variáveis (no `docker-compose.yml` já estão previstas).

Como funciona: OpenID Connect com código + PKCE, no servidor (`server/src/auth/google.ts`). O `state` e o `nonce` vão num cookie curto e HttpOnly; a pessoa é identificada pelo `sub` do Google, não pelo e-mail.

- **E-mail verificado**: só entra quem o Google marca como verificado.
- **Vínculo automático**: se o e-mail bater com o de uma conta existente, o Google é vinculado a ela (progresso e sandboxes ficam). Como o cadastro por senha não confirma o e-mail, **a senha dessa conta é anulada e as sessões abertas caem** no vínculo; quem é o dono entra pelo Google ou usa "Esqueci minha senha" para definir outra.
- **Conta só-Google** não tem senha; para excluí-la confirma-se digitando o e-mail, e "Definir senha" manda o link de redefinição.

Em desenvolvimento, o e-mail de redefinição aparece no terminal da API. Para produção falta plugar um `Mailer` real (um serviço de e-mail transacional). O serviço não conhece o SQLite: para levar a API para outro banco basta outra implementação de `UserRepo`/`SessionRepo`/`ResetRepo`/`ProgressRepo`/`SandboxRepo`, e o Hono roda em servidor ou em função sob demanda sem mudar as rotas. Os limites de tentativa ficam em memória: com várias instâncias, precisam de um armazenamento compartilhado.

## Simplificações conscientes

Tempos e volumes são reduzidos para caber num jogo (por exemplo, os retries HTTP do tópico acontecem a cada 5 s, não 20 s). O tópico entrega para filas, endpoints HTTPS e funções (invocação assíncrona: a plataforma tenta de novo 2 vezes, a cada 3 e 6 s no jogo, em vez de minutos); nos serviços reais também costuma enviar e-mail/SMS. A função escala de 1 em 1 por segundo até no máximo 20; o cold start só é simulado quando a função tem tempo de inicialização (`initTime`), e uma instância desativada pela escala esfria na hora (nos serviços reais, depois de minutos parada). A filter policy usa apenas o atributo `tipo`. Cotas de vazão do FIFO e criptografia aparecem só nas lições e no quiz. As regras de entrega, visibilidade, redrive, ordem por grupo, deduplicação, retenção, delay e polling seguem o comportamento documentado de serviços de fila gerenciados (veja `docs/REQUISITOS.md`).

## Marcas

Kiuê é um projeto educacional independente, sem afiliação, patrocínio ou endosso da Amazon Web Services, Inc. ou de suas afiliadas. Os conceitos do jogo correspondem aos de serviços como Amazon SQS (fila), Amazon SNS (tópico) e AWS Lambda (função sob demanda); esses nomes são marcas dos respectivos donos e aparecem aqui só para indicar a correspondência.
