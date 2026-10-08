import { useController } from './hooks';

export function Briefing() {
  const ctrl = useController();
  const level = ctrl.level!;
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && ctrl.setBriefing(false)}>
      <div class="modal briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
        <div class="modal-kicker">
          {level.track === 'iniciante' ? 'Trilha Iniciante' : 'Trilha Certificação'} · Fase {level.index} · <span class="concept-chip">{level.concept}</span>
        </div>
        <h2 id="briefing-title">{level.title}</h2>
        <p class="story">{level.story}</p>
        <div class="mission">
          <b>Missão:</b> {level.objective}
        </div>
        <details>
          <summary>Dica</summary>
          <p>{level.hint}</p>
        </details>
        <div class="row end">
          <button class="btn primary" onClick={() => ctrl.setBriefing(false)} autoFocus>
            Começar
          </button>
        </div>
      </div>
    </div>
  );
}
