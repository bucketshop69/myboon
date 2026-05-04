import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BacktestRunSummary, NarrativeOutcome } from './contracts.js'
import { BacktestRunSummarySchema, NarrativeOutcomeSchema } from './schemas.js'

export interface BacktestRunArtifact<TParams extends Record<string, unknown> = Record<string, unknown>> {
  summary: BacktestRunSummary
  params: TParams
  selected: NarrativeOutcome[]
  baseline: NarrativeOutcome[]
  examples: {
    hits: NarrativeOutcome[]
    misses: NarrativeOutcome[]
  }
}

export function defaultBacktestArtifactPath(summary: BacktestRunSummary): string {
  const safeId = summary.id.replace(/[^a-zA-Z0-9._-]/g, '-')
  return path.resolve(process.cwd(), 'artifacts', 'intelligence-backtests', `${safeId}.json`)
}

export async function writeBacktestArtifact(
  artifact: BacktestRunArtifact,
  outputPath = defaultBacktestArtifactPath(artifact.summary)
): Promise<string> {
  BacktestRunSummarySchema.parse(artifact.summary)
  for (const outcome of [...artifact.selected, ...artifact.baseline, ...artifact.examples.hits, ...artifact.examples.misses]) {
    NarrativeOutcomeSchema.parse(outcome)
  }

  const resolved = path.resolve(outputPath)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  return resolved
}
