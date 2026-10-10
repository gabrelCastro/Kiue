import { request, type FullConfig } from '@playwright/test';

/** Sessão de membro compartilhada pelos testes que abrem fases fechadas para visitantes. */
export const MEMBER_STATE = 'e2e/.auth/member.json';

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const res = await ctx.post('/api/auth/register', {
    data: { name: 'Membro de Teste', email: `membro-${Date.now()}@example.com`, password: 'senha-dos-testes-e2e' },
  });
  if (!res.ok()) throw new Error(`cadastro do membro de teste falhou: ${res.status()} ${await res.text()}`);
  await ctx.storageState({ path: MEMBER_STATE });
  await ctx.dispose();
}
