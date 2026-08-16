import { describe, expect, it } from "vitest";
import { AIProviderValidationError } from "./errors.js";
import { MockAIProvider } from "./MockAIProvider.js";

describe("MockAIProvider", () => {
  const provider = new MockAIProvider();

  it("analyzeCompany returns schema-valid output referencing the input", async () => {
    const result = await provider.analyzeCompany({
      companyName: "Acme",
      domain: null,
      industry: "Software",
      description: null,
      rawContext: null,
    });
    expect(result.aiSummary).toContain("Acme");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("researchContact returns schema-valid output referencing the input", async () => {
    const result = await provider.researchContact({
      fullName: "Jane Doe",
      title: "VP Sales",
      companyName: "Acme",
      rawContext: null,
    });
    expect(result.summary).toContain("Jane Doe");
  });

  it("qualifyLead returns a score within 0-100", async () => {
    const result = await provider.qualifyLead({
      companySummary: "Acme is a SaaS company",
      companyPainPoints: [],
      companyIcpFitSignals: [],
      contactSummary: null,
      contactPainPoints: [],
      icpCriteria: {},
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("generateOutreach returns a draft with exactly the draft fields", async () => {
    const result = await provider.generateOutreach({
      companyName: "Acme",
      contactName: "Jane",
      contactTitle: null,
      companyPainPoints: [],
      personalizationHooks: [],
      channel: "email",
      messagingThemes: null,
    });
    expect(result.body.length).toBeGreaterThan(0);
    expect(Object.keys(result).sort()).toEqual(["body", "channel", "subject"]);
  });

  it("classifyReply returns a valid intent and sentiment", async () => {
    const result = await provider.classifyReply({
      rawContent: "Not interested, thanks.",
      originalMessageSummary: null,
    });
    expect(result.intent).toBeDefined();
    expect(result.sentiment).toBeDefined();
  });

  it("generateReply returns a non-empty draft body", async () => {
    const result = await provider.generateReply({
      rawContent: "Tell me more",
      intent: "question",
      sentiment: "neutral",
      companyName: "Acme",
      contactName: "Jane",
      conversationSummary: null,
    });
    expect(result.body.length).toBeGreaterThan(0);
  });

  it("analyzeStrategy returns recommendations with exactly the recommendation fields", async () => {
    const result = await provider.analyzeStrategy({
      currentConfig: {},
      performanceMetrics: {
        totalLeads: 10,
        qualifiedLeads: 5,
        repliesReceived: 2,
        meetingsBooked: 1,
        wonDeals: 0,
        lostDeals: 1,
        replyRate: 0.2,
        meetingRate: 0.1,
        winRate: 0,
      },
    });
    expect(Object.keys(result).sort()).toEqual(["confidence", "recommendedChanges", "summary"]);
  });

  it("wraps invalid input in AIProviderValidationError", async () => {
    await expect(
      provider.analyzeCompany({
        companyName: "",
        domain: null,
        industry: null,
        description: null,
        rawContext: null,
      })
    ).rejects.toBeInstanceOf(AIProviderValidationError);
  });
});
