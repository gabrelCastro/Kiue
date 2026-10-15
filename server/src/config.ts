/** Configuração do servidor, lida do ambiente uma vez na subida. */
export interface Config {
  port: number;
  /** Caminho do arquivo SQLite (`:memory:` nos testes). */
  databasePath: string;
  /** Origens que podem fazer requisições que mudam estado (proteção contra CSRF). */
  allowedOrigins: string[];
  /** URL pública do jogo, usada nos links enviados por e-mail. */
  appUrl: string;
  /** Cookie só por HTTPS (e com prefixo `__Host-`). Desligado só em desenvolvimento local. */
  secureCookies: boolean;
  /** Atrás de um proxy (CloudFront, ALB, nginx): o IP do cliente vem de `X-Forwarded-For`. */
  trustProxy: boolean;
  /** Sessão expira após este tempo sem uso; cada uso renova. */
  sessionIdleDays: number;
  /** Limite absoluto de uma sessão, mesmo em uso contínuo. */
  sessionMaxDays: number;
  /** Validade do link de redefinição de senha. */
  resetTokenMinutes: number;
  /** Custo do scrypt (N = 2^cost). Mais alto = mais lento para o atacante e para o servidor. */
  scryptCost: number;
  /** Credenciais OAuth do Google; sem as duas, o login com Google fica desligado. */
  googleClientId: string | null;
  googleClientSecret: string | null;
  /** Pasta com o build do front-end para servir junto da API (produção num processo só). */
  staticDir: string | null;
}

function int(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number(value);
  return Number.isInteger(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const appUrl = env.APP_URL ?? 'http://localhost:5173';
  return {
    port: int(env.PORT, 8787),
    databasePath: env.DATABASE_PATH ?? 'data/kiue.db',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? appUrl)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    appUrl,
    secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : production,
    trustProxy: env.TRUST_PROXY === 'true',
    sessionIdleDays: int(env.SESSION_IDLE_DAYS, 30),
    sessionMaxDays: int(env.SESSION_MAX_DAYS, 180),
    resetTokenMinutes: int(env.RESET_TOKEN_MINUTES, 30),
    scryptCost: int(env.SCRYPT_COST, 15),
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || null,
    staticDir: env.STATIC_DIR ?? null,
  };
}
