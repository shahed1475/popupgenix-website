import { describe, expect, it } from "vitest";
import { analyzeCompanyInputSchema, analyzeCompanyOutputSchema } from "./analyzeCompany.js";

describe("analyzeCompanyInputSchema", () => {
  it("accepts minimal valid input", () => {
    expect(() =>
      analyzeCompanyInputSchema.parse({
        companyName: "Acme",
        domain: null,
        industry: null,
        description: null,
        rawContext: null,
      })
    ).not.toThrow();
  });

  it("rejects an empty companyName", () => {
    expect(() => analyzeCompanyInputSchema.parse({ companyName: "" })).toThrow();
  });
});

describe("analyzeCompanyOutputSchema", () => {
  const valid = {
    technology: ["React"],
    revenueEstimate: "$1M-$5M",
    employees: "11-50",
    growth: "steady",
    hiring: ["Software Engineer"],
    funding: "Series A",
    painPoints: ["Manual work"],
    buyingSignals: ["Recently raised funding"],
    aiSummary: "Acme is a SaaS company.",
    confidence: 0.7,
  };

  it("accepts a valid output", () => {
    expect(() => analyzeCompanyOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects confidence outside 0..1", () => {
    expect(() => analyzeCompanyOutputSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
  });

  it("rejects a missing aiSummary", () => {
    const { aiSummary: _aiSummary, ...rest } = valid;
    expect(() => analyzeCompanyOutputSchema.parse(rest)).toThrow();
  });

  it("accepts null for optional string fields", () => {
    expect(() =>
      analyzeCompanyOutputSchema.parse({
        ...valid,
        revenueEstimate: null,
        employees: null,
        growth: null,
        funding: null,
      })
    ).not.toThrow();
  });
});
