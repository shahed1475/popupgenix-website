import { describe, expect, it } from "vitest";
import { createSourceRegistry } from "./registry.js";
import type { LeadSourceAdapter } from "./types.js";

function fakeAdapter(sourceType: string): LeadSourceAdapter {
  return {
    sourceType,
    async *discover() {
      return { cursor: null };
    },
  };
}

describe("createSourceRegistry", () => {
  it("looks up a registered adapter by sourceType", () => {
    const csv = fakeAdapter("csv");
    const registry = createSourceRegistry([csv]);
    expect(registry.get("csv")).toBe(csv);
  });

  it("returns undefined for an unregistered sourceType", () => {
    const registry = createSourceRegistry([fakeAdapter("csv")]);
    expect(registry.get("linkedin")).toBeUndefined();
  });

  it("throws when two adapters register the same sourceType", () => {
    expect(() => createSourceRegistry([fakeAdapter("csv"), fakeAdapter("csv")])).toThrow(/csv/);
  });
});
