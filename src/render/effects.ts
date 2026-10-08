import { Vector3, type Scene } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const LIFETIME = 1400;
const MAX_ACTIVE = 50;

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

  spawn(at: Vector3 | undefined, text: string, kind: string, throttleKey?: string, throttleMs = 200): void {
    if (!at) return;
    const now = performance.now();
    if (throttleKey) {
      const last = this.lastByKey.get(throttleKey) ?? 0;
      if (now - last < throttleMs) return;
      this.lastByKey.set(throttleKey, now);
    }
    if (this.active.length >= MAX_ACTIVE) this.remove(this.active[0]);
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
    for (const fx of [...this.active]) {
      fx.age += dt;
      const p = fx.age / LIFETIME;
      if (p >= 1) {
        this.remove(fx);
        continue;
      }
      fx.obj.position.set(fx.base.x, fx.base.y + p * 1.2, fx.base.z);
      fx.obj.element.style.opacity = String(p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
    }
  }

  private remove(fx: Fx) {
    this.scene.remove(fx.obj);
    this.active = this.active.filter((x) => x !== fx);
  }

  clear(): void {
    for (const fx of [...this.active]) this.remove(fx);
    this.lastByKey.clear();
  }
}
