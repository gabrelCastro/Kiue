// Gera os ícones do PWA (PNG) a partir do logo: três blocos pretos/cinza em fundo claro.
// Sem dependências: monta o PNG na mão com zlib. Uso: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), 8 + data.length);
  return out;
};

/** `safe`: o logo ocupa a zona segura central (ícone "maskable" é recortado pelo sistema). */
function png(size, safe) {
  const bg = [250, 250, 250];
  const cubes = [
    { c: [17, 17, 17], i: 0 },
    { c: [107, 107, 107], i: 1 },
    { c: [189, 189, 189], i: 2 },
  ];
  const span = size * (safe ? 0.5 : 0.72); // largura total do trio
  const cube = span / 3.3;
  const gap = (span - cube * 3) / 2;
  const x0 = (size - span) / 2;
  const y0 = (size - cube) / 2;
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let px = bg;
      for (const { c, i } of cubes) {
        const cx = x0 + i * (cube + gap);
        if (x >= cx && x < cx + cube && y >= y0 && y < y0 + cube) px = c;
      }
      rows.set(px, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, false));
writeFileSync('public/icons/icon-512.png', png(512, false));
writeFileSync('public/icons/maskable-512.png', png(512, true));
writeFileSync('public/icons/apple-touch-icon.png', png(180, false));
console.log('ícones gerados em public/icons');
