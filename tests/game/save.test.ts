import { mergeProgress } from '../../src/game/save';

describe('mergeProgress', () => {
  it('fica com o melhor de cada fase e junta fases dos dois lados', () => {
    expect(mergeProgress({ i01: { stars: 3 }, i02: { stars: 1, quizCorrect: 2 } }, { i01: { stars: 1, quizCorrect: 3 }, i02: { stars: 2 }, i03: { stars: 1 } })).toEqual({
      i01: { stars: 3, quizCorrect: 3 },
      i02: { stars: 2, quizCorrect: 2 },
      i03: { stars: 1 },
    });
  });

  it('não muda as entradas', () => {
    const a = { i01: { stars: 1 } };
    mergeProgress(a, { i01: { stars: 3 } });
    expect(a).toEqual({ i01: { stars: 1 } });
  });
});
