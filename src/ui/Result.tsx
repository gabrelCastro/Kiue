import { useState } from 'preact/hooks';
import { auth } from '../auth/store';
import { nextMeta } from '../game/level-catalog';
import type { QuizQuestion } from '../game/level-types';
import { useController } from './hooks';

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
          </>
        ) : (
          <Quiz questions={level.quiz} onDone={(correct) => ctrl.recordQuiz(correct)} nextId={nextId} />
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

function Quiz({ questions, onDone, nextId }: { questions: QuizQuestion[]; onDone: (correct: number) => void; nextId: string | null }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const q = questions[idx];

  if (finished) {
    return (
      <>
        <h2>Quiz concluído</h2>
        <p>
          Você acertou <b>{correct}</b> de <b>{questions.length}</b>.
        </p>
        <div class="row end">
          <NextButton nextId={nextId} />
        </div>
      </>
    );
  }

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setCorrect((c) => c + 1);
  };

  const advance = () => {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setPicked(null);
    } else {
      onDone(correct);
      setFinished(true);
    }
  };

  return (
    <>
      <div class="modal-kicker">
        Pergunta {idx + 1} de {questions.length}
      </div>
      <h2>{q.question}</h2>
      <div class="quiz-options">
        {q.options.map((o, i) => {
          let cls = '';
          if (picked !== null) cls = i === q.answer ? 'right' : i === picked ? 'wrong' : 'dim';
          return (
            <button class={`quiz-option ${cls}`} onClick={() => choose(i)} disabled={picked !== null && cls === 'dim'}>
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <p class={`quiz-explain ${picked === q.answer ? 'right' : 'wrong'}`}>
            {picked === q.answer ? '✔ Isso mesmo. ' : '✘ Não exatamente. '}
            {q.explanation}
          </p>
          <div class="row end">
            <button class="btn primary" onClick={advance} autoFocus>
              {idx + 1 < questions.length ? 'Próxima pergunta' : 'Ver resultado'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
