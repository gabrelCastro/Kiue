import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

function publicFiles(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? publicFiles(path) : [path];
    });
  } catch {
    return [];
  }
}

/**
 * Service worker mínimo, gerado no build com a lista exata dos arquivos do jogo (nomes com hash).
 * A simulação roda toda no navegador, então depois da primeira visita o jogo abre sem rede; só
 * `/api` (contas, progresso na nuvem) depende do servidor, e o `ProgressSync` já cuida do offline.
 * Versão nova espera as abas antigas fecharem para assumir: nada quebra no meio de uma fase.
 */
export function pwa(): Plugin {
  const publicDir = 'public';
  return {
    name: 'kiue-pwa',
    apply: 'build',
    generateBundle(_, bundle) {
      const pub = publicFiles(publicDir);
      const files = [...Object.keys(bundle), ...pub.map((f) => relative(publicDir, f))].filter((f) => f !== 'sw.js');
      const version = createHash('sha256')
        .update(Object.keys(bundle).sort().join('\n'))
        .update(pub.map((f) => readFileSync(f)).join(''))
        .digest('hex')
        .slice(0, 12);
      const source = `// gerado por scripts/vite-pwa.ts
const CACHE = 'kiue-${version}';
const FILES = ${JSON.stringify(['./', ...files])};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new URL(f, self.registration.scope).href))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('kiue-') && k !== CACHE).map((k) => caches.delete(k)))));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    // página: rede primeiro (pega versão nova), cache se estiver offline
    event.respondWith(fetch(req).catch(() => caches.match(new URL('./', self.registration.scope).href, { ignoreVary: true })));
    return;
  }
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
