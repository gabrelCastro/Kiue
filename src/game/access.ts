import type { Level } from './level-types';
import { sandbox } from './levels';

/** Quem está jogando: visitante (sem conta) ou membro (logado). */
export type Access = 'guest' | 'member';

/** Fases abertas para visitantes: o começo da trilha Iniciante. */
export const GUEST_LEVELS: ReadonlySet<string> = new Set(['i01', 'i02']);

/** Fase que só abre com conta para este tipo de acesso. */
export function requiresAccount(level: Level, access: Access): boolean {
  return access === 'guest' && level.track !== 'sandbox' && !GUEST_LEVELS.has(level.id);
}

/** Sandbox de visitante: as mesmas peças, em quantidade suficiente para um fan-out pequeno. */
export const GUEST_SANDBOX: Level = {
  ...sandbox,
  objective: 'Experimente à vontade. Visitantes têm menos peças; crie uma conta para liberar o sandbox completo.',
  palette: [
    { kind: 'producer', label: 'Produtor', name: 'Produtor', count: 1 },
    { kind: 'topic', label: 'Tópico SNS', name: 'topico', count: 1 },
    { kind: 'queue', label: 'Fila SQS', name: 'fila', count: 2 },
    { kind: 'consumer', label: 'Consumidor', name: 'Consumidor', count: 2 },
    { kind: 'lambda', label: 'Função Lambda', name: 'funcao', count: 1 },
  ],
};

export function sandboxFor(access: Access): Level {
  return access === 'member' ? sandbox : GUEST_SANDBOX;
}
