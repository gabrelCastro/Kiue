/*
 * Temas visuais: mudam só o formato do produtor e do consumidor (a fila, o tópico, a função sob
 * demanda, as cores de cada serviço e a simulação são os mesmos em todos). Nas fases, o tema vem
 * do catálogo; no Sandbox, o jogador escolhe e a escolha vai junto com o grafo salvo.
 */

export type VisualTheme = 'industria' | 'fazenda' | 'entregas' | 'correio' | 'fabrica' | 'gigantes';

export const VISUAL_THEMES: readonly { id: VisualTheme; name: string }[] = [
  { id: 'industria', name: 'Indústria' },
  { id: 'fazenda', name: 'Fazenda' },
  { id: 'entregas', name: 'Entregas' },
  { id: 'correio', name: 'Correio' },
  { id: 'fabrica', name: 'Fábrica de brinquedos' },
  { id: 'gigantes', name: 'Robôs gigantes' },
];

export const DEFAULT_THEME: VisualTheme = 'industria';

export function isVisualTheme(value: unknown): value is VisualTheme {
  return VISUAL_THEMES.some((t) => t.id === value);
}
