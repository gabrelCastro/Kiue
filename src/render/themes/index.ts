import type { VisualTheme } from '../../game/visual-themes';
import { industria } from './industria';
import type { ThemeKit } from './kit';

export type { ConsumerBuild, LambdaBuild, LambdaRig, ProducerBuild, SendFx, ThemeKit, WorkerPose, WorkerRig } from './kit';

/*
 * Indústria (o visual padrão, usado na vitrine da home) vem junto com a cena. Os outros temas, com
 * os modelos deles, ficam em arquivos à parte, baixados quando uma fase ou o Sandbox os usa.
 */
const LOADED: Partial<Record<VisualTheme, ThemeKit>> = { industria };
const LOADERS: Record<Exclude<VisualTheme, 'industria'>, () => Promise<ThemeKit>> = {
  fazenda: () => import('./fazenda').then((m) => m.fazenda),
  entregas: () => import('./entregas').then((m) => m.entregas),
  correio: () => import('./correio').then((m) => m.correio),
  fabrica: () => import('./fabrica').then((m) => m.fabrica),
  gigantes: () => import('./gigantes').then((m) => m.gigantes),
};
const pending = new Map<VisualTheme, Promise<ThemeKit>>();

/** A função sob demanda da Indústria, baixada à parte (o kit dela vem junto com a cena). */
let industriaLambda: Promise<void> | null = null;

/**
 * O kit do tema, se já estiver carregado (senão, null: chame loadKit). `lambda`: a montagem tem
 * função sob demanda (na Indústria, ela vem num pedaço à parte).
 */
export function kitFor(theme: VisualTheme, lambda = false): ThemeKit | null {
  const kit = LOADED[theme] ?? null;
  if (kit && lambda && !kit.lambda) return null;
  return kit;
}

export function loadKit(theme: VisualTheme): Promise<ThemeKit> {
  if (theme === 'industria') {
    industriaLambda ??= import('./industria-funcao').then((m) => {
      industria.lambda = m.industriaLambda;
    });
    return industriaLambda.then(() => industria);
  }
  const ready = LOADED[theme];
  if (ready) return Promise.resolve(ready);
  let p = pending.get(theme);
  if (!p) {
    p = LOADERS[theme as Exclude<VisualTheme, 'industria'>]().then((kit) => (LOADED[theme] = kit));
    pending.set(theme, p);
  }
  return p;
}
