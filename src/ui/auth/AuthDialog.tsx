import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useId, useReducer, useRef, useState } from 'preact/hooks';
import { ApiError } from '../../api/http';
import { auth, type AuthStore, type DialogMode } from '../../auth/store';

/** Re-renderiza quando o estado de autenticação muda. */
export function useAuth(): AuthStore {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const unsubscribe = auth.subscribe(() => force(undefined));
    // a resposta do servidor pode ter chegado entre a renderização e a inscrição: sincroniza
    force(undefined);
    return unsubscribe;
  }, []);
  return auth;
}

const PASSWORD_MIN = 8;

const TITLES: Record<DialogMode, string> = {
  login: 'Entrar',
  register: 'Criar conta',
  forgot: 'Esqueci minha senha',
  reset: 'Nova senha',
  account: 'Sua conta',
};

export function AuthDialog() {
  const a = useAuth();
  const d = a.dialog;
  useEffect(() => {
    if (!d) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && auth.close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d]);
  if (!d) return null;

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && auth.close()}>
      <div class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="row between">
          <h2 id="auth-title">{TITLES[d.mode]}</h2>
          <button class="btn ghost icon" onClick={() => auth.close()} aria-label="Fechar">
            ✕
          </button>
        </div>
        {a.status === 'offline' && (
          <Alert kind="warning">O servidor de contas não está disponível agora. Sem conta, você continua com as fases 1 e 2 e o sandbox limitado.</Alert>
        )}
        {d.reason && <Alert kind="info">{d.reason}</Alert>}
        {d.notice && <Alert kind="success">{d.notice}</Alert>}
        {d.mode === 'login' && <LoginForm />}
        {d.mode === 'register' && <RegisterForm />}
        {d.mode === 'forgot' && <ForgotForm />}
        {d.mode === 'reset' && <ResetForm token={d.token ?? ''} />}
        {d.mode === 'account' && <AccountPanel />}
      </div>
    </div>
  );
}

// ───────────── formulários ─────────────

function LoginForm() {
  const f = useForm();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form class="auth-form" noValidate onSubmit={f.submit(() => auth.login(email, password))}>
      <Field label="E-mail" error={f.fieldError('email')}>
        <TextInput type="email" autoComplete="email" value={email} onValue={setEmail} autoFocus required />
      </Field>
      <Field
        label="Senha"
        error={f.fieldError('password')}
        action={
          <button type="button" class="linklike small" onClick={() => auth.open('forgot')}>
            Esqueci minha senha
          </button>
        }
      >
        <PasswordInput value={password} onInput={setPassword} autoComplete="current-password" />
      </Field>
      <FormError error={f.generalError} />
      <button class="btn primary block" disabled={f.busy}>
        {f.busy ? 'Entrando…' : 'Entrar'}
      </button>
      <p class="auth-switch">
        Ainda não tem conta?{' '}
        <button type="button" class="linklike" onClick={() => auth.open('register')}>
          Criar conta
        </button>
      </p>
    </form>
  );
}

function RegisterForm() {
  const f = useForm();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form
      class="auth-form"
      noValidate
      onSubmit={f.submit(() => {
        if (password.length < PASSWORD_MIN) throw new ApiError(400, 'validation', `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`, 'password');
        return auth.register(name, email, password);
      })}
    >
      {!auth.dialog?.reason && <p class="muted small auth-lead">Com a conta você libera as 22 fases das duas trilhas e o sandbox completo. É grátis.</p>}
      <Field label="Nome" error={f.fieldError('name')}>
        <TextInput type="text" autoComplete="name" maxLength={60} value={name} onValue={setName} autoFocus required />
      </Field>
      <Field label="E-mail" error={f.fieldError('email')}>
        <TextInput type="email" autoComplete="email" value={email} onValue={setEmail} required />
      </Field>
      <Field label="Senha" hint={`Pelo menos ${PASSWORD_MIN} caracteres. Uma frase longa é mais forte que símbolos.`} error={f.fieldError('password')}>
        <PasswordInput value={password} onInput={setPassword} autoComplete="new-password" />
      </Field>
      <FormError error={f.generalError} />
      <button class="btn primary block" disabled={f.busy}>
        {f.busy ? 'Criando…' : 'Criar conta'}
      </button>
      <p class="auth-switch">
        Já tem conta?{' '}
        <button type="button" class="linklike" onClick={() => auth.open('login')}>
          Entrar
        </button>
      </p>
    </form>
  );
}

