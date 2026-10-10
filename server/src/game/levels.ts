import { CONTENT_LEVELS } from '../../../content/levels';
import { HttpError } from '../errors';

/**
 * Conteúdo das fases fechadas para visitantes. Fica só no servidor: o bundle do jogo traz o
 * catálogo (títulos) e as fases abertas; o resto chega por aqui, para quem está logado.
 * As respostas são montadas uma vez na subida (o conteúdo é estático).
 */
export class LevelContent {
  private readonly bodies = new Map<string, string>();

  constructor(levels = CONTENT_LEVELS) {
    for (const level of levels) this.bodies.set(level.id, JSON.stringify({ level }));
  }

  /** Corpo JSON `{ level }` pronto para enviar. */
  body(id: string): string {
    const body = this.bodies.get(id);
    if (!body) throw new HttpError('not_found', 'Fase não encontrada.', 404);
    return body;
  }

  get ids(): string[] {
    return [...this.bodies.keys()];
  }
}
