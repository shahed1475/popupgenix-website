export interface TaskEnv {
  databaseUrl: string;
  researchBatchSize: number;
}

const DEFAULT_RESEARCH_BATCH_SIZE = 5;

export function loadTaskEnv(
  source: Record<string, string | undefined> = process.env
): TaskEnv {
  const databaseUrl = source.WORKER_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("WORKER_DATABASE_URL is required to run task processing.");
  }

  const batchSizeRaw = source.WORKER_RESEARCH_BATCH_SIZE?.trim();
  if (!batchSizeRaw) {
    return { databaseUrl, researchBatchSize: DEFAULT_RESEARCH_BATCH_SIZE };
  }

  const parsed = Number(batchSizeRaw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `Invalid WORKER_RESEARCH_BATCH_SIZE "${batchSizeRaw}" — must be a positive integer.`
    );
  }

  return { databaseUrl, researchBatchSize: parsed };
}
