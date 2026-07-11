export const DEFAULT_NEWS_RESEARCH_BATCH_SIZE = 5
export const DEFAULT_NEWS_SCOUT_TIMEOUT_MS = 5 * 60_000

export function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function newsResearchBatchSize(value = process.env.NEWS_RUNNER_BATCH_SIZE): number {
  return positiveInteger(value, DEFAULT_NEWS_RESEARCH_BATCH_SIZE)
}
