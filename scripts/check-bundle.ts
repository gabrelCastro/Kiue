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

const missing = FREE_LEVELS.flatMap((level) => needles(level).filter((n) => !bundle.some((b) => b.text.includes(n))).map((n) => `${level.id}: "${n}"`));

if (missing.length) {
  console.error('check-bundle: a busca não achou nem as fases abertas; a verificação não é confiável:\n' + missing.join('\n'));
  process.exit(1);
}
if (leaks.length) {
  console.error('check-bundle: conteúdo de fases fechadas apareceu no bundle:\n' + leaks.join('\n'));
  process.exit(1);
}
console.log(`check-bundle: ok (${CONTENT_LEVELS.length} fases fechadas fora do bundle, ${FREE_LEVELS.length} abertas dentro)`);
