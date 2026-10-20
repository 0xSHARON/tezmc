import { GameAdapter } from '@autoplay/shared';

export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private adapters: Map<string, GameAdapter> = new Map();

  private constructor() {}

  public static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  public register(adapter: GameAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter with id '${adapter.id}' is already registered.`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  public get(id: string): GameAdapter | undefined {
    return this.adapters.get(id);
  }

  public list(): GameAdapter[] {
    return Array.from(this.adapters.values());
  }

  public has(id: string): boolean {
    return this.adapters.has(id);
  }
}
