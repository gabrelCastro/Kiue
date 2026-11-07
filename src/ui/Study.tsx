import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { auth } from '../auth/store';
import { GLOSSARY, SERVICE_LABEL, type GlossaryEntry } from '../game/glossary';
import type { QuizQuestion } from '../game/level-types';
import { CATALOG, metaById } from '../game/level-catalog';
import { CHAPTERS, chapterForLevel, chapterForTerm, chapterMeta, nextChapter } from '../study/catalog';
import type { Block, ChapterMeta } from '../study/types';
import { AccountButton } from './auth/AccountButton';
import { useController } from './hooks';
import { ThemeButton } from './ThemeButton';
import { CheckIcon, LockIcon } from './icons';
import { Quiz } from './Quiz';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Verbete do glossário por nome: o termo inteiro ou só a parte antes do parêntese. */
function findTerm(name: string): GlossaryEntry | undefined {
  const n = norm(name);
  return GLOSSARY.find((g) => norm(g.term) === n || norm(g.term).startsWith(`${n} (`));
}

// ───────────── tela de estudos ─────────────

export function StudyScreen() {
  const ctrl = useController();
  const s = ctrl.study;
  const readCount = CHAPTERS.filter((c) => s.read.has(c.id)).length;
  return (
    <div class="menu-shell study-shell">
      <nav class="console-nav" aria-label="Navegação">
        <button class="btn ghost back" onClick={() => ctrl.openMenu()}>
          ← Início
        </button>
        <span class="brand">
          <span class="logo" aria-hidden="true">
            <span class="cube c1" />
            <span class="cube c2" />
            <span class="cube c3" />
          </span>
          Estudos
        </span>
        <span class="spacer" />
        <button class="btn" onClick={() => ctrl.startLevel('sandbox')}>
          Sandbox
        </button>
        <ThemeButton />
        <AccountButton />
      </nav>
      <div class="study">
        <div class="study-tabs" role="tablist" aria-label="Seções de estudo">
          <Tab id="apostila" label="Apostila" count={`${readCount} de ${CHAPTERS.length} lidos`} />
          <Tab id="glossario" label="Glossário" count={String(GLOSSARY.length)} />
          <Tab id="revisao" label="Revisão" />
        </div>
        {s.tab === 'apostila' && <Handbook />}
        {s.tab === 'glossario' && <GlossaryView />}
        {s.tab === 'revisao' && <Review />}
      </div>
    </div>
  );
}

function Tab({ id, label, count }: { id: 'apostila' | 'glossario' | 'revisao'; label: string; count?: string }) {
  const ctrl = useController();
  const on = ctrl.study.tab === id;
  return (
    <button role="tab" aria-selected={on} class={`study-tab${on ? ' on' : ''}`} onClick={() => ctrl.study.setTab(id)}>
      {label}
      {count && <span class="count">{count}</span>}
    </button>
  );
}

// ───────────── apostila: índice + leitura ─────────────

