import { useState } from 'preact/hooks';
import { auth } from '../auth/store';
import { nextMeta } from '../game/level-catalog';
import { chapterForLevel } from '../study/catalog';
import { useController } from './hooks';
import { Quiz } from './Quiz';

export function Stars({ n, total = 3 }: { n: number; total?: number }) {
  return (
    <span class="stars" aria-label={`${n} de ${total} estrelas`}>
      {Array.from({ length: total }, (_, i) => (
        <span class={i < n ? 'on' : 'off'}>★</span>
      ))}
    </span>
  );
}

export function ResultModal() {
  const ctrl = useController();
  const level = ctrl.level!;
  const result = ctrl.result!;
  const [step, setStep] = useState<'result' | 'quiz'>('result');
  const next = nextMeta(level.id);
  const nextLock = next ? ctrl.lockReason(next) : 'progress';
  // visitante terminando a última fase aberta: o próximo passo é criar a conta
  const nextId = next && (nextLock === null || nextLock === 'account') ? next.id : null;

  return (
    <div class="modal-backdrop">
      <div class="modal result" role="dialog" aria-modal="true" aria-labelledby="result-title">
        {step === 'result' ? (
          <>
            <div class="result-head">
              <h2 id="result-title">{result.passed ? 'Fase concluída!' : 'Ainda não…'}</h2>
              <Stars n={result.stars} />
            </div>
            <ul class="result-goals">
              {result.goals.map((g, i) => (
                <li key={i} class={g.status}>
                  <span><span class={`status-dot ${g.status}`} aria-label={g.status === 'ok' ? 'cumprido' : 'falhou'} /></span>
                  <div>
                    <div>
                      {g.label} <span class="muted">({g.detail})</span>
                    </div>
                    {g.why && <div class="why">{g.why}</div>}
                  </div>
                </li>
              ))}
            </ul>
            {result.passed && (
              <div class="star-summary muted small">
                Latência p95: <b>{result.p95.toFixed(1)}s</b>
                {level.stars.p95 !== undefined && ` (meta ★: ${level.stars.p95}s)`} · Chamadas de API: <b>{result.apiCalls}</b>
                {level.stars.apiCalls !== undefined && ` (meta ★: ${level.stars.apiCalls})`}
              </div>
            )}
            {result.passed && (
              <div class="lesson">
                <h3>O que você aprendeu</h3>
                <ul>
                  {level.lesson.map((l) => (
                    <li>{l}</li>
                  ))}
                </ul>
              </div>
            )}
            <div class="row end gap">
              <button class="btn ghost" onClick={() => ctrl.toBuild()}>
                {result.passed ? 'Melhorar' : 'Tentar de novo'}
              </button>
              {!result.passed && ctrl.attempts >= 1 && (
                <button class="btn ghost" onClick={() => ctrl.showSolution()}>
                  Ver solução
                </button>
              )}
              {result.passed && level.quiz.length > 0 && (
                <button class="btn primary" onClick={() => setStep('quiz')}>
                  Quiz rápido →
                </button>
              )}
              {result.passed && level.quiz.length === 0 && <NextButton nextId={nextId} />}
            </div>
            <div class="row end">
              <StudyLink />
            </div>
          </>
        ) : (
          <Quiz
            questions={level.quiz}
            onDone={(correct) => ctrl.recordQuiz(correct)}
            end={(correct, total) => (
              <>
                <h2>Quiz concluído</h2>
                <p>
                  Você acertou <b>{correct}</b> de <b>{total}</b>.
                </p>
                <div class="row end gap">
                  <StudyLink />
                  <NextButton nextId={nextId} />
                </div>
              </>
            )}
          />
        )}
      </div>
    </div>
  );
}

function NextButton({ nextId }: { nextId: string | null }) {
  const ctrl = useController();
  const next = nextId ? nextMeta(ctrl.level!.id) : undefined;
  if (next && ctrl.lockReason(next) === 'account') {
    return (
      <button class="btn primary" onClick={() => auth.open('register', { reason: 'Você concluiu as fases abertas para visitantes. Crie uma conta grátis para seguir para a fase 3 e liberar o resto do jogo.' })}>
        Criar conta e continuar →
      </button>
    );
  }
  return nextId ? (
    <button class="btn primary" onClick={() => ctrl.startLevel(nextId)}>
      Próxima fase →
    </button>
  ) : (
    <button class="btn primary" onClick={() => ctrl.openMenu()}>
      Voltar ao menu
    </button>
  );
}

/** Abre, por cima da fase, o capítulo da apostila sobre o assunto dela. */
export function StudyLink() {
  const ctrl = useController();
  const chapter = ctrl.level ? chapterForLevel(ctrl.level.id) : undefined;
  if (!chapter) return null;
  return (
    <button class="linklike study-link" onClick={() => ctrl.study.openPanel(ctrl.level!.id)}>
      Estudar: {chapter.title}
    </button>
  );
}
