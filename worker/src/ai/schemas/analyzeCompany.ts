import { z } from "zod";
import { confidenceSchema, nonEmptyString } from "./common.js";

export const analyzeCompanyInputSchema = z.object({
  companyName: nonEmptyString,
  domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  rawContext: z.string().nullable().optional(),
});
export type AnalyzeCompanyInput = z.infer<typeof analyzeCompanyInputSchema>;

export const analyzeCompanyOutputSchema = z.object({
  technology: z.array(z.string()),
  revenueEstimate: z.string().nullable().optional(),
  employees: z.string().nullable().optional(),
  growth: z.string().nullable().optional(),
  hiring: z.array(z.string()),
  funding: z.string().nullable().optional(),
  painPoints: z.array(z.string()),
  buyingSignals: z.array(z.string()),
  aiSummary: nonEmptyString,
  confidence: confidenceSchema,
});
export type AnalyzeCompanyOutput = z.infer<typeof analyzeCompanyOutputSchema>;
