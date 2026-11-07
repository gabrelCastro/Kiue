import type { VisualTheme } from '../../game/visual-themes';
import { fazenda } from './fazenda';
import { industria } from './industria';
import type { ThemeKit } from './kit';

export type { ConsumerBuild, ProducerBuild, SendFx, ThemeKit, WorkerPose, WorkerRig } from './kit';

const KITS: Record<VisualTheme, ThemeKit> = { industria, fazenda };

export function kitFor(theme: VisualTheme): ThemeKit {
  return KITS[theme];
}
