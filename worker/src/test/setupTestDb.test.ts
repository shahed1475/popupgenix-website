import { afterEach, describe, expect, it } from "vitest";
import { createTestPool } from "./setupTestDb.js";

const ORIGINAL_URL = process.env.TEST_DATABASE_URL;

afterEach(() => {
  process.env.TEST_DATABASE_URL = ORIGINAL_URL;
});

describe("createTestPool — destructive-schema guard", () => {
  it("refuses a TEST_DATABASE_URL that is not a *_worker_test database", async () => {
    // schema.sql DROPs every table it owns on connect; pointed at the server's test database it
    // would destroy the server suite's tables (this actually happened once during development).
    process.env.TEST_DATABASE_URL = "postgresql://drickly_test:drickly_test@localhost:15432/drickly_test";

    await expect(createTestPool()).rejects.toThrow(/does not match/);
  });

  it("refuses a connection string with no database name", async () => {
    process.env.TEST_DATABASE_URL = "postgresql://drickly_test:drickly_test@localhost:15432";

    await expect(createTestPool()).rejects.toThrow(/refusing to run worker tests/);
  });

  it("accepts the dedicated worker test database", async () => {
    const pool = await createTestPool();
    try {
      const { rows } = await pool.query<{ current_database: string }>("SELECT current_database()");
      expect(rows[0].current_database).toMatch(/_worker_test$/);
    } finally {
      await pool.end();
    }
  });
});
