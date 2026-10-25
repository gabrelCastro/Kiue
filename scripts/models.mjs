/**
 * Gera src/render/models.gen.ts a partir dos modelos OpenSCAD de models/.
 *
 * Cada parte (um material) é exportada como STL, os vértices repetidos são unidos e a malha
 * vira posições Int16 (centésimos de mm) + índices Uint16, em base64. O resultado vai para o
 * repositório: o build, o CI e o Docker não precisam do OpenSCAD. Rode de novo depois de mudar
 * um .scad:  node scripts/models.mjs   (precisa do `openscad` no PATH)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** modelo → partes. `exporta=true` faz as peças móveis saírem na própria origem (articulação, célula, portão). */
const MODELS = {
  consumidor: ['corpo', 'detalhe', 'tampo', 'celula', 'luz', 'giro', 'superior', 'antebraco'],
  fila: ['moldura', 'base', 'detalhe', 'rolos', 'guias', 'alerta'],
  produtor: ['corpo', 'telhado', 'detalhe', 'doca', 'janelas', 'portao', 'palete', 'caixas'],
};

const tmp = mkdtempSync(join(tmpdir(), 'kiue-models-'));

function exportPart(model, part) {
  const out = join(tmp, `${model}_${part}.stl`);
  execFileSync('openscad', ['-D', `parte="${part}"`, '-D', 'exporta=true', '-o', out, `models/${model}.scad`], { stdio: 'pipe' });
  return readFileSync(out, 'utf8');
}

/** STL ASCII → posições indexadas (centésimos de mm) e índices. */
function pack(stl) {
  const verts = [];
  const index = [];
  const seen = new Map();
  for (const m of stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
    const q = [m[1], m[2], m[3]].map((v) => Math.round(Number(v) * 100));
    if (q.some((v) => Math.abs(v) > 32767)) throw new Error('coordenada fora do Int16');
    const key = q.join(',');
    let i = seen.get(key);
    if (i === undefined) {
      i = verts.length / 3;
      seen.set(key, i);
      verts.push(...q);
    }
    index.push(i);
  }
  if (verts.length / 3 > 65535) throw new Error('vértices demais para Uint16');
  // triângulos que viraram linha depois de arredondar não desenham nada
  const tris = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = index.slice(t, t + 3);
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  const buf = Buffer.alloc(verts.length * 2 + tris.length * 2);
  verts.forEach((v, i) => buf.writeInt16LE(v, i * 2));
  tris.forEach((v, i) => buf.writeUInt16LE(v, verts.length * 2 + i * 2));
  return { data: buf.toString('base64'), vertices: verts.length / 3, triangles: tris.length / 3 };
}

const lines = [];
let total = 0;
for (const [model, parts] of Object.entries(MODELS)) {
  for (const part of parts) {
    const p = pack(exportPart(model, part));
    total += p.triangles;
    console.log(`${model}/${part}: ${p.triangles} triângulos, ${p.vertices} vértices`);
    lines.push(`  '${model}/${part}': { v: ${p.vertices}, data: '${p.data}' },`);
  }
}
rmSync(tmp, { recursive: true });

writeFileSync(
  'src/render/models.gen.ts',
  `// Gerado por scripts/models.mjs a partir de models/*.scad. Não edite à mão.\n` +
    `// Formato: v posições Int16 (x, y, z em centésimos de mm, Z para cima) seguidas dos índices Uint16.\n` +
    `export const MODEL_DATA: Record<string, { v: number; data: string }> = {\n${lines.join('\n')}\n};\n`,
);
console.log(`total: ${total} triângulos → src/render/models.gen.ts`);
