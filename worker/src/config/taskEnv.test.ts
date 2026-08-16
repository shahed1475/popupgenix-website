import { describe, expect, it } from "vitest";
import { loadTaskEnv } from "./taskEnv.js";

const DB_URL = "postgresql://user:pass@localhost:5432/b2b";

describe("loadTaskEnv", () => {
  it("returns the database URL with a default batch size of 5", () => {
    const env = loadTaskEnv({ WORKER_DATABASE_URL: DB_URL });
    expect(env).toEqual({ databaseUrl: DB_URL, researchBatchSize: 5 });
  });

  it("throws when WORKER_DATABASE_URL is missing", () => {
    expect(() => loadTaskEnv({})).toThrow(/WORKER_DATABASE_URL/);
  });

  it("accepts a custom positive integer batch size", () => {
    const env = loadTaskEnv({ WORKER_DATABASE_URL: DB_URL, WORKER_RESEARCH_BATCH_SIZE: "10" });
    expect(env.researchBatchSize).toBe(10);
  });

  it("throws for a non-integer batch size", () => {
    expect(() =>
      loadTaskEnv({ WORKER_DATABASE_URL: DB_URL, WORKER_RESEARCH_BATCH_SIZE: "abc" })
    ).toThrow(/WORKER_RESEARCH_BATCH_SIZE/);
  });

  it("throws for a zero or negative batch size", () => {
    expect(() =>
      loadTaskEnv({ WORKER_DATABASE_URL: DB_URL, WORKER_RESEARCH_BATCH_SIZE: "0" })
    ).toThrow(/WORKER_RESEARCH_BATCH_SIZE/);
  });
});
