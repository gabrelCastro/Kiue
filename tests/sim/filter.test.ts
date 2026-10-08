import { matchesFilterPolicy } from '../../src/sim/filter';

describe('filter policy', () => {
  it('sem policy aceita tudo', () => {
    expect(matchesFilterPolicy(null, {})).toBe(true);
  });
  it('lista de valores é OU', () => {
    const p = { tipo: ['livro', 'roupa'] };
    expect(matchesFilterPolicy(p, { tipo: 'roupa' })).toBe(true);
    expect(matchesFilterPolicy(p, { tipo: 'comida' })).toBe(false);
  });
  it('chaves diferentes são E', () => {
    const p = { tipo: ['livro'], pais: ['BR'] };
    expect(matchesFilterPolicy(p, { tipo: 'livro', pais: 'BR' })).toBe(true);
    expect(matchesFilterPolicy(p, { tipo: 'livro', pais: 'PT' })).toBe(false);
  });
  it('anything-but não casa com atributo ausente', () => {
    const p = { tipo: [{ 'anything-but': ['livro'] }] };
    expect(matchesFilterPolicy(p, { tipo: 'roupa' })).toBe(true);
    expect(matchesFilterPolicy(p, { tipo: 'livro' })).toBe(false);
    expect(matchesFilterPolicy(p, {})).toBe(false);
  });
  it('exists', () => {
    expect(matchesFilterPolicy({ tipo: [{ exists: true }] }, { tipo: 'x' })).toBe(true);
    expect(matchesFilterPolicy({ tipo: [{ exists: false }] }, { tipo: 'x' })).toBe(false);
    expect(matchesFilterPolicy({ tipo: [{ exists: false }] }, {})).toBe(true);
  });
});
