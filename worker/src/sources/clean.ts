import type { NormalizedLead } from "./normalize.js";

export type CleanedLead = NormalizedLead;

function extractDomain(value: string): string {
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/^www\./, "");
  domain = domain.split("/")[0];
  return domain;
}

export function clean(normalized: NormalizedLead): CleanedLead {
  const explicitDomain = normalized.company.domain;
  const derivedFromWebsite = normalized.company.website ? extractDomain(normalized.company.website) : null;
  const domain = explicitDomain ? extractDomain(explicitDomain) : derivedFromWebsite;

  const contact = normalized.contact
    ? {
        ...normalized.contact,
        email: normalized.contact.email ? normalized.contact.email.trim().toLowerCase() : null,
        phone: normalized.contact.phone ? normalized.contact.phone.replace(/\D/g, "") : null,
      }
    : null;

  return {
    ...normalized,
    company: { ...normalized.company, domain },
    contact,
  };
}
