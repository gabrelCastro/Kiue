import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { createApp } from './app';
import { SlidingWindowLimiter } from './auth/rate-limit';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { ConsoleMailer } from './mail';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const { app: api, auth, limiters } = createApp({
  config,
  db,
  // em produção, trocar por um Mailer de verdade (ex.: Amazon SES); até lá, o link não vai para o log
  mailer: new ConsoleMailer({ redactLinks: process.env.NODE_ENV === 'production' }),
  clientIp: (c) => getConnInfo(c).remote.address ?? 'unknown',
});

const root = new Hono();
root.route('/', api);
if (config.staticDir) {
  // produção num processo só: a API em /api e o jogo (build do Vite) no resto
  // a API já tem os próprios cabeçalhos; aqui, os da página: CSP estrita (só arquivos do próprio
  // domínio, sem script inline) e nada de ser embutida em outro site (clickjacking)
  root.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      xFrameOptions: 'DENY',
    }),
  );
  // Cache: os arquivos com hash no nome (assets/) mudam de nome a cada versão e podem ficar para
  // sempre; o resto (index.html, sw.js, manifesto, imagens) é conferido a cada visita (304 se nada
  // mudou). Sem cabeçalho, o navegador guardava o index.html por conta própria e seguia mostrando
  // a versão anterior depois de um deploy.
  root.use('/*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/api/') || c.res.headers.has('Cache-Control')) return;
    c.res.headers.set('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  });
  root.use('/*', serveStatic({ root: config.staticDir }));
  root.get('*', serveStatic({ path: `${config.staticDir}/index.html` }));
}

const server = serve({ fetch: root.fetch, port: config.port }, (info) => {
  console.log(`Kiuê API em http://localhost:${info.port}/api (banco: ${config.databasePath})`);
});

// limpeza periódica de sessões e links vencidos, e das contagens velhas dos limitadores
const sweep = setInterval(() => {
  auth.purgeExpired();
  for (const limiter of Object.values(limiters)) if (limiter instanceof SlidingWindowLimiter) limiter.sweep();
}, 15 * 60_000);
sweep.unref();

function shutdown() {
  clearInterval(sweep);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
