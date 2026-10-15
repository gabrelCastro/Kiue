import { BufferAttribute, Matrix3, Mesh, MeshBasicMaterial, Vector3, type BufferGeometry, type Object3D } from 'three';

/*
 * Iluminação "assada": a luz é calculada uma vez, quando a peça é montada, e gravada na cor de
 * cada vértice. Na tela, os materiais são `MeshBasicMaterial` (sem luz nem sombra por quadro):
 * o custo por pixel é o mínimo possível, e o visual fica estável em qualquer aparelho.
 *
 * O vértice guarda só o fator de luz (cinza); a cor da peça continua em `material.color`, então
 * trocar a cor em tempo de jogo (consumidor fora do ar, worker ocupado) segue funcionando.
 */

/** De onde vem a luz principal: alto, à esquerda e à frente (mesma direção da sombra de contato). */
const SUN = new Vector3(-8, 20, 7).normalize();
const AMBIENT = 0.58;
/** Quanto o céu clareia o que olha para cima (e o chão escurece o que olha para baixo). */
const SKY = 0.2;
const SUN_STRENGTH = 0.42;
/** Oclusão perto do chão: o pé das peças escurece até esta fração. */
const GROUND_AO = 0.7;
const AO_HEIGHT = 0.5;

const n = new Vector3();
const p = new Vector3();
const normalMatrix = new Matrix3();

/** Material sem luz que recebe a iluminação assada. `flat` dá o visual facetado (ícones, cones). */
export function bakedMaterial(color: string, opts: { flat?: boolean; transparent?: boolean; opacity?: number } = {}): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color, vertexColors: true, transparent: opts.transparent, opacity: opts.opacity ?? 1, depthWrite: !opts.transparent });
  if (opts.flat) m.userData.flat = true;
  return m;
}

/** Fator de luz de um ponto com normal `normal` (ambos em coordenadas de mundo). */
export function lightAt(normal: Vector3, height: number, groundAo = true): number {
  const hemi = AMBIENT + SKY * normal.y;
  const sun = SUN_STRENGTH * Math.max(0, normal.dot(SUN));
  const ao = groundAo ? GROUND_AO + (1 - GROUND_AO) * Math.min(1, Math.max(0, height / AO_HEIGHT)) : 1;
  return (hemi + sun) * ao;
}

/** Grava a luz nas cores dos vértices de uma geometria, usando a transformação `matrixWorld` dada. */
export function bakeGeometry(geometry: BufferGeometry, matrixWorld: Mesh['matrixWorld'], groundAo = true): void {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  if (!pos || !nor) return;
  normalMatrix.getNormalMatrix(matrixWorld);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
    p.fromBufferAttribute(pos, i).applyMatrix4(matrixWorld);
    const f = lightAt(n, p.y, groundAo);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

/**
 * Assa a luz em todas as malhas de `root` que usam material assado. `groundAo: false` para o que
 * não está "apoiado" no chão (o próprio tabuleiro). Chamar depois de posicionar
 * o objeto (a altura de cada vértice entra na oclusão). Peças só andam no chão e não giram, então
 * a luz assada continua certa quando a peça é arrastada.
 */
export function bakeTree(root: Object3D, opts: { groundAo?: boolean } = {}): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const material = o.material as MeshBasicMaterial;
    if (!(material instanceof MeshBasicMaterial) || !material.vertexColors) return;
    if (material.userData.flat && o.geometry.index) {
      // sem índice, cada triângulo tem os próprios vértices: a normal por face dá o facetado
      const flat = o.geometry.toNonIndexed();
      o.geometry.dispose();
      o.geometry = flat;
      o.geometry.computeVertexNormals();
    }
    // a peça é montada na origem do grupo; a altura de mundo é o que importa para a oclusão
    bakeGeometry(o.geometry, o.matrixWorld, opts.groundAo ?? true);
  });
}
