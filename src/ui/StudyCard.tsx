import { CATALOG } from '../game/level-catalog';
import { CHAPTERS } from '../study/catalog';
import { useController } from './hooks';

// Fica fora de Study.tsx: a home mostra só este cartão, e a tela de estudos carrega sob demanda.

/** Cartão "Estudos" na home: progresso de leitura e atalhos. */
export function StudyCard() {
  const ctrl = useController();
  const s = ctrl.study;
  const readCount = CHAPTERS.filter((c) => s.read.has(c.id)).length;
  const nextRead = CHAPTERS.find((c) => !s.read.has(c.id));
  const done = CATALOG.some((l) => (ctrl.progress[l.id]?.stars ?? 0) > 0);
  return (
    <section class="track study-card" aria-labelledby="study-card-title">
      <div class="track-head">
        <span class="track-badge">Apostila</span>
        <h2 id="study-card-title">Estudos</h2>
        <p class="muted">A teoria por trás das fases: {CHAPTERS.length} capítulos, glossário e revisão com as perguntas dos quizzes.</p>
      </div>
      <div class="track-progress">
        <div class="track-bar" aria-hidden="true">
          <span style={{ width: `${(readCount / CHAPTERS.length) * 100}%` }} />
        </div>
        <span class="small muted">
          {readCount}/{CHAPTERS.length} capítulos lidos
        </span>
      </div>
      <div class="row gap study-card-actions">
        {nextRead ? (
          <button class="btn primary" onClick={() => ctrl.openStudy('apostila', nextRead.id)}>
            {readCount ? 'Continuar' : 'Começar'}: {nextRead.title}
          </button>
        ) : (
          <button class="btn primary" onClick={() => ctrl.openStudy('apostila')}>
            Abrir a apostila
          </button>
        )}
        <button class="btn" onClick={() => ctrl.openStudy('glossario')}>
          Glossário
        </button>
        {done && (
          <button class="btn" onClick={() => ctrl.openStudy('revisao')}>
            Revisão
          </button>
        )}
      </div>
    </section>
  );
}
