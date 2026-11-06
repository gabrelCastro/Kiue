import { CONTENT_CHAPTERS } from '../../content/study';
import { Controller } from '../../src/game/controller';
import { GLOSSARY } from '../../src/game/glossary';
import { CATALOG } from '../../src/game/level-catalog';
import { CHAPTER_ID, CHAPTERS, chapterForLevel, FREE_CHAPTER_IDS } from '../../src/study/catalog';
import { FREE_CHAPTERS } from '../../src/study/free';
import type { Block, Chapter } from '../../src/study/types';

const ALL: Chapter[] = [...FREE_CHAPTERS, ...CONTENT_CHAPTERS];

function texts(b: Block): string[] {
  switch (b.t) {
    case 'p':
    case 'h':
    case 'note':
      return [b.text];
    case 'list':
      return b.items;
    case 'flow':
      return [...b.steps.map((s) => s.label), ...(b.arrows ?? [])];
    case 'table':
      return [...b.head, ...b.rows.flat()];
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

describe('apostila', () => {
  it('catálogo em ordem, com ids únicos no formato que o servidor aceita', () => {
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTERS.length);
    CHAPTERS.forEach((c, i) => {
      expect(c.id).toMatch(CHAPTER_ID);
      expect(c.num).toBe(i + 1);
    });
  });

  it('todo capítulo tem texto: os abertos no bundle, os demais só no servidor', () => {
    expect(FREE_CHAPTERS.map((c) => c.id).sort()).toEqual([...FREE_CHAPTER_IDS].sort());
    expect(CONTENT_CHAPTERS.every((c) => !FREE_CHAPTER_IDS.has(c.id))).toBe(true);
    expect(ALL.map((c) => c.id).sort()).toEqual(CHAPTERS.map((c) => c.id).sort());
    for (const c of ALL) expect(c.blocks.length, c.id).toBeGreaterThan(5);
  });

  it('toda fase das trilhas tem exatamente um capítulo', () => {
    for (const level of CATALOG) {
      const owners = CHAPTERS.filter((c) => c.levels.includes(level.id));
      expect(owners.length, level.id).toBe(1);
      expect(chapterForLevel(level.id)?.id).toBe(owners[0].id);
    }
  });

  it('os capítulos abertos são os das fases abertas', () => {
    for (const id of FREE_CHAPTER_IDS) {
      const ch = CHAPTERS.find((c) => c.id === id)!;
      expect(ch.levels.every((l) => ['i01', 'i02', 'i03'].includes(l)), id).toBe(true);
    }
  });

  it('termos do catálogo e do texto existem no glossário', () => {
    const terms = new Set(GLOSSARY.map((g) => g.term));
    for (const c of CHAPTERS) for (const t of c.terms) expect(terms.has(t), `${c.id}: ${t}`).toBe(true);
    const found = (name: string) => GLOSSARY.some((g) => norm(g.term) === norm(name) || norm(g.term).startsWith(`${norm(name)} (`));
    for (const c of ALL) {
      for (const text of c.blocks.flatMap(texts)) {
        for (const m of text.matchAll(/\{\{(.+?)(?:\|(.+?))?\}\}/g)) expect(found(m[2] ?? m[1]), `${c.id}: ${m[0]}`).toBe(true);
      }
    }
  });

  it('marcações fechadas e sem marcas da AWS no texto', () => {
    for (const c of ALL) {
      for (const text of [c.title, c.summary, ...c.blocks.flatMap(texts)]) {
        expect((text.match(/\*\*/g) ?? []).length % 2, `${c.id}: ${text.slice(0, 50)}`).toBe(0);
        expect(text.split('{{').length, `${c.id}: ${text.slice(0, 50)}`).toBe(text.split('}}').length);
        expect(text, c.id).not.toMatch(/Amazon|AWS|\bSQS\b|\bSNS\b|Lambda|CloudWatch|Dynamo/);
      }
    }
  });
});

describe('estado da sessão de estudos', () => {
  it('visitante lê os capítulos abertos e não busca os fechados', async () => {
    const ctrl = new Controller();
    const fetch = vi.fn(() => Promise.resolve(CONTENT_CHAPTERS[0]));
    ctrl.study.fetchChapter = fetch;
    expect(await ctrl.study.ensure('cap01')).not.toBeNull();
    expect(ctrl.study.requiresAccount('cap03')).toBe(true);
    expect(await ctrl.study.ensure('cap03')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('com conta busca o capítulo uma vez; ao sair, ele some da memória', async () => {
    const ctrl = new Controller();
    ctrl.setAccess('member');
    const cap03 = CONTENT_CHAPTERS.find((c) => c.id === 'cap03')!;
    const fetch = vi.fn(() => Promise.resolve(cap03));
    ctrl.study.fetchChapter = fetch;
    await Promise.all([ctrl.study.ensure('cap03'), ctrl.study.ensure('cap03')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ctrl.study.chapter('cap03')?.title).toBe(cap03.title);
    ctrl.setAccess('guest');
    expect(ctrl.study.chapter('cap03')).toBeUndefined();
    expect(ctrl.study.chapter('cap01')).toBeDefined();
  });

  it('marcar como lido avisa o destino uma vez por capítulo', () => {
    const ctrl = new Controller();
    const save = vi.fn();
    ctrl.study.readSink = { save };
    ctrl.study.markRead('cap01');
    ctrl.study.markRead('cap01');
    ctrl.study.markRead('nao-existe');
    expect(save).toHaveBeenCalledTimes(1);
    expect([...ctrl.study.read]).toEqual(['cap01']);
  });

  it('o painel "Estudar" abre no capítulo da fase', () => {
    const ctrl = new Controller();
    ctrl.study.openPanel('i07');
    expect(ctrl.study.panel).toBe('cap04');
    ctrl.openMenu();
    expect(ctrl.study.panel).toBeNull();
  });
});