function ForgotForm() {
  const f = useForm();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div class="auth-form">
        <Alert kind="info">
          Se existir uma conta com <b>{email}</b>, enviamos um link para criar uma nova senha. Ele vale por 30 minutos.
        </Alert>
        <button class="btn block" onClick={() => auth.open('login')}>
          Voltar para entrar
        </button>
      </div>
    );
  }
  return (
    <form class="auth-form" noValidate onSubmit={f.submit(async () => (await auth.requestReset(email), setSent(true)))}>
      <p class="muted small auth-lead">Informe o e-mail da conta. Vamos mandar um link para você criar uma nova senha.</p>
      <Field label="E-mail" error={f.fieldError('email')}>
        <TextInput type="email" autoComplete="email" value={email} onValue={setEmail} autoFocus required />
      </Field>
      <FormError error={f.generalError} />
      <button class="btn primary block" disabled={f.busy}>
        {f.busy ? 'Enviando…' : 'Enviar link'}
      </button>
      <p class="auth-switch">
        <button type="button" class="linklike" onClick={() => auth.open('login')}>
          Voltar para entrar
        </button>
      </p>
    </form>
  );
}

function ResetForm({ token }: { token: string }) {
  const f = useForm();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  return (
    <form
      class="auth-form"
      noValidate
      onSubmit={f.submit(() => {
        if (password !== confirm) throw new ApiError(400, 'validation', 'As senhas não conferem.', 'confirm');
        return auth.resetPassword(token, password);
      })}
    >
      <Field label="Nova senha" hint={`Pelo menos ${PASSWORD_MIN} caracteres.`} error={f.fieldError('newPassword')}>
        <PasswordInput value={password} onInput={setPassword} autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Repita a nova senha" error={f.fieldError('confirm')}>
        <PasswordInput value={confirm} onInput={setConfirm} autoComplete="new-password" />
      </Field>
      <FormError error={f.generalError} />
      {f.generalError?.code === 'invalid_token' && (
        <button type="button" class="linklike" onClick={() => auth.open('forgot')}>
          Pedir um link novo
        </button>
      )}
      <button class="btn primary block" disabled={f.busy}>
        {f.busy ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  );
}

// ───────────── conta ─────────────

function AccountPanel() {
  const a = useAuth();
  const user = a.user;
  if (!user) return null;
  return (
    <div class="account">
      <div class="account-head">
        <Avatar name={user.name} large />
        <div>
          <div class="account-name">{user.name}</div>
          <div class="muted small">{user.email}</div>
          <div class="muted small">Conta criada em {new Date(user.createdAt).toLocaleDateString('pt-BR')}</div>
        </div>
      </div>
      <NameSection initial={user.name} />
      <PasswordSection />
      <SessionsSection />
      <DeleteSection />
      <div class="row end">
        <button class="btn" onClick={() => void auth.logout()}>
          Sair
        </button>
      </div>
    </div>
  );
}

function NameSection({ initial }: { initial: string }) {
  const f = useForm();
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <form
      class="account-section"
      noValidate
      onSubmit={f.submit(async () => {
        await auth.updateName(name);
        setSaved(true);
      })}
    >
      <Field label="Nome" error={f.fieldError('name')}>
        <div class="input-row">
          <TextInput
            type="text"
            autoComplete="name"
            maxLength={60}
            value={name}
            onValue={(v) => {
              setName(v);
              setSaved(false);
            }}
          />
          <button class="btn" disabled={f.busy || name.trim() === initial}>
            Salvar
          </button>
        </div>
      </Field>
      {saved && <p class="field-ok">Nome atualizado.</p>}
      <FormError error={f.generalError} />
    </form>
  );
}

function PasswordSection() {
  const f = useForm();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);
  if (!open) {
    return (
      <div class="account-section row between">
        <div>
          <div class="field-label">Senha</div>
          {done ? <p class="field-ok">Senha alterada. Os outros aparelhos foram desconectados.</p> : <div class="muted small">Troque quando quiser.</div>}
        </div>
        <button class="btn" onClick={() => setOpen(true)}>
          Alterar senha
        </button>
      </div>
    );
  }
  return (
    <form
      class="account-section auth-form"
      noValidate
      onSubmit={f.submit(async () => {
        await auth.changePassword(current, next);
        setOpen(false);
        setDone(true);
        setCurrent('');
        setNext('');
      })}
    >
      <div class="field-label">Alterar senha</div>
      <Field label="Senha atual" error={f.fieldError('currentPassword')}>
        <PasswordInput value={current} onInput={setCurrent} autoComplete="current-password" autoFocus />
      </Field>
      <Field label="Nova senha" hint={`Pelo menos ${PASSWORD_MIN} caracteres. Os outros aparelhos serão desconectados.`} error={f.fieldError('newPassword')}>
        <PasswordInput value={next} onInput={setNext} autoComplete="new-password" />
      </Field>
      <FormError error={f.generalError} />
      <div class="row end gap">
        <button type="button" class="btn ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button class="btn primary" disabled={f.busy}>
          Salvar senha
        </button>
      </div>
    </form>
  );
}

