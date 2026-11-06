/**
 * Garante que o conteúdo das fases fechadas não foi parar no bundle do jogo (por exemplo, por um
 * import de `content/` dentro de `src/`). Roda no fim de `npm run build`.
 *
 * Procura trechos de texto de cada fase (história, objetivo, dica, perguntas do quiz) em todos os
 * arquivos de `dist/`. Para provar que a busca funciona, também exige achar as fases abertas.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_LEVELS } from '../content/levels';
import { FREE_LEVELS } from '../src/game/levels';
import type { Level } from '../src/game/level-types';
import { CONTENT_CHAPTERS } from '../content/study';
import { FREE_CHAPTERS } from '../src/study/free';
import type { Block, Chapter } from '../src/study/types';

const DIST = 'dist';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Trechos sem aspas nem barras: aparecem iguais no código minificado. */
function needles(level: Level): string[] {
  const texts = [level.story, level.objective, level.hint, ...level.quiz.map((q) => q.question), ...level.lesson];
  return texts.map((t) => t.split(/["'`\\\n]/).sort((a, b) => b.length - a.length)[0].slice(0, 60)).filter((t) => t.length >= 20);
}

/** Os mesmos trechos para os capítulos da apostila (parágrafos, listas e destaques). */
function chapterNeedles(chapter: Chapter): string[] {
  const texts = chapter.blocks.flatMap((b: Block) => (b.t === 'p' || b.t === 'note' ? [b.text] : b.t === 'list' ? b.items : []));
  return texts
    .map((t) => t.split(/\*\*|\{\{|\}\}|["'`\\\n|]/).sort((a, b) => b.length - a.length)[0].slice(0, 60))
    .filter((t) => t.length >= 30);
}

const bundle = files(DIST)
  .filter((f) => /\.(js|html|css|json|map)$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

const leaks: string[] = [];
for (const level of CONTENT_LEVELS) {
  for (const needle of needles(level)) {
    const hit = bundle.find((b) => b.text.includes(needle));
    if (hit) leaks.push(`${level.id}: "${needle}" em ${hit.file}`);
  }
}

for (const chapter of CONTENT_CHAPTERS) {
  for (const needle of chapterNeedles(chapter)) {
    const hit = bundle.find((b) => b.text.includes(needle));
    if (hit) leaks.push(`${chapter.id}: "${needle}" em ${hit.file}`);
  }
}

const missing = FREE_LEVELS.flatMap((level) => needles(level).filter((n) => !bundle.some((b) => b.text.includes(n))).map((n) => `${level.id}: "${n}"`));

missing.push(...FREE_CHAPTERS.flatMap((ch) => chapterNeedles(ch).filter((n) => !bundle.some((b) => b.text.includes(n))).map((n) => `${ch.id}: "${n}"`)));

if (missing.length) {
  console.error('check-bundle: a busca não achou nem as fases abertas; a verificação não é confiável:\n' + missing.join('\n'));
  process.exit(1);
}
if (leaks.length) {
  console.error('check-bundle: conteúdo de fases fechadas apareceu no bundle:\n' + leaks.join('\n'));
  process.exit(1);
}
console.log(`check-bundle: ok (${CONTENT_LEVELS.length} fases e ${CONTENT_CHAPTERS.length} capítulos fechados fora do bundle; ${FREE_LEVELS.length} fases e ${FREE_CHAPTERS.length} capítulos abertos dentro)`);
