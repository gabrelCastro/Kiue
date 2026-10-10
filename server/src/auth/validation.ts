import { HttpError } from '../errors';

/*
 * Validação de entrada. Regras de senha seguem o NIST SP 800-63B: comprimento mínimo, sem regras
 * de composição (que levam a senhas previsíveis), bloqueio das senhas mais óbvias.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 60;
const EMAIL_MAX = 254;

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'senha123',
  'senha1234',
  'qwerty123',
  'qwertyuiop',
  '11111111',
  '00000000',
  'abcd1234',
  'iloveyou',
  'kiue',
  'kiue1234',
  'amazonsqs',
]);

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw invalid('email', 'Informe o e-mail.');
  const email = raw.trim().toLowerCase();
  if (!email) throw invalid('email', 'Informe o e-mail.');
  // checagem leve: o que vale de verdade é o link chegar na caixa de entrada
  if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('email', 'E-mail inválido.');
  return email;
}

export function validateName(raw: unknown): string {
  if (typeof raw !== 'string') throw invalid('name', 'Informe seu nome.');
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) throw invalid('name', 'Informe seu nome.');
  if (name.length > NAME_MAX) throw invalid('name', `Use no máximo ${NAME_MAX} caracteres.`);
  return name;
}

export function validateNewPassword(raw: unknown, field = 'password', email?: string): string {
  if (typeof raw !== 'string' || raw.length === 0) throw invalid(field, 'Informe a senha.');
  if (raw.length < PASSWORD_MIN) throw invalid(field, `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`);
  if (raw.length > PASSWORD_MAX) throw invalid(field, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`);
  const lower = raw.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(raw)) throw invalid(field, 'Essa senha é fácil demais de adivinhar.');
  if (email && (lower === email || lower === email.split('@')[0])) throw invalid(field, 'A senha não pode ser o seu e-mail.');
  return raw;
}

/** Senha informada para conferir (login, confirmação): só checa presença e tamanho. */
export function passwordInput(raw: unknown, field = 'password'): string {
  if (typeof raw !== 'string' || raw.length === 0) throw invalid(field, 'Informe a senha.');
  if (raw.length > PASSWORD_MAX) throw invalid(field, 'Senha inválida.');
  return raw;
}

export function tokenInput(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(raw)) throw new HttpError('invalid_token', 'Link inválido ou expirado. Peça um novo.', 400);
  return raw;
}

function invalid(field: string, message: string): HttpError {
  return new HttpError('validation', message, 400, field);
}