function SessionsSection() {
  const f = useForm();
  const [result, setResult] = useState<number | null>(null);
  return (
    <div class="account-section">
      <div class="row between">
        <div>
          <div class="field-label">Outros aparelhos</div>
          <div class="muted small">Desconecta a conta de todos os outros navegadores.</div>
        </div>
        <button class="btn" disabled={f.busy} onClick={f.submit(async () => setResult(await auth.logoutOthers()))}>
          Sair dos outros
        </button>
      </div>
      {result !== null && <p class="field-ok">{result === 0 ? 'Nenhum outro aparelho estava conectado.' : `${result} ${result === 1 ? 'aparelho desconectado' : 'aparelhos desconectados'}.`}</p>}
      <FormError error={f.generalError} />
    </div>
  );
}

function DeleteSection() {
  const f = useForm();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  if (!open) {
    return (
      <div class="account-section row between">
        <div>
          <div class="field-label">Excluir conta</div>
          <div class="muted small">Apaga a conta e tudo o que estiver salvo nela.</div>
        </div>
        <button class="btn danger" onClick={() => setOpen(true)}>
          Excluir…
        </button>
      </div>
    );
  }
  return (
    <form class="account-section auth-form danger-zone" noValidate onSubmit={f.submit(() => auth.deleteAccount(password))}>
      <Alert kind="error">Esta ação não pode ser desfeita. Confirme com a sua senha.</Alert>
      <Field label="Senha" error={f.fieldError('password')}>
        <PasswordInput value={password} onInput={setPassword} autoComplete="current-password" autoFocus />
      </Field>
      <FormError error={f.generalError} />
      <div class="row end gap">
        <button type="button" class="btn ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button class="btn danger" disabled={f.busy}>
          Excluir conta
        </button>
      </div>
    </form>
  );
}

// ───────────── peças de formulário ─────────────

/** Estado comum de um formulário: enviando, erro por campo e erro geral. */
function useForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return {
    busy,
    fieldError: (field: string) => (error?.field === field ? error.message : undefined),
    generalError: error && !error.field ? error : null,
    submit:
      (fn: () => Promise<unknown> | unknown) =>
      async (e?: Event): Promise<void> => {
        e?.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
          await fn();
        } catch (err) {
          setError(err instanceof ApiError ? err : new ApiError(0, 'internal', 'Erro inesperado. Tente de novo.'));
        } finally {
          setBusy(false);
        }
      },
  };
}

/** Liga rótulo, campo e mensagens por id (o leitor de tela anuncia o erro junto do campo). */
const FieldContext = createContext<{ id: string; describedBy?: string; invalid: boolean } | null>(null);

function Field({ label, hint, error, action, children }: { label: string; hint?: string; error?: string; action?: ComponentChildren; children: ComponentChildren }) {
  const id = useId();
  const message = error ?? hint;
  return (
    <div class={`form-field ${error ? 'has-error' : ''}`}>
      <span class="row between">
        <label class="field-label" for={id}>
          {label}
        </label>
        {action}
      </span>
      <FieldContext.Provider value={{ id, describedBy: message ? `${id}-msg` : undefined, invalid: !!error }}>{children}</FieldContext.Provider>
      {message && (
        <span id={`${id}-msg`} class={error ? 'field-error' : 'field-help'} role={error ? 'alert' : undefined}>
          {message}
        </span>
      )}
    </div>
  );
}

function TextInput({ type, onValue, ...rest }: { type: 'text' | 'email'; value: string; onValue: (v: string) => void; autoComplete: string; autoFocus?: boolean; maxLength?: number; required?: boolean }) {
  const field = useContext(FieldContext);
  return (
    <input
      {...rest}
      type={type as 'text'} // mesma limitação de tipos do Preact que em PasswordInput
      onInput={(e) => onValue(e.currentTarget.value)}
      id={field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
    />
  );
}

function PasswordInput({ value, onInput, autoComplete, autoFocus }: { value: string; onInput: (v: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const field = useContext(FieldContext);
  return (
    <span class="password-input">
      <input
        ref={ref}
        id={field?.id}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        // os tipos do Preact separam inputs por `type`; o valor aqui alterna em tempo de execução
        type={(visible ? 'text' : 'password') as 'text'}
        autoComplete={autoComplete}
        value={value}
        onInput={(e) => onInput(e.currentTarget.value)}
        autoFocus={autoFocus}
        maxLength={128}
        required
      />
      <button
        type="button"
        class="reveal"
        onClick={() => {
          setVisible(!visible);
          ref.current?.focus();
        }}
        aria-label={visible ? 'Esconder senha' : 'Mostrar senha'}
        aria-pressed={visible}
      >
        {visible ? 'Esconder' : 'Mostrar'}
      </button>
    </span>
  );
}

function FormError({ error }: { error: ApiError | null }) {
  return error ? <Alert kind="error">{error.message}</Alert> : null;
}

function Alert({ kind, children }: { kind: 'info' | 'success' | 'warning' | 'error'; children: ComponentChildren }) {
  return (
    <div class={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span class={`avatar ${large ? 'large' : ''}`} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}
