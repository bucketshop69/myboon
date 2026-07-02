import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseAgentEditorDraftResponse } from './normalizer'
import type { AgentEditorDraftDecision, EditorDraftProvider, EntityDraftBundle } from './types'

const execFileAsync = promisify(execFile)
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

export interface HermesEditorDraftProviderOptions {
  command?: string
  toolsets?: string
  timeoutMs?: number
}

function memoryPayload(memory: EntityDraftBundle['memoryLane'][number]): Record<string, unknown> {
  return {
    id: memory.id,
    source: memory.source,
    source_area: memory.source_area,
    source_type: memory.source_type,
    source_ref_id: memory.source_ref_id,
    source_research_id: memory.source_research_id,
    memory_type: memory.memory_type,
    title: memory.title,
    summary: memory.summary,
    body: memory.body,
    event_at: memory.event_at,
    observed_at: memory.observed_at,
    confidence: memory.confidence,
    evidence: memory.evidence,
    mentions: memory.mentions,
    metrics: memory.metrics,
    context: memory.context,
  }
}

export async function buildHermesEditorDraftPrompt(bundle: EntityDraftBundle): Promise<string> {
  const stablePrompt = await readFile(join(__dirname, 'editor-prompt.md'), 'utf8')
  const newMemoryIds = new Set(bundle.newMemories.map((memory) => memory.id))
  const payload = {
    entity: {
      id: bundle.entity.id,
      slug: bundle.entity.slug,
      name: bundle.entity.name,
      type: bundle.entity.type,
      aliases: bundle.entity.aliases,
      summary: bundle.entity.summary,
      metadata: bundle.entity.metadata,
    },
    new_memories: bundle.newMemories.map(memoryPayload),
    prior_memory_lane: bundle.memoryLane
      .filter((memory) => !newMemoryIds.has(memory.id))
      .map(memoryPayload),
    prior_editor_drafts: bundle.priorDrafts.map((draft) => ({
      id: draft.id,
      source_memory_ids: draft.source_memory_ids,
      action: draft.action,
      status: draft.status,
      title: draft.title,
      angle: draft.angle,
      summary: draft.summary,
      reasoning: draft.reasoning,
      reason_codes: draft.reason_codes,
      created_at: draft.created_at,
    })),
    published_history: bundle.publishedHistory,
  }

  return [
    stablePrompt,
    '',
    '## Entity Bundle',
    JSON.stringify(payload, null, 2),
  ].join('\n')
}

export class HermesEditorDraftProvider implements EditorDraftProvider {
  private readonly command: string
  private readonly toolsets: string
  private readonly timeoutMs: number

  constructor(options: HermesEditorDraftProviderOptions = {}) {
    this.command = options.command ?? process.env.EDITOR_DRAFT_HERMES_COMMAND ?? 'hermes'
    this.toolsets = options.toolsets ?? process.env.EDITOR_DRAFT_HERMES_TOOLSETS ?? ''
    const envTimeout = Number(process.env.EDITOR_DRAFT_HERMES_TIMEOUT_MS)
    this.timeoutMs = options.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_TIMEOUT_MS)
  }

  async decide(bundle: EntityDraftBundle): Promise<AgentEditorDraftDecision> {
    const prompt = await buildHermesEditorDraftPrompt(bundle)
    const args = this.toolsets
      ? ['-t', this.toolsets, '-z', prompt]
      : ['-z', prompt]
    const { stdout, stderr } = await execFileAsync(
      this.command,
      args,
      {
        timeout: this.timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      }
    )

    const parsed = parseAgentEditorDraftResponse(stdout)
    const decision = parsed.decisions[0]
    if (!decision) {
      throw new Error(`Editor draft agent returned no decisions. stderr=${stderr.slice(0, 500)}`)
    }
    return decision
  }
}
