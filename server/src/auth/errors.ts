export type AuthErrorCode =
  | 'validation'
  | 'email_taken'
  | 'invalid_credentials'
  | 'unauthenticated'
  | 'rate_limited'
  | 'invalid_token'
  | 'forbidden_origin';

/** Erro esperado da API: vira `{ error: { code, message, field? } }` com o status HTTP dado. */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly status: 400 | 401 | 403 | 409 | 429,
    readonly field?: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}
