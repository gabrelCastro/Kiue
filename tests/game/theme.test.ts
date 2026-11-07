import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATEGORY, PALETTE, RAMP, SCENE, SCENE_THEMES, SERVICE, setThemeMode, themeMode } from '../../src/theme';

const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const block = (selector: string) => {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`${selector} não está no CSS`);
  return css.slice(i, css.indexOf('\n}\n', i));
};
const LIGHT = block(':root {');
const DARK = block(":root[data-theme='dark'] {");

/** Valor de uma variável, seguindo var(--x) até chegar numa cor. No escuro, cai para o claro. */
function token(name: string, mode: 'light' | 'dark' = 'light'): string {
  const find = (src: string) => src.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  const v = (mode === 'dark' ? find(DARK) : undefined) ?? find(LIGHT);
  if (!v) throw new Error(`--${name} não está no :root`);
  const ref = v.match(/^var\(--([a-z0-9-]+)\)$/);
  return ref ? token(ref[1], mode) : v.toLowerCase();
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PIECES = { producer: 'producer', topic: 'sns', queue: 'sqs', dlq: 'dlq', consumer: 'consumer', lambda: 'lambda' } as const;

describe('tema', () => {
  it('as escalas e a paleta do CSS são as mesmas de src/theme.ts', () => {
    for (const [name, ramp] of Object.entries(RAMP)) {
      for (const [step, hex] of Object.entries(ramp)) expect(token(`${name}-${step}`), `--${name}-${step}`).toBe(hex);
    }
    for (const [name, hex] of Object.entries(PALETTE)) expect(token(name)).toBe(hex);
  });

  it('as cores das peças no CSS são as da cena, nos dois modos', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const [kind, name] of Object.entries(PIECES)) {
        expect(token(name, mode), `${mode} ${kind}`).toBe(SCENE_THEMES[mode].service[kind as keyof typeof PIECES].toLowerCase());
      }
    }
  });

  it('em cada escala, o degrau 600 serve de texto sobre branco e o 500 de ícone', () => {
    for (const [name, ramp] of Object.entries(RAMP)) {
      expect(contrast(ramp[600], '#ffffff'), `${name}-600`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ramp[500], '#ffffff'), `${name}-500`).toBeGreaterThanOrEqual(3);
    }
  });

  // WCAG 1.4.3 (texto ≥ 4,5:1) e 1.4.11 (bordas de campo, foco e contornos ≥ 3:1), nos dois modos
  const PAIRS = [
    ['text', 'bg', 4.5],
    ['text-2', 'bg', 4.5],
    ['muted', 'panel', 4.5],
    ['muted', 'bg', 4.5],
    ['on-primary', 'primary', 4.5],
    ['on-primary', 'primary-hover', 4.5],
    ['primary-text', 'panel', 4.5],
    ['highlight-text', 'panel', 4.5],
    ['ok', 'ok-soft', 4.5],
    ['bad', 'bad-soft', 4.5],
    ['warn', 'warn-soft', 4.5],
    ['on-sqs', 'sqs', 4.5],
    ['on-sns', 'sns', 4.5],
    ['on-lambda', 'lambda', 4.5],
    ['on-producer', 'producer', 4.5],
    ['on-dlq', 'dlq', 4.5],
    ['on-consumer', 'consumer', 4.5],
    ['sns-text', 'panel', 4.5],
    ['sqs-text', 'panel', 4.5],
    ['on-badge-strong', 'badge-strong', 4.5],
    ['tip-text', 'tip-bg', 4.5],
    ['input-border', 'panel', 3],
    ['focus', 'bg', 3],
    ['highlight-border', 'panel', 3],
    ['btn-ink', 'panel', 3],
  ] as const;
  for (const mode of ['light', 'dark'] as const) {
    it.each(PAIRS)(`${mode}: --%s sobre --%s ≥ %s:1`, (fg, bg, min) => {
      expect(contrast(token(fg, mode), token(bg, mode))).toBeGreaterThanOrEqual(min);
    });
  }

  it('trocar o modo troca as cores da cena', () => {
    const before = themeMode();
    setThemeMode('dark');
    expect(SERVICE.queue).toBe(SCENE_THEMES.dark.service.queue);
    expect(SCENE.fog).toBe(SCENE_THEMES.dark.scene.fog);
    setThemeMode('light');
    expect(SERVICE.queue).toBe(SCENE_THEMES.light.service.queue);
    setThemeMode(before);
  });

  it('cores categóricas não se repetem', () => {
    expect(new Set(Object.values(CATEGORY)).size).toBe(Object.values(CATEGORY).length);
  });
});
