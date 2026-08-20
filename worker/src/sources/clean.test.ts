import { describe, expect, it } from "vitest";
import { clean } from "./clean.js";
import type { NormalizedLead } from "./normalize.js";

function normalized(overrides: Partial<NormalizedLead> = {}): NormalizedLead {
  return {
    externalId: "ext-1",
    company: {},
    contact: null,
    raw: {},
    ...overrides,
  };
}

describe("clean", () => {
  it("strips protocol and www. from an explicit domain, lowercasing it", () => {
    const result = clean(normalized({ company: { domain: "https://www.ACME.com/" } }));
    expect(result.company.domain).toBe("acme.com");
  });

  it("derives domain from website when domain itself is absent", () => {
    const result = clean(normalized({ company: { website: "http://Example.org/path" } }));
    expect(result.company.domain).toBe("example.org");
  });

  it("prefers an explicit domain over deriving one from website", () => {
    const result = clean(normalized({ company: { domain: "acme.com", website: "http://other.com" } }));
    expect(result.company.domain).toBe("acme.com");
  });

  it("lowercases and trims email", () => {
    const result = clean(normalized({ contact: { email: "  Jane@ACME.com  " } }));
    expect(result.contact?.email).toBe("jane@acme.com");
  });

  it("strips non-digit characters from phone, without fabricating a country code", () => {
    const result = clean(normalized({ contact: { phone: "(555) 123-4567" } }));
    expect(result.contact?.phone).toBe("5551234567");
  });

  it("passes through a null phone as null", () => {
    const result = clean(normalized({ contact: { phone: null } }));
    expect(result.contact?.phone).toBeNull();
  });

  it("leaves company with no domain or website as null domain", () => {
    const result = clean(normalized({ company: { name: "Acme" } }));
    expect(result.company.domain).toBeNull();
  });
});
