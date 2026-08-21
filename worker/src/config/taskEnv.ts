export interface TaskEnv {
  databaseUrl: string;
  researchBatchSize: number;
  leadFinderBatchSize: number;
}

const DEFAULT_RESEARCH_BATCH_SIZE = 5;
const DEFAULT_LEAD_FINDER_BATCH_SIZE = 100;

function parsePositiveInt(raw: string | undefined, envVarName: string, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${envVarName} "${raw}" — must be a positive integer.`);
  }
  return parsed;
}

export function loadTaskEnv(
  source: Record<string, string | undefined> = process.env
): TaskEnv {
  const databaseUrl = source.WORKER_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("WORKER_DATABASE_URL is required to run task processing.");
  }

  return {
    databaseUrl,
    researchBatchSize: parsePositiveInt(source.WORKER_RESEARCH_BATCH_SIZE?.trim(), "WORKER_RESEARCH_BATCH_SIZE", DEFAULT_RESEARCH_BATCH_SIZE),
    leadFinderBatchSize: parsePositiveInt(
      source.WORKER_LEAD_FINDER_BATCH_SIZE?.trim(),
      "WORKER_LEAD_FINDER_BATCH_SIZE",
      DEFAULT_LEAD_FINDER_BATCH_SIZE
    ),
  };
}
