import { describe, expect, it } from "vitest";
import { ClaudeAIProvider, type AnthropicMessagesLike } from "./ClaudeAIProvider.js";
import {
  AIProviderAuthenticationError,
  AIProviderRateLimitError,
  AIProviderRefusalError,
  AIProviderRequestError,
  AIProviderValidationError,
} from "./errors.js";

function makeProvider(client: AnthropicMessagesLike) {
  return new ClaudeAIProvider({ client, model: "claude-opus-5", effort: "medium" });
}

describe("ClaudeAIProvider", () => {
  it("analyzeCompany returns validated output on success", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: {
            technology: ["React", "Postgres"],
            revenueEstimate: "$10M-$50M",
            employees: "51-200",
            growth: "rapid",
            hiring: ["Software Engineer", "Product Manager"],
            funding: "Series B",
            painPoints: ["Slow onboarding"],
            buyingSignals: ["Uses modern stack"],
            aiSummary: "Acme is a mid-size SaaS company.",
            confidence: 0.8,
          },
        }),
      },
    };

    const provider = makeProvider(fakeClient);
    const result = await provider.analyzeCompany({
      companyName: "Acme",
      domain: "acme.com",
      industry: "Software",
      description: null,
      rawContext: null,
    });

    expect(result.aiSummary).toBe("Acme is a mid-size SaaS company.");
    expect(result.confidence).toBe(0.8);
  });

  it("researchContact returns validated output on success", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: {
            summary: "Jane Doe is VP of Engineering at Acme.",
            seniority: "executive",
            likelyPainPoints: ["Limited engineering bandwidth"],
            personalizationHooks: ["Recently posted about scaling challenges"],
            confidence: 0.75,
          },
        }),
      },
    };

    const provider = makeProvider(fakeClient);
    const result = await provider.researchContact({
      fullName: "Jane Doe",
      title: "VP Engineering",
      companyName: "Acme",
      rawContext: null,
    });

    expect(result.summary).toBe("Jane Doe is VP of Engineering at Acme.");
    expect(result.confidence).toBe(0.75);
  });

  it("generateReply returns validated draft output on success", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: { body: "Thanks for getting back to me — happy to share more details." },
        }),
      },
    };

    const provider = makeProvider(fakeClient);
    const result = await provider.generateReply({
      rawContent: "Can you tell me more about pricing?",
      intent: "question",
      sentiment: "neutral",
      companyName: "Acme",
      contactName: "Jane",
      conversationSummary: null,
    });

    expect(result.body).toBe("Thanks for getting back to me — happy to share more details.");
  });

  it("throws AIProviderRefusalError when stop_reason is refusal", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({
          stop_reason: "refusal",
          stop_details: { category: "cyber" },
          parsed_output: null,
        }),
      },
    };
    const provider = makeProvider(fakeClient);

    await expect(
      provider.analyzeCompany({
        companyName: "Acme",
        domain: null,
        industry: null,
        description: null,
        rawContext: null,
      })
    ).rejects.toBeInstanceOf(AIProviderRefusalError);
  });

  it("throws AIProviderValidationError when parsed_output is null", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({ stop_reason: "end_turn", parsed_output: null }),
      },
    };
    const provider = makeProvider(fakeClient);

    await expect(
      provider.qualifyLead({
        companySummary: "x",
        companyPainPoints: [],
        companyIcpFitSignals: [],
        contactSummary: null,
        contactPainPoints: [],
        icpCriteria: {},
      })
    ).rejects.toBeInstanceOf(AIProviderValidationError);
  });

  it("throws AIProviderValidationError when parsed_output fails schema validation (malformed output)", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: { score: "not-a-number", band: "hot", reasoning: "x" },
        }),
      },
    };
    const provider = makeProvider(fakeClient);

    await expect(
      provider.qualifyLead({
        companySummary: "x",
        companyPainPoints: [],
        companyIcpFitSignals: [],
        contactSummary: null,
        contactPainPoints: [],
        icpCriteria: {},
      })
    ).rejects.toBeInstanceOf(AIProviderValidationError);
  });

  it("wraps invalid input in AIProviderValidationError before calling the client", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => {
          throw new Error("should never be called");
        },
      },
    };
    const provider = makeProvider(fakeClient);

    await expect(
      provider.qualifyLead({
        companySummary: "",
        companyPainPoints: [],
        companyIcpFitSignals: [],
        contactSummary: null,
        contactPainPoints: [],
        icpCriteria: {},
      })
    ).rejects.toBeInstanceOf(AIProviderValidationError);
  });

  it("throws AIProviderRateLimitError when the client throws a 429", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => {
          throw Object.assign(new Error("rate limited"), { status: 429 });
        },
      },
    };
    const provider = makeProvider(fakeClient);

    await expect(
      provider.classifyReply({ rawContent: "hello", originalMessageSummary: null })
    ).rejects.toBeInstanceOf(AIProviderRateLimitError);
  });

  it("throws AIProviderAuthenticationError when the client throws a 401", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => {
          throw Object.assign(new Error("invalid api key"), { status: 401 });
        },
      },
    };
    const provider = makeProvider(fakeClient);

    await expect(
      provider.classifyReply({ rawContent: "hello", originalMessageSummary: null })
    ).rejects.toBeInstanceOf(AIProviderAuthenticationError);
  });

  it("throws AIProviderRequestError for any other SDK failure (generic failure)", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => {
          throw new Error("something went wrong");
        },
      },
    };
    const provider = makeProvider(fakeClient);

    await expect(
      provider.classifyReply({ rawContent: "hello", originalMessageSummary: null })
    ).rejects.toBeInstanceOf(AIProviderRequestError);
  });

  it("draft-only: generateOutreach never includes a send-state field", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: { subject: "Hi", body: "Hello there", channel: "email" },
        }),
      },
    };
    const provider = makeProvider(fakeClient);
    const result = await provider.generateOutreach({
      companyName: "Acme",
      contactName: "Jane",
      contactTitle: null,
      companyPainPoints: [],
      personalizationHooks: [],
      channel: "email",
      messagingThemes: null,
    });

    expect(Object.keys(result).sort()).toEqual(["body", "channel", "subject"]);
  });

  it("strategy recommendations only: analyzeStrategy never includes a persistence field", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: {
            summary: "Focus on mid-market",
            recommendedChanges: [
              {
                field: "targetCompanySize",
                currentValue: "1-10",
                suggestedValue: "50-200",
                reasoning: "Higher win rate",
              },
            ],
            confidence: 0.7,
          },
        }),
      },
    };
    const provider = makeProvider(fakeClient);
    const result = await provider.analyzeStrategy({
      currentConfig: {},
      performanceMetrics: {
        totalLeads: 100,
        qualifiedLeads: 40,
        repliesReceived: 10,
        meetingsBooked: 3,
        wonDeals: 1,
        lostDeals: 2,
        replyRate: 0.1,
        meetingRate: 0.03,
        winRate: 0.01,
      },
    });

    expect(Object.keys(result).sort()).toEqual(["confidence", "recommendedChanges", "summary"]);
  });
});
