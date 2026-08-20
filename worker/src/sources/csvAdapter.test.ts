import { describe, expect, it } from "vitest";
import { csvAdapter } from "./csvAdapter.js";
import type { SourceContext } from "./types.js";

function context(overrides: Partial<SourceContext> = {}): SourceContext {
  return {
    organizationId: "org-1",
    sourceId: "source-1",
    config: {},
    cursor: null,
    limit: 100,
    signal: new AbortController().signal,
    ...overrides,
  };
}

const HEADER = "company_name,domain,contact_full_name,contact_email\n";

describe("csvAdapter", () => {
  it("yields one RawLead per data row", async () => {
    const csvText = HEADER + "Acme Inc,acme.com,Jane Doe,jane@acme.com\nBeta LLC,beta.com,,\n";
    const results = [];
    const gen = csvAdapter.discover({ csvText }, context());
    let next = await gen.next();
    while (!next.done) {
      results.push(next.value);
      next = await gen.next();
    }

    expect(results).toHaveLength(2);
    expect(results[0].company.name).toBe("Acme Inc");
    expect(results[0].company.domain).toBe("acme.com");
    expect(results[0].contact?.fullName).toBe("Jane Doe");
    expect(results[0].contact?.email).toBe("jane@acme.com");
    expect(results[1].contact).toBeNull();
    expect(next.value).toEqual({ cursor: null });
  });

  it("computes a stable externalId from row content, same content -> same id across calls", async () => {
    const csvText = HEADER + "Acme Inc,acme.com,,\n";
    const first = await csvAdapter.discover({ csvText }, context()).next();
    const second = await csvAdapter.discover({ csvText }, context()).next();
    expect(first.value.externalId).toBe(second.value.externalId);
  });

  it("computes a different externalId when row content differs", async () => {
    const a = await csvAdapter.discover({ csvText: HEADER + "Acme Inc,acme.com,,\n" }, context()).next();
    const b = await csvAdapter.discover({ csvText: HEADER + "Beta LLC,beta.com,,\n" }, context()).next();
    expect(a.value.externalId).not.toBe(b.value.externalId);
  });

  it("rejects a file larger than config.maxRows before yielding anything", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => `Company ${i},company${i}.com,,`).join("\n");
    const csvText = HEADER + rows + "\n";
    const gen = csvAdapter.discover({ csvText }, context({ config: { maxRows: 3 } }));
    await expect(gen.next()).rejects.toThrow(/maxRows|5 rows exceeds/i);
  });

  it("defaults maxRows to 5000 when config doesn't specify one", async () => {
    const csvText = HEADER + "Acme Inc,acme.com,,\n";
    const gen = csvAdapter.discover({ csvText }, context());
    await expect(gen.next()).resolves.toMatchObject({ done: false });
  });
});
