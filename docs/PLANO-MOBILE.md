# Plano: Kiuê no celular e no tablet

Abordagem: **web responsivo + PWA** sobre a base atual (mesmo código, mesmo deploy). Sem app
nativo: a cena three.js e o motor de simulação em TS seriam duplicados sem ganho real.

## Decisões

- **Orientação**: deitado é o principal; em pé funciona. Só em celular (toque + largura ≤ 600px)
  em pé aparece um aviso dispensável ("deite o celular"), uma vez por sessão, que some sozinho.
- **Layout compacto** (`max-width: 900px` ou `max-height: 500px`): palco em tela cheia, topbar
  enxuta com menu "⋯" e os painéis (Peças, Missão, Métricas, Peça) numa gaveta: embaixo em pé,
  à direita deitado. O palco encolhe junto com a gaveta e a câmera reenquadra sozinha.
- **Toque na cena**: um dedo move a câmera, dois dedos aproximam; toque seleciona; **toque longo**
  (280 ms, sem mexer) pega a peça para arrastar; colocar peça mostra o lugar e pede
  **✓ Colocar aqui**; barra de ações (Conectar, Excluir, Cancelar) substitui Esc/Delete; botão de
  recentralizar a câmera.
- **Performance**: em aparelho de toque, DPR ≤ 1,5, sombra 1024, sem antialias em tela ≥ 2×; se o
  quadro passar de 40 ms por ~2 s com a simulação rodando, baixa a resolução e depois desliga a
  sombra (só desce, nunca oscila).
- **PWA**: manifest, ícones (incl. maskable), `viewport-fit=cover`, safe-area, `dvh`. Service
  worker gerado no build com os arquivos do jogo: abre offline; `/api` nunca é cacheado. Versão
  nova só assume quando as abas antigas fecham.

## Fases (todas entregues)

| Fase | Entrega |
|---|---|
| 0 Fundação | viewport, `dvh`, safe-area, alvos de 44px em `pointer: coarse`, inputs ≥ 16px, projetos Playwright mobile |
| 1 Gestos | pan/pinça, toque longo para mover, confirmar posição, barra de ações |
| 2 Layout | topbar compacta, gaveta com abas, menu inicial e modais estreitos |
| 3 Performance | perfil por dispositivo e qualidade adaptativa |
| 4 PWA | manifest, ícones (`scripts/make-icons.mjs`), service worker (`scripts/vite-pwa.ts`) |

## Testes

`e2e/mobile.spec.ts` roda nos projetos `mobile` (Pixel 7 em pé) e `mobile-landscape`; `e2e/pwa.spec.ts`
cobre manifest e abertura offline. Teste em aparelho real: `npm run dev -- --host` e abrir pelo IP
da rede (com HTTP, deixe `SECURE_COOKIES=false`).

## Em aberto

- Lojas (Capacitor) ficaram fora: o PWA instalável cobre o objetivo.
- Fases muito largas em retrato podem pedir layout alternativo das peças.
