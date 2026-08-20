// worker/src/sources/types.ts
export interface RawLead {
  externalId: string;
  company: {
    name?: string | null;
    domain?: string | null;
    industry?: string | null;
    sizeRange?: string | null;
    country?: string | null;
    website?: string | null;
    linkedinUrl?: string | null;
    description?: string | null;
  };
  contact?: {
    fullName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
  } | null;
  raw: Record<string, unknown>;
}

export interface SourceContext {
  organizationId: string;
  sourceId: string;
  config: Record<string, unknown>;
  cursor: string | null;
  limit: number;
  signal: AbortSignal;
}

export interface DiscoverResult {
  cursor: string | null;
}

export interface LeadSourceAdapter {
  sourceType: string;
  discover(query: unknown, context: SourceContext): AsyncGenerator<RawLead, DiscoverResult, void>;
}
