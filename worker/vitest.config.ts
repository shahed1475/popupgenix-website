import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Multiple test files share one live Postgres instance (see
    // src/test/setupTestDb.ts) and each truncates all tables in beforeEach.
    // Running files in parallel lets one file's truncate race another
    // file's inserts, so force sequential file execution.
    fileParallelism: false,
  },
});
