import { render } from 'preact';
import { ProgressSync } from './account/progress-sync';
import { sandboxes } from './account/sandboxes';
import { api, ApiError } from './api/http';
import { auth } from './auth/store';
import type { Level } from './game/level-types';
import { Controller } from './game/controller';
import { App } from './ui/App';
import { ControllerContext } from './ui/hooks';
import './styles.css';

const ctrl = new Controller();

// link de "esqueci a senha": abre o formulário e tira o token da barra de endereço (e do histórico)
const params = new URLSearchParams(location.search);
const resetToken = params.get('reset');
if (resetToken) {
  params.delete('reset');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  auth.open('reset', { token: resetToken });
}
// volta do login com o Google com erro: mostra o motivo e limpa o endereço
const AUTH_ERRORS: Record<string, string> = {
  google_denied: 'Você cancelou o login com o Google.',
  google_unverified: 'O Google não confirmou o e-mail dessa conta, então não dá para entrar com ela.',
  rate_limited: 'Muitas tentativas a partir desta rede. Tente de novo em alguns minutos.',
  google_failed: 'Não foi possível entrar com o Google. Tente de novo.',
};
const authError = params.get('auth_error');
if (authError) {
  params.delete('auth_error');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  auth.open('login', { error: AUTH_ERRORS[authError] ?? AUTH_ERRORS.google_failed });
}
// visitantes jogam o começo; o resto abre com conta
const syncAccess = () => ctrl.setAccess(auth.status === 'signed-in' ? 'member' : 'guest');
auth.subscribe(syncAccess);
new ProgressSync(ctrl, auth);
auth.subscribe(() => auth.status !== 'signed-in' && sandboxes.list && sandboxes.reset());
ctrl.onAccountRequired = (level) => {
  if (auth.status === 'loading') return; // ainda não sabemos se há sessão; o clique seguinte resolve
  auth.open('register', { reason: `“${level.title}” faz parte do conteúdo para quem tem conta. Crie uma conta grátis (ou entre) para liberar todas as fases e o sandbox completo.` });
};
// fases fechadas não vêm no bundle: chegam da API, só para quem está logado
ctrl.fetchLevel = async (id) => {
  try {
    return (await api<{ level: Level }>('GET', `/levels/${encodeURIComponent(id)}`)).level;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'unauthenticated') {
      void auth.init(); // a sessão caiu: volta a visitante e o menu mostra o cadeado
      throw new Error('Sua sessão terminou. Entre de novo para jogar esta fase.');
    }
    throw e;
  }
};
void auth.init();

render(
  <ControllerContext.Provider value={ctrl}>
    <App />
  </ControllerContext.Provider>,
  document.getElementById('app')!,
);

// PWA: cache do jogo para abrir sem rede (só no build; em desenvolvimento atrapalha o hot reload)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
