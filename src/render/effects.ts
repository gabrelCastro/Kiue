import { Vector3, type Scene } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const LIFETIME = 1400;
const MAX_ACTIVE = 50;
/** O mesmo texto na mesma peça aparece no máximo uma vez por este intervalo. */
const DEFAULT_THROTTLE_MS = 150;

interface Fx {
  obj: CSS2DObject;
  age: number;
  base: Vector3;
}

/** Textos flutuantes que explicam o que acabou de acontecer numa peça. */
export class Effects {
  private active: Fx[] = [];
  private lastByKey = new Map<string, number>();

  constructor(private scene: Scene) {}

  /** Há efeitos animando (a cena precisa ser redesenhada). */
  get busy(): boolean {
    return this.active.length > 0;
  }

  spawn(at: Vector3 | undefined, text: string, kind: string, throttleKey?: string, throttleMs = 200): void {
    if (!at) return;
    const now = performance.now();
    const key = throttleKey ?? `${at.x},${at.z}:${text}`;
    const last = this.lastByKey.get(key) ?? -Infinity;
    if (now - last < (throttleKey ? throttleMs : DEFAULT_THROTTLE_MS)) return;
    this.lastByKey.set(key, now);
    if (this.active.length >= MAX_ACTIVE) this.remove(0);
    const div = document.createElement('div');
    div.className = `fx fx-${kind}`;
    div.textContent = text;
    const obj = new CSS2DObject(div);
    const base = at.clone().add(new Vector3((Math.random() - 0.5) * 0.6, 1.2, 0));
    obj.position.copy(base);
    this.scene.add(obj);
    this.active.push({ obj, age: 0, base });
  }

  update(dt: number): void {
    // Os efeitos nascem em ordem: os que expiram estão sempre no começo da lista.
    let expired = 0;
    for (const fx of this.active) {
      fx.age += dt;
      const p = fx.age / LIFETIME;
      if (p >= 1) {
        expired++;
        continue;
      }
      fx.obj.position.set(fx.base.x, fx.base.y + p * 1.2, fx.base.z);
      if (p >= 0.7) fx.obj.element.style.opacity = String(1 - (p - 0.7) / 0.3);
    }
    if (expired) this.remove(0, expired);
  }

  private remove(start: number, count = 1) {
    for (const fx of this.active.splice(start, count)) {
      this.scene.remove(fx.obj);
      fx.obj.element.remove();
    }
  }

  clear(): void {
    this.remove(0, this.active.length);
    this.lastByKey.clear();
  }
}
