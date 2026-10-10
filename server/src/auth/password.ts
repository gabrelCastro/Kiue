import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/*
 * Hash de senha com scrypt (memória + CPU caros para quem tenta adivinhar em massa), sal aleatório
 * por senha e comparação em tempo constante. O formato guarda os parâmetros junto do hash:
 *
 *   scrypt$<log2 N>$<r>$<p>$<sal base64url>$<hash base64url>
 *
 * Assim dá para subir o custo no futuro: hashes antigos continuam válidos e `needsRehash` avisa
 * quando regravar (no próximo login bem-sucedido).
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const R = 8;
const P = 1;

function scrypt(password: string, salt: Buffer, cost: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** cost;
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r + 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string, cost: number): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, cost, R, P);
  return ['scrypt', cost, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, cost, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), Number(cost), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function needsRehash(stored: string, cost: number): boolean {
  const parts = stored.split('$');
  return parts[0] !== 'scrypt' || Number(parts[1]) !== cost || Number(parts[2]) !== R || Number(parts[3]) !== P;
}
