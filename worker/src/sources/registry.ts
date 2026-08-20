import type { LeadSourceAdapter } from "./types.js";

export interface SourceRegistry {
  get(sourceType: string): LeadSourceAdapter | undefined;
}

export function createSourceRegistry(adapters: LeadSourceAdapter[]): SourceRegistry {
  const map = new Map<string, LeadSourceAdapter>();
  for (const adapter of adapters) {
    if (map.has(adapter.sourceType)) {
      throw new Error(`Duplicate LeadSourceAdapter registered for sourceType "${adapter.sourceType}"`);
    }
    map.set(adapter.sourceType, adapter);
  }
  return {
    get(sourceType: string) {
      return map.get(sourceType);
    },
  };
}
