export type Disposable = { dispose: () => void };

/**
 * Single owner for shared geometries and materials.
 * Disposing twice is a no-op so a shared box cannot be freed twice.
 */
export class ResourceRegistry {
  private items: Disposable[] = [];
  private disposed = false;

  track<T extends Disposable>(value: T): T {
    if (this.disposed) {
      value.dispose();
      return value;
    }
    this.items.push(value);
    return value;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.items) item.dispose();
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}
