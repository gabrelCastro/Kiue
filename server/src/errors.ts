export type ErrorCode =
  | 'validation'
  | 'email_taken'
  | 'invalid_credentials'
  | 'unauthenticated'
  | 'rate_limited'
  | 'invalid_token'
  | 'forbidden_origin'
  | 'not_found'
  | 'conflict'
  | 'quota_exceeded';

/** Erro esperado da API: vira `{ error: { code, message, field? } }` com o status HTTP dado. */
export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    readonly field?: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}
