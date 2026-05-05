import type { SupabaseClient } from '@supabase/supabase-js'
import type { NarrativeOutcome, OutcomeCriterion } from './contracts.js'
import { NarrativeOutcomeSchema } from './schemas.js'

export interface NarrativeOutcomeRow {
  id?: string
  narrative_id: string
  schema_version: number
  scoring_version: number
  evaluated_at: string
  criteria: OutcomeCriterion[]
  result: NarrativeOutcome['result']
  measured_values: NarrativeOutcome['measuredValues']
  notes?: string | null
}

export function narrativeOutcomeToRow(outcome: NarrativeOutcome): NarrativeOutcomeRow {
  const parsed = NarrativeOutcomeSchema.parse(outcome)
  return {
    id: parsed.id.startsWith('outcome:') ? undefined : parsed.id,
    narrative_id: parsed.narrativeId,
    schema_version: parsed.schemaVersion,
    scoring_version: parsed.scoringVersion,
    evaluated_at: parsed.evaluatedAt,
    criteria: parsed.criteria,
    result: parsed.result,
    measured_values: parsed.measuredValues,
    notes: parsed.notes ?? null,
  }
}

export async function insertNarrativeOutcome(
  supabase: Pick<SupabaseClient, 'from'>,
  outcome: NarrativeOutcome
): Promise<void> {
  const row = narrativeOutcomeToRow(outcome)
  const { error } = await supabase
    .from('narrative_outcomes')
    .insert(row)

  if (error) throw error
}
