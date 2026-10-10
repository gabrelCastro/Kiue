/** Erro vindo da API (ou da falta dela), com mensagem pronta para mostrar ao jogador. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }

  /** Servidor fora do ar ou inexistente (jogo sem back-end): o jogo segue sem conta. */
  get offline(): boolean {
    return this.code === 'network';
  }
}

const OFFLINE = 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.';

/**
 * Chamada JSON à API no mesmo domínio (`/api`). O cookie de sessão é httpOnly: o navegador o envia
 * sozinho e o JavaScript nunca o vê. O `Origin` que o navegador manda é o que a API confere contra CSRF.
 */
export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', OFFLINE);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  // sem JSON = não é a nossa API (servidor de arquivos estáticos, proxy sem back-end)
  if (!isJson) throw new ApiError(res.status, 'network', OFFLINE);
  const data = await res.json();
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'internal', err.message ?? 'Erro inesperado.', err.field);
  }
  return data as T;
}
