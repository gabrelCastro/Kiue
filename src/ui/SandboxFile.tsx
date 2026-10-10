import { useEffect, useRef, useState } from 'preact/hooks';
import { sandboxes } from '../account/sandboxes';
import { ApiError } from '../api/http';
import { useAuth } from './auth/AuthDialog';
import { useController } from './hooks';

type SaveError = { kind: 'conflict' | 'other'; message: string } | null;

/** Painel "Arquivo" do sandbox para quem tem conta: nome, salvar, salvar cópia. */
export function SandboxFile() {
  const ctrl = useController();
  const a = useAuth();
  const ref = ctrl.sandboxRef;
  const [name, setName] = useState(ref?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SaveError>(null);
  const input = useRef<HTMLInputElement>(null);

  // abriu outro sandbox (ou começou um novo): o campo acompanha
  useEffect(() => {
    setName(ctrl.sandboxRef?.name ?? '');
    setError(null);
  }, [ctrl.sandboxRef?.id]);

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const renamed = !!ref && trimmed !== ref.name;
  const dirty = ctrl.sandboxDirty || renamed;

  async function save(mode: 'save' | 'copy' | 'overwrite' = 'save') {
    if (busy) return;
    if (!trimmed) {
      setError({ kind: 'other', message: 'Dê um nome ao sandbox para salvar.' });
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    // o que mudar enquanto salva continua marcado como não salvo
    const version = ctrl.graphVersion;
    const graph = structuredClone(ctrl.graph);
    try {
      let doc;
      if (ref && mode === 'save') doc = await sandboxes.update(ref.id, ref.revision, { name: trimmed, graph });
      else if (ref && mode === 'overwrite') doc = await sandboxes.update(ref.id, (await sandboxes.get(ref.id)).revision, { name: trimmed, graph });
      else doc = await sandboxes.create(mode === 'copy' && ref && trimmed === ref.name ? `${trimmed} (cópia)` : trimmed, graph);
      ctrl.markSandboxSaved({ id: doc.id, name: doc.name, revision: doc.revision }, version);
      setName(doc.name);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict') setError({ kind: 'conflict', message: e.message });
      else if (e instanceof ApiError && e.code === 'not_found') {
        setError({ kind: 'other', message: 'Este sandbox foi excluído. Use "Salvar cópia" para guardar o que está na tela.' });
      } else setError({ kind: 'other', message: e instanceof Error ? e.message : 'Não foi possível salvar.' });
    } finally {
      setBusy(false);
    }
  }

  // Ctrl+S / Cmd+S salva (inclusive com o foco no campo do nome)
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (a.status !== 'signed-in') return null;

  const status = busy ? 'Salvando…' : ref ? (dirty ? 'Alterações não salvas' : 'Salvo na sua conta') : ctrl.sandboxDirty ? 'Ainda não salvo' : 'Sandbox novo';
  return (
    <div class="panel sandbox-file">
      <h3>Arquivo</h3>
      <form
        class="sandbox-file-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label class="visually-hidden" for="sandbox-name">
          Nome do sandbox
        </label>
        <input id="sandbox-name" ref={input} class="text-input" placeholder="Nome do sandbox" maxLength={60} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <div class="row gap">
          <button class="btn primary tiny" disabled={busy || (!!ref && !dirty)} title="Ctrl+S">
            Salvar
          </button>
          {ref && (
            <button type="button" class="btn tiny" disabled={busy} onClick={() => void save('copy')}>
              Salvar cópia
            </button>
          )}
        </div>
      </form>
      <p class={`sandbox-status small ${dirty && !busy ? 'dirty' : ''}`} role="status">
        {status}
      </p>
      {error && (
        <div class="alert alert-error small" role="alert">
          {error.message}
          {error.kind === 'conflict' && (
            <div class="row gap sandbox-conflict">
              <button class="btn tiny" onClick={() => void save('overwrite')}>
                Sobrescrever
              </button>
              <button class="btn tiny" onClick={() => void save('copy')}>
                Salvar cópia
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
