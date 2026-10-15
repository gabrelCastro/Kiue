import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace } from 'three';

/*
 * Texturas desenhadas em canvas na primeira vez que são pedidas: nada de arquivo de imagem (o
 * bundle e a CSP ficam iguais) e cada uma existe uma vez só, compartilhada por todas as peças.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

let contact: CanvasTexture | null = null;
/** Sombra de contato: mancha radial escura e suave que "assenta" a peça no chão. */
export function contactShadowTexture(): CanvasTexture {
  if (contact) return contact;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(15, 20, 26, 0.55)');
  g.addColorStop(0.45, 'rgba(15, 20, 26, 0.28)');
  g.addColorStop(1, 'rgba(15, 20, 26, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  contact = new CanvasTexture(c);
  return contact;
}

/**
 * Listras diagonais para os canos: repetidas ao longo do cano e deslocadas a cada quadro, mostram
 * para que lado as mensagens andam. Uma por cor (cano comum, assinatura SNS).
 */
const flows = new Map<string, CanvasTexture>();
export function flowTexture(base: string, stripe: string): CanvasTexture {
  const key = `${base}|${stripe}`;
  let tex = flows.get(key);
  if (tex) return tex;
  const [c, ctx] = canvas(64, 16);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = stripe;
  // chevron ">" apontando para +u (sentido do fluxo)
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(34, 0);
  ctx.lineTo(46, 8);
  ctx.lineTo(34, 16);
  ctx.lineTo(18, 16);
  ctx.lineTo(30, 8);
  ctx.closePath();
  ctx.fill();
  tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  flows.set(key, tex);
  return tex;
}

let belt: CanvasTexture | null = null;
/** Esteira da fila: borracha escura com ripas claras, rolando na direção da cabeça da fila. */
export function beltTexture(): CanvasTexture {
  if (belt) return belt;
  const [c, ctx] = canvas(64, 32);
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#4b525b';
  for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 3, 32);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(0, 0, 64, 4);
  belt = new CanvasTexture(c);
  belt.colorSpace = SRGBColorSpace;
  belt.wrapS = RepeatWrapping;
  belt.wrapT = RepeatWrapping;
  return belt;
}

let backdrop: CanvasTexture | null = null;
/** Fundo da cena: degradê vertical claro com vinheta discreta nos cantos (fica parado na tela). */
export function backdropTexture(): CanvasTexture {
  if (backdrop) return backdrop;
  const [c, ctx] = canvas(256, 256);
  const v = ctx.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, '#f7f8fa');
  v.addColorStop(1, '#e4e7eb');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 256, 256);
  const r = ctx.createRadialGradient(128, 118, 60, 128, 128, 190);
  r.addColorStop(0, 'rgba(255, 255, 255, 0)');
  r.addColorStop(1, 'rgba(120, 130, 142, 0.18)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, 256, 256);
  backdrop = new CanvasTexture(c);
  backdrop.colorSpace = SRGBColorSpace;
  return backdrop;
}

/** Lado de um ladrilho do chão, em unidades do mundo (5 casas de 1 unidade). */
export const GROUND_TILE = 5;

let ground: CanvasTexture | null = null;
/**
 * Chão infinito: um ladrilho de 5 × 5 casas, com linhas finas a cada casa e uma linha um pouco
 * mais forte na borda do ladrilho. Repetido num plano que acompanha a câmera.
 */
export function groundTexture(): CanvasTexture {
  if (ground) return ground;
  const cell = 64;
  const size = cell * GROUND_TILE;
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, size, size);
  // as linhas ficam na borda das casas: metade de cada lado da emenda, para a repetição fechar certinho
  ctx.fillStyle = '#e6e9ec';
  for (let i = 1; i < GROUND_TILE; i++) {
    ctx.fillRect(i * cell - 1, 0, 2, size);
    ctx.fillRect(0, i * cell - 1, size, 2);
  }
  ctx.fillStyle = '#d9dde2';
  ctx.fillRect(0, 0, 1, size);
  ctx.fillRect(size - 1, 0, 1, size);
  ctx.fillRect(0, 0, size, 1);
  ctx.fillRect(0, size - 1, size, 1);
  ground = new CanvasTexture(c);
  ground.colorSpace = SRGBColorSpace;
  ground.wrapS = RepeatWrapping;
  ground.wrapT = RepeatWrapping;
  ground.anisotropy = 4;
  return ground;
}
