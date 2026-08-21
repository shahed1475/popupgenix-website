import { createHash } from "node:crypto";
import type { DiscoverResult, LeadSourceAdapter, RawLead, SourceContext } from "./types.js";

export interface CsvImportQuery {
  csvText: string;
}

interface CsvRow {
  company_name?: string;
  domain?: string;
  contact_full_name?: string;
  contact_email?: string;
}

function parseCsv(csvText: string): CsvRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    return row as CsvRow;
  });
}

function externalIdFor(row: CsvRow): string {
  const canonical = JSON.stringify(row, Object.keys(row).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function toRawLead(row: CsvRow): RawLead {
  return {
    externalId: externalIdFor(row),
    company: {
      name: row.company_name || null,
      domain: row.domain || null,
    },
    contact:
      row.contact_full_name || row.contact_email
        ? {
            fullName: row.contact_full_name || null,
            email: row.contact_email || null,
          }
        : null,
    raw: { ...row },
  };
}

export const csvAdapter: LeadSourceAdapter = {
  sourceType: "csv",
  async *discover(query: unknown, context: SourceContext): AsyncGenerator<RawLead, DiscoverResult, void> {
    const { csvText } = query as CsvImportQuery;
    const maxRows = typeof context.config.maxRows === "number" ? context.config.maxRows : 5000;
    const rows = parseCsv(csvText);
    if (rows.length > maxRows) {
      throw new Error(
        `CSV import has ${rows.length} rows, which exceeds maxRows (${maxRows}) — split the file and import it in multiple batches.`
      );
    }
    for (const row of rows) {
      yield toRawLead(row);
    }
    return { cursor: null };
  },
};
