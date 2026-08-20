// worker/src/sources/normalize.ts
import type { RawLead } from "./types.js";

export interface NormalizedLead {
  externalId: string;
  company: RawLead["company"];
  contact: RawLead["contact"];
  raw: Record<string, unknown>;
}

function trimToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalize(raw: RawLead): NormalizedLead {
  const company: NormalizedLead["company"] = {
    name: trimToNull(raw.company.name),
    domain: trimToNull(raw.company.domain),
    industry: trimToNull(raw.company.industry),
    sizeRange: trimToNull(raw.company.sizeRange),
    country: trimToNull(raw.company.country),
    website: trimToNull(raw.company.website),
    linkedinUrl: trimToNull(raw.company.linkedinUrl),
    description: trimToNull(raw.company.description),
  };

  const contact: NormalizedLead["contact"] = raw.contact
    ? {
        fullName: trimToNull(raw.contact.fullName),
        title: trimToNull(raw.contact.title),
        email: trimToNull(raw.contact.email),
        phone: trimToNull(raw.contact.phone),
        linkedinUrl: trimToNull(raw.contact.linkedinUrl),
      }
    : null;

  return { externalId: raw.externalId, company, contact, raw: raw.raw };
}
