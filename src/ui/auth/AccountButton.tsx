import { auth } from '../../auth/store';
import { Avatar, useAuth } from './AuthDialog';

/** Botão de conta nas barras escuras: "Entrar" para visitantes, nome + avatar para quem está logado. */
export function AccountButton() {
  const a = useAuth();
  if (a.status === 'loading') return <span class="account-slot" />;
  if (a.status === 'signed-in' && a.user) {
    return (
      <button class="btn account-btn" onClick={() => auth.open('account')} title={`${a.user.name} (${a.user.email})`}>
        <Avatar name={a.user.name} />
        <span class="account-btn-name">{a.user.name.split(' ')[0]}</span>
      </button>
    );
  }
  return (
    <button class="btn" onClick={() => auth.open('login')} title={a.status === 'offline' ? 'Servidor de contas indisponível' : undefined}>
      Entrar
    </button>
  );
}
