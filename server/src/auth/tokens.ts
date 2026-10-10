import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Token secreto opaco (256 bits) para cookies de sessão e links de redefinição. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** O banco guarda só o hash do token: quem lê o banco não consegue se passar pelo usuário. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newId(): string {
  return randomUUID();
}
