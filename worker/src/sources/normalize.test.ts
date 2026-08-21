// worker/src/sources/normalize.test.ts
import { describe, expect, it } from "vitest";
import { normalize } from "./normalize.js";
import type { RawLead } from "./types.js";

function rawLead(overrides: Partial<RawLead> = {}): RawLead {
  return {
    externalId: "ext-1",
    company: {},
    contact: null,
    raw: {},
    ...overrides,
  };
}

describe("normalize", () => {
  it("trims whitespace from company and contact string fields", () => {
    const result = normalize(
      rawLead({
        company: { name: "  Acme Inc  ", domain: " acme.com " },
        contact: { fullName: "  Jane Doe  ", email: " jane@acme.com " },
      })
    );
    expect(result.company.name).toBe("Acme Inc");
    expect(result.company.domain).toBe("acme.com");
    expect(result.contact?.fullName).toBe("Jane Doe");
    expect(result.contact?.email).toBe("jane@acme.com");
  });

  it("coerces empty strings to null", () => {
    const result = normalize(rawLead({ company: { name: "Acme", domain: "" } }));
    expect(result.company.domain).toBeNull();
  });

  it("coerces whitespace-only strings to null", () => {
    const result = normalize(rawLead({ company: { name: "Acme", website: "   " } }));
    expect(result.company.website).toBeNull();
  });

  it("preserves a null contact as null, not an empty object", () => {
    const result = normalize(rawLead({ contact: null }));
    expect(result.contact).toBeNull();
  });

  it("preserves externalId and raw untouched", () => {
    const result = normalize(rawLead({ externalId: "ext-42", raw: { anything: 1 } }));
    expect(result.externalId).toBe("ext-42");
    expect(result.raw).toEqual({ anything: 1 });
  });
});