function Handbook() {
  const ctrl = useController();
  const s = ctrl.study;
  const [tocOpen, setTocOpen] = useState(false);
  const current = chapterMeta(s.chapterId)!;
  const readCount = CHAPTERS.filter((c) => s.read.has(c.id)).length;
  return (
    <div class="handbook">
      <nav class={`toc${tocOpen ? ' open' : ''}`} aria-label="Capítulos">
        <button class="toc-toggle" aria-expanded={tocOpen} onClick={() => setTocOpen(!tocOpen)}>
          <span>
            Capítulos <span class="muted">· {readCount} de {CHAPTERS.length} lidos</span>
          </span>
          <span aria-hidden="true">{tocOpen ? '▴' : '▾'}</span>
        </button>
        <div class="toc-body">
          <div class="toc-progress">
            <span class="toc-label">Apostila</span>
            <div class="track-bar" aria-hidden="true">
              <span style={{ width: `${(readCount / CHAPTERS.length) * 100}%` }} />
            </div>
            <span class="small muted">
              {readCount} de {CHAPTERS.length} capítulos lidos
            </span>
          </div>
          <ol class="toc-list">
            {CHAPTERS.map((c) => {
              const locked = s.requiresAccount(c.id);
              const read = s.read.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    class={`toc-item${c.id === s.chapterId ? ' on' : ''}${locked ? ' locked' : ''}`}
                    aria-current={c.id === s.chapterId ? 'page' : undefined}
                    onClick={() => {
                      s.select(c.id);
                      setTocOpen(false);
                    }}
                  >
                    <span class="toc-num">{String(c.num).padStart(2, '0')}</span>
                    <span class="toc-title">{c.title}</span>
                    <span class="toc-state" aria-label={read ? 'lido' : locked ? 'precisa de conta' : undefined}>
                      {read ? <CheckIcon /> : locked ? <LockIcon /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </nav>
      <ChapterReader meta={current} />
    </div>
  );
}

/** Um capítulo: cabeçalho, texto, e o rodapé com "lido", fases para praticar e o próximo. */
export function ChapterReader({ meta, compact = false }: { meta: ChapterMeta; compact?: boolean }) {
  const ctrl = useController();
  const s = ctrl.study;
  const chapter = s.chapter(meta.id);
  const locked = s.requiresAccount(meta.id);
  const read = s.read.has(meta.id);
  const next = nextChapter(meta.id);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chapter && !locked) void s.ensure(meta.id);
  }, [meta.id, locked, !!chapter]);

  // chegou ao fim do texto: conta como lido
  useEffect(() => {
    const el = end.current;
    if (!el || !chapter || read || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) s.markRead(meta.id);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [meta.id, !!chapter, read]);

  return (
    <article class={`reader${compact ? ' compact' : ''}`} aria-labelledby={`ch-${meta.id}`}>
      <span class="reader-kicker">
        Capítulo {meta.num} · {meta.minutes} min de leitura
      </span>
      <h2 id={`ch-${meta.id}`}>{meta.title}</h2>
      {locked ? (
        <div class="reader-locked">
          <p>{meta.summary}</p>
          <p class="muted">Este capítulo faz parte do conteúdo para quem tem conta. Os capítulos 1 e 2 e o glossário são abertos.</p>
          <div class="row gap">
            <button class="btn primary" onClick={() => auth.open('register', { reason: `O capítulo “${meta.title}” faz parte do conteúdo para quem tem conta. Crie uma conta grátis (ou entre) para liberar a apostila inteira.` })}>
              Criar conta grátis
            </button>
            <button class="btn" onClick={() => auth.open('login')}>
              Entrar
            </button>
          </div>
        </div>
      ) : !chapter ? (
        s.error(meta.id) && s.loading !== meta.id ? (
          <div class="reader-locked">
            <p class="muted">{s.error(meta.id)}</p>
            <button class="btn" onClick={() => void s.ensure(meta.id)}>
              Tentar de novo
            </button>
          </div>
        ) : (
          <p class="muted">Carregando o capítulo…</p>
        )
      ) : (
        <>
          <div class="reader-body">
            {chapter.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
          <div class="reader-foot" ref={end}>
            <button class={`btn${read ? '' : ' primary'}`} disabled={read} onClick={() => s.markRead(meta.id)}>
              {read ? '✓ Lido' : 'Marcar como lido'}
            </button>
            <Practice levels={meta.levels} />
            {next && !compact && (
              <button class="btn next-chapter" onClick={() => s.select(next.id)}>
                Próximo: {next.title} →
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

/** Fases ligadas ao capítulo, com o estado de cada uma. */
function Practice({ levels }: { levels: string[] }) {
  const ctrl = useController();
  const metas = levels.map((id) => metaById(id)).filter((m) => m !== undefined);
  if (!metas.length) return null;
  return (
    <div class="practice">
      <span class="small muted">Pratique:</span>
      {metas.map((m) => {
        const done = (ctrl.progress[m.id]?.stars ?? 0) > 0;
        const lock = ctrl.lockReason(m);
        const state = done ? 'done' : lock ? 'locked' : 'open';
        const label = m.track === 'certificacao' ? `C${m.index}` : String(m.index);
        return (
          <button
            key={m.id}
            class={`practice-chip ${state}`}
            title={done ? 'Concluída' : lock === 'account' ? 'Precisa de conta' : lock === 'progress' ? 'Termine as fases anteriores' : 'Aberta'}
            onClick={() => {
              ctrl.study.closePanel();
              ctrl.startLevel(m.id);
            }}
            disabled={lock === 'progress'}
          >
            <span class="dot" aria-hidden="true" />
            {label}. {m.title}
          </button>
        );
      })}
    </div>
  );
}

// ───────────── blocos e texto ─────────────

function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case 'p':
      return (
        <p>
          <Rich text={block.text} />
        </p>
      );
    case 'h':
      return <h3>{block.text}</h3>;
    case 'list':
      return (
        <ul>
          {block.items.map((it, i) => (
            <li key={i}>
              <Rich text={it} />
            </li>
          ))}
        </ul>
      );
    case 'note':
      return (
        <div class={`note ${block.kind}`}>
          <b>{block.kind === 'pratica' ? 'Na prática' : block.kind === 'cuidado' ? 'Cuidado' : 'Na prova'}</b>
          <Rich text={block.text} />
        </div>
      );
    case 'flow':
      return (
        <div class="flow" role="img" aria-label={block.steps.map((s) => s.label).join(' → ')}>
          {block.steps.map((st, i) => (
            <>
              {i > 0 && <span class="flow-arrow">→ {block.arrows?.[i - 1] ?? ''}</span>}
              <span class={`flow-step ${st.kind ?? 'plain'}`}>{st.label}</span>
            </>
          ))}
        </div>
      );
    case 'table':
      return (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <Rich text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

const INLINE = /\*\*(.+?)\*\*|\{\{(.+?)(?:\|(.+?))?\}\}/g;

/** Texto com `**negrito**` e `{{termo}}` / `{{texto|Termo do glossário}}`. Nada vira HTML. */
export function Rich({ text }: { text: string }) {
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<b>{<Rich text={m[1]} />}</b>);
    else out.push(<Term shown={m[2]} name={m[3] ?? m[2]} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Termo do glossário: sublinhado; a definição aparece ao passar o mouse ou focar. */
function Term({ shown, name }: { shown: string; name: string }) {
  const entry = findTerm(name);
  if (!entry) return <>{shown}</>;
  return (
    <span class="term" tabIndex={0}>
      {shown}
      <span class="term-pop" role="tooltip">
        <b>{entry.term}</b>
        {entry.text}
      </span>
    </span>
  );
}

// ───────────── glossário ─────────────

function GlossaryView() {
  const ctrl = useController();
  const [q, setQ] = useState('');
  const entries = GLOSSARY.filter((g) => !q || norm(g.term + g.text).includes(norm(q)));
  return (
    <section class="glossary-view" aria-label="Glossário">
      <input class="search" placeholder="Buscar termo… (ex.: DLQ, idempotência)" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Buscar no glossário" />
      <p class="small muted">
        {entries.length} de {GLOSSARY.length} termos
      </p>
      <dl>
        {entries.map((g) => {
          const ch = chapterForTerm(g.term);
          return (
            <div class="gl-entry" key={g.term}>
              <dt>
                {g.term} <span class={`svc svc-${g.service}`}>{SERVICE_LABEL[g.service]}</span>
              </dt>
              <dd>
                {g.text}
                {ch && (
                  <>
                    {' '}
                    <button class="linklike" onClick={() => ctrl.study.select(ch.id)}>
                      Ler no capítulo {ch.num}
                    </button>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {!entries.length && <p class="muted">Nenhum termo com “{q}”.</p>}
    </section>
  );
}

// ───────────── revisão ─────────────

const REVIEW_SIZE = 10;

interface ReviewQuestion extends QuizQuestion {
  levelId: string;
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Review() {
  const ctrl = useController();
  const done = useMemo(() => CATALOG.filter((l) => (ctrl.progress[l.id]?.stars ?? 0) > 0), [ctrl.progress]);
  const [round, setRound] = useState<ReviewQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);

  const start = async () => {
    setLoading(true);
    setError(null);
    const levels = await Promise.all(done.map((m) => ctrl.ensureLevel(m.id)));
    const pool: ReviewQuestion[] = levels.flatMap((l) => (l ? l.quiz.map((q) => ({ ...q, levelId: l.id })) : []));
    setLoading(false);
    if (!pool.length) {
      setError('Não foi possível carregar as perguntas agora. Tente de novo em instantes.');
      return;
    }
    setRound(shuffle(pool).slice(0, REVIEW_SIZE));
    setSeq((n) => n + 1);
  };

  if (!done.length) {
    return (
      <section class="review empty" aria-label="Revisão">
        <h2>Revisão</h2>
        <p>A revisão junta as perguntas dos quizzes das fases que você já concluiu, embaralhadas, com a explicação depois de cada resposta.</p>
        <p class="muted">Conclua a primeira fase para liberar.</p>
        <button class="btn primary" onClick={() => ctrl.startLevel(CATALOG[0].id)}>
          Jogar a fase 1
        </button>
      </section>
    );
  }

  if (!round) {
    return (
      <section class="review" aria-label="Revisão">
        <h2>Revisão</h2>
        <p>
          Até {REVIEW_SIZE} perguntas sorteadas dos quizzes das <b>{done.length}</b> {done.length === 1 ? 'fase' : 'fases'} que você já concluiu. Depois de cada resposta, a explicação e o capítulo para reler.
        </p>
        {error && <p class="alert alert-error small">{error}</p>}
        <button class="btn primary" onClick={() => void start()} disabled={loading}>
          {loading ? 'Preparando…' : 'Começar a revisão'}
        </button>
      </section>
    );
  }

  return (
    <section class="review quiz-box" aria-label="Revisão">
      <Quiz
        key={seq}
        questions={round}
        kicker={(i, n) => `Revisão · pergunta ${i + 1} de ${n}`}
        after={(i) => {
          const ch = chapterForLevel(round[i].levelId);
          return ch ? (
            <p class="small">
              <button class="linklike" onClick={() => ctrl.study.select(ch.id)}>
                Reler o capítulo {ch.num}: {ch.title}
              </button>
            </p>
          ) : null;
        }}
        end={(correct, total) => (
          <>
            <h2>Revisão concluída</h2>
            <p>
              Você acertou <b>{correct}</b> de <b>{total}</b>.
            </p>
            <div class="row end gap">
              <button class="btn" onClick={() => setRound(null)}>
                Voltar
              </button>
              <button class="btn primary" onClick={() => void start()}>
                Outra rodada
              </button>
            </div>
          </>
        )}
      />
    </section>
  );
}

// ───────────── painel "Estudar" dentro da fase ─────────────

export function StudyPanel() {
  const ctrl = useController();
  const id = ctrl.study.panel;
  const meta = id ? chapterMeta(id) : undefined;
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ctrl.study.closePanel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);
  if (!meta) return null;
  return (
    <section class="study-panel" role="dialog" aria-label={`Estudar: ${meta.title}`} tabIndex={-1} ref={panel}>
      <div class="study-panel-head">
        <span class="reader-kicker">Estudar</span>
        <div class="row gap">
          <button class="btn tiny" onClick={() => ctrl.openStudy('apostila', meta.id)}>
            Abrir em Estudos
          </button>
          <button class="btn tiny ghost" onClick={() => ctrl.study.closePanel()} aria-label="Fechar">
            ✕
          </button>
        </div>
      </div>
      <div class="study-panel-body">
        <ChapterReader meta={meta} compact />
      </div>
    </section>
  );
}

