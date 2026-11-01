import type { Plugin } from 'vite';

/**
 * A tela inicial abre com a vitrine 3D (src/render/showcase.ts), que é um import dinâmico: sem
 * aviso, o navegador só descobre que precisa dela depois de baixar e rodar o JavaScript principal,
 * quase 1 s depois numa conexão com latência alta. Aqui o build põe no index.html um
 * `<link rel="modulepreload">` (prioridade baixa) para o chunk da vitrine e tudo o que ele importa (three.js e as
 * peças), com os nomes com hash deste build. A imagem parada da vitrine é pré-carregada direto no
 * index.html (public/hero-poster.webp).
 */
export function preloadShowcase(): Plugin {
  return {
    name: 'kiue-preload-showcase',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
        const entry = chunks.find((c) => c.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/render/showcase.ts'));
        if (!entry) throw new Error('kiue-preload-showcase: chunk da vitrine não encontrado');
        // o chunk da vitrine e os que ele importa estaticamente (em profundidade)
        const files = new Set<string>();
        const visit = (fileName: string) => {
          if (files.has(fileName)) return;
          files.add(fileName);
          const chunk = chunks.find((c) => c.fileName === fileName);
          for (const dep of chunk?.imports ?? []) visit(dep);
        };
        visit(entry.fileName);
        // o principal já vem pelo <script>; o resto vai como dica de pré-carregamento
        const main = chunks.find((c) => c.isEntry)?.fileName;
        return [...files]
          .filter((f) => f !== main)
          // prioridade baixa: começa cedo, mas cede a banda ao JS principal e à imagem da vitrine
          .map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, fetchpriority: 'low', href: `./${f}` }, injectTo: 'body' as const }));
      },
    },
  };
}
