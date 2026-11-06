import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { QuizQuestion } from '../game/level-types';

/**
 * Quiz de múltipla escolha, uma pergunta por vez, com a explicação depois de responder. Usado no
 * fim da fase e na revisão da sessão de estudos.
 */
export function Quiz({
  questions,
  onDone,
  end,
  after,
  kicker = (i, n) => `Pergunta ${i + 1} de ${n}`,
}: {
  questions: QuizQuestion[];
  /** Chamado ao responder a última pergunta. */
  onDone?: (correct: number) => void;
  /** Tela final (placar e o que fazer depois). */
  end: (correct: number, total: number) => ComponentChildren;
  /** Algo a mais depois da explicação (por exemplo, o link para o capítulo). */
  after?: (index: number) => ComponentChildren;
  kicker?: (index: number, total: number) => string;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const q = questions[idx];

  if (finished) return <>{end(correct, questions.length)}</>;

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
      onDone?.(correct);
      setFinished(true);
    }
  };

  return (
    <>
      <div class="modal-kicker">{kicker(idx, questions.length)}</div>
      <h2>{q.question}</h2>
      <div class="quiz-options">
        {q.options.map((o, i) => {
          let cls = '';
          if (picked !== null) cls = i === q.answer ? 'right' : i === picked ? 'wrong' : 'dim';
          return (
            <button key={`${idx}-${i}`} class={`quiz-option ${cls}`} onClick={() => choose(i)} disabled={picked !== null && cls === 'dim'}>
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
          {after?.(idx)}
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
