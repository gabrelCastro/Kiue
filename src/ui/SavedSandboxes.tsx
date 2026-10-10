import { useEffect, useState } from 'preact/hooks';
import { sandboxes, type SandboxSummary } from '../account/sandboxes';
import { useAuth } from './auth/AuthDialog';
import { useController } from './hooks';
import { useSandboxes } from './sandbox-hooks';

const when = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Seção do menu com os sandboxes salvos na conta. */
export function SavedSandboxes() {
  const a = useAuth();
  const store = useSandboxes();
  const userId = a.status === 'signed-in' ? a.user?.id : undefined;
  useEffect(() => {
    if (userId) void sandboxes.refresh();
  }, [userId]);
  if (!userId) return null;

  const list = store.list;
  return (
    <section class="track saved-sandboxes">
      <div class="row between">
        <h2>Seus sandboxes</h2>
        {list && <span class="muted small">{`${list.length} de ${store.limit}`}</span>}
      </div>
      <p class="muted">Arquiteturas livres salvas na sua conta. Abra uma, mude e salve de novo.</p>
      {store.error && (
        <div class="alert alert-error small" role="alert">
          {store.error}{' '}
          <button class="linklike" onClick={() => void sandboxes.refresh()}>
            Tentar de novo
          </button>
        </div>
      )}
      <div class="level-grid">
        <NewSandboxCard />
        {list?.map((sb) => <SandboxCard key={sb.id} sb={sb} />)}
      </div>
    </section>
  );
}

function NewSandboxCard() {
  const ctrl = useController();
  return (
    <button class="sandbox-card new" onClick={() => ctrl.startLevel('sandbox')}>
      <span class="sc-plus" aria-hidden="true">
        +
      </span>
      <span class="sc-name">Novo sandbox</span>
    </button>
  );
}

function SandboxCard({ sb }: { sb: SandboxSummary }) {
  const ctrl = useController();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const doc = await sandboxes.get(sb.id);
      ctrl.openSavedSandbox({ id: doc.id, name: doc.name, revision: doc.revision }, doc.graph);
    } catch (e) {
      ctrl.flash(e instanceof Error ? e.message : 'Não foi possível abrir o sandbox.', 'error');
      void sandboxes.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Excluir o sandbox "${sb.name}"? Não dá para desfazer.`)) return;
    try {
      await sandboxes.remove(sb.id);
    } catch (e) {
      ctrl.flash(e instanceof Error ? e.message : 'Não foi possível excluir.', 'error');
    }
  }

  return (
    <div class="sandbox-card">
      <button class="sc-open" disabled={busy} onClick={() => void open()}>
        <span class="sc-name">{sb.name}</span>
        <span class="sc-meta">
          {sb.nodeCount} {sb.nodeCount === 1 ? 'peça' : 'peças'} · {when.format(sb.updatedAt)}
        </span>
      </button>
      <button class="btn ghost tiny sc-delete" onClick={() => void remove()} aria-label={`Excluir ${sb.name}`} title="Excluir">
        Excluir
      </button>
    </div>
  );
}
