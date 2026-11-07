import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Junta as partes paradas de uma peça numa malha só (uma chamada de desenho em vez de 8 a 10).
 * Funciona porque a luz já está assada nos vértices (bake.ts): aqui a cor de cada material é
 * multiplicada nessa luz, e a malha junta usa um material branco. Fica de fora o que se move
 * (portão, fazendeiro, anéis), o que muda de cor (luz dos workers, corpo do consumidor: materiais
 * próprios, não compartilhados), o que é transparente ou tem textura, e as instâncias (braços, robôs).
 */

const WHITE = new MeshBasicMaterial({ color: '#ffffff', vertexColors: true });
WHITE.userData.shared = true;

/** Malhas juntas já montadas, por composição (só quando todas as partes são compartilhadas). */
const cache = new Map<string, BufferGeometry>();
const toRoot = new Matrix4();
const rel = new Matrix4();

function mergeable(o: Object3D, root: Object3D, keep: Set<Object3D>): o is Mesh {
  if (!(o instanceof Mesh) || o instanceof InstancedMesh) return false;
  const m = o.material;
  if (Array.isArray(m) || !(m instanceof MeshBasicMaterial)) return false;
  if (!m.vertexColors || !m.userData.shared || m.map || m.transparent) return false;
  if (!o.geometry.getAttribute('color')) return false;
  for (let a: Object3D | null = o; a && a !== root; a = a.parent) if (keep.has(a) || a.userData.dynamic) return false;
  return true;
}

/**
 * Junta as partes paradas de `root` (o grupo da peça, já assado). As partes juntadas que eram
 * clicáveis são trocadas, em `pickables`, pela malha junta.
 */
export function mergeStatic(root: Object3D, keep: Set<Object3D>, pickables: Object3D[]): void {
  root.updateMatrixWorld(true);
  toRoot.copy(root.matrixWorld).invert();
  const sources: Mesh[] = [];
  root.traverse((o) => {
    if (mergeable(o, root, keep)) sources.push(o);
  });
  if (sources.length < 2) return;

  const relOf = (s: Mesh) => rel.multiplyMatrices(toRoot, s.matrixWorld);
  const cacheable = sources.every((s) => s.geometry.userData.shared);
  const key = cacheable
    ? sources.map((s) => `${s.geometry.uuid}:${(s.material as MeshBasicMaterial).uuid}:${relOf(s).elements.map((v) => Math.round(v * 1e4)).join(',')}`).join('|')
    : '';
  let geo = cacheable ? cache.get(key) : undefined;
  if (!geo) {
    const parts = sources.map((s) => {
      const src = s.geometry;
      const g = new BufferGeometry();
      // MeshBasicMaterial não usa normais: só posição e cor (luz × cor do material)
      g.setAttribute('position', src.getAttribute('position').clone());
      const light = src.getAttribute('color');
      const color = (s.material as MeshBasicMaterial).color;
      const rgb = new Float32Array(light.count * 3);
      for (let i = 0; i < light.count; i++) {
        rgb[i * 3] = light.getX(i) * color.r;
        rgb[i * 3 + 1] = light.getY(i) * color.g;
        rgb[i * 3 + 2] = light.getZ(i) * color.b;
      }
      g.setAttribute('color', new BufferAttribute(rgb, 3));
      // todas indexadas (mergeGeometries exige o mesmo formato)
      g.setIndex(src.index ? src.index.clone() : Array.from({ length: light.count }, (_, i) => i));
      g.applyMatrix4(relOf(s));
      return g;
    });
    geo = mergeGeometries(parts)!;
    for (const p of parts) p.dispose();
    if (cacheable) {
      geo.userData.shared = true;
      cache.set(key, geo);
    }
  }

  const merged = new Mesh(geo, WHITE);
  root.add(merged);
  let picked = false;
  for (const s of sources) {
    s.parent?.remove(s);
    if (!s.geometry.userData.shared) s.geometry.dispose();
    const i = pickables.indexOf(s);
    if (i >= 0) {
      pickables.splice(i, 1);
      picked = true;
    }
  }
  if (picked) pickables.push(merged);
}
