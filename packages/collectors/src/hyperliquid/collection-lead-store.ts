import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { HyperliquidResearchLead } from './research-leads.js'

export interface CollectionRunInput {
  source: string
  collector: string
  params: Record<string, unknown>
}

export interface CollectionRunRecord {
  id: string
}

export interface FinishCollectionRunInput {
  status: 'completed' | 'failed'
  summary?: unknown
  artifactPath?: string
  error?: string
}

export interface PersistCollectionLeadsInput {
  source: string
  collector: string
  runId: string
  leads: HyperliquidResearchLead[]
}

function shouldWriteCollectionLeads(): boolean {
  return process.env.COLLECTION_LEADS_WRITE === '1'
    || process.env.HYPERLIQUID_COLLECTION_LEADS_WRITE === '1'
}

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function collectionLeadPersistenceEnabled(): boolean {
  return shouldWriteCollectionLeads() && hasSupabaseEnv()
}

export function collectionLeadPersistenceStatus(): string {
  if (!shouldWriteCollectionLeads()) {
    return 'disabled; set HYPERLIQUID_COLLECTION_LEADS_WRITE=1 to write collection_leads'
  }
  if (!hasSupabaseEnv()) {
    return 'disabled; SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
  }
  return 'enabled'
}

export function createCollectionLeadSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to persist collection leads')
  }
  return createClient(url, key)
}

export async function startCollectionRun(
  input: CollectionRunInput,
  db?: SupabaseClient
): Promise<CollectionRunRecord | null> {
  if (!collectionLeadPersistenceEnabled()) return null
  const client = db ?? createCollectionLeadSupabaseClient()

  const { data, error } = await client
    .from('collection_runs')
    .insert({
      source: input.source,
      collector: input.collector,
      params: input.params,
      status: 'running',
    })
    .select('id')
    .single()

  if (error) throw new Error(`collection_runs insert failed: ${error.message}`)
  return data
}

export async function finishCollectionRun(
  runId: string | null,
  input: FinishCollectionRunInput,
  db?: SupabaseClient
): Promise<void> {
  if (!runId || !collectionLeadPersistenceEnabled()) return
  const client = db ?? createCollectionLeadSupabaseClient()

  const { error } = await client
    .from('collection_runs')
    .update({
      status: input.status,
      summary: input.summary ?? {},
      artifact_path: input.artifactPath ?? null,
      error: input.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (error) throw new Error(`collection_runs update failed: ${error.message}`)
}

export async function persistCollectionLeads(
  input: PersistCollectionLeadsInput,
  db?: SupabaseClient
): Promise<number> {
  if (!collectionLeadPersistenceEnabled() || input.leads.length === 0) return 0
  const client = db ?? createCollectionLeadSupabaseClient()

  const updatedAt = new Date().toISOString()
  const rows = input.leads.map((lead) => ({
    source: input.source,
    collector: input.collector,
    collection_run_id: input.runId,
    lane: lead.lane,
    asset: lead.asset,
    status: lead.status,
    priority: lead.priority,
    story_key: lead.storyKey,
    lead_id: lead.id,
    observed_at: lead.observedAt,
    headline: lead.headline,
    what_changed: lead.whatChanged,
    why_interesting: lead.whyInteresting,
    suggested_research_questions: lead.suggestedResearchQuestions,
    metrics: lead.metrics,
    checks: lead.checks,
    receipts: lead.receipts,
    uncertainty: lead.uncertainty,
    supporting_lead_ids: lead.supportingLeadIds,
    raw_lead: lead,
    updated_at: updatedAt,
  }))

  const { error } = await client
    .from('collection_leads')
    .upsert(rows, { onConflict: 'source,lane,story_key' })

  if (error) throw new Error(`collection_leads upsert failed: ${error.message}`)
  return rows.length
}
