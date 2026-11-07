import type { VisualTheme } from '../../game/visual-themes';
import { industria } from './industria';
import type { ThemeKit } from './kit';

export type { ConsumerBuild, ProducerBuild, SendFx, ThemeKit, WorkerPose, WorkerRig } from './kit';

/*
 * Indústria (o visual padrão, usado na vitrine da home) vem junto com a cena. Os outros temas, com
 * os modelos deles, ficam em arquivos à parte, baixados quando uma fase ou o Sandbox os usa.
 */
const LOADED: Partial<Record<VisualTheme, ThemeKit>> = { industria };
const LOADERS: Record<Exclude<VisualTheme, 'industria'>, () => Promise<ThemeKit>> = {
  fazenda: () => import('./fazenda').then((m) => m.fazenda),
};
const pending = new Map<VisualTheme, Promise<ThemeKit>>();

/** O kit do tema, se já estiver carregado (senão, null: chame loadKit). */
export function kitFor(theme: VisualTheme): ThemeKit | null {
  return LOADED[theme] ?? null;
}

export function loadKit(theme: VisualTheme): Promise<ThemeKit> {
  const ready = LOADED[theme];
  if (ready) return Promise.resolve(ready);
  let p = pending.get(theme);
  if (!p) {
    p = LOADERS[theme as Exclude<VisualTheme, 'industria'>]().then((kit) => (LOADED[theme] = kit));
    pending.set(theme, p);
  }
  return p;
}
