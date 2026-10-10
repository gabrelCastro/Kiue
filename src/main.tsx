import { render } from 'preact';
import { auth } from './auth/store';
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
// visitantes jogam o começo; o resto abre com conta
const syncAccess = () => ctrl.setAccess(auth.status === 'signed-in' ? 'member' : 'guest');
auth.subscribe(syncAccess);
ctrl.onAccountRequired = (level) => {
  if (auth.status === 'loading') return; // ainda não sabemos se há sessão; o clique seguinte resolve
  auth.open('register', { reason: `“${level.title}” faz parte do conteúdo para quem tem conta. Crie uma conta grátis (ou entre) para liberar todas as fases e o sandbox completo.` });
};
void auth.init();

render(
  <ControllerContext.Provider value={ctrl}>
    <App />
  </ControllerContext.Provider>,
  document.getElementById('app')!,
);
