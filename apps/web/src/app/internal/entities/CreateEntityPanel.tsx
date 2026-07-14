'use client'

import { FormEvent, useState } from 'react'
import type {
  ManualEntityApplyResponse,
  ManualEntityCommand,
  ManualEntityPreviewResponse,
} from './types'
import styles from './styles.module.css'

type MemoryType = ManualEntityCommand['memories'][number]['memoryType']

interface DraftMemory {
  id: string
  memoryType: MemoryType
  title: string
  summary: string
  body: string
  eventAt: string
  sourceLabel: string
  sourceUrl: string
}

interface CreateEntityPanelProps {
  onClose: () => void
  onApplied: (entityId: string) => Promise<void> | void
}

export function CreateEntityPanel({ onClose, onApplied }: CreateEntityPanelProps) {
  const [requestId] = useState(createRequestId)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [type, setType] = useState('topic')
  const [aliases, setAliases] = useState('')
  const [summary, setSummary] = useState('')
  const [carouselChoice, setCarouselChoice] = useState<'keep' | 'show' | 'hide'>('keep')
  const [memories, setMemories] = useState<DraftMemory[]>([newMemory()])
  const [preview, setPreview] = useState<ManualEntityPreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  function invalidatePreview() {
    setPreview(null)
    setError(null)
  }

  function updateMemory(id: string, field: keyof Omit<DraftMemory, 'id'>, value: string) {
    setMemories((current) => current.map((memory) => memory.id === id ? { ...memory, [field]: value } : memory))
    invalidatePreview()
  }

  function removeMemory(id: string) {
    setMemories((current) => current.filter((memory) => memory.id !== id))
    invalidatePreview()
  }

  function buildCommand(): ManualEntityCommand {
    const entity: ManualEntityCommand['entity'] = {
      name: name.trim(),
      type: type.trim(),
    }
    if (slug.trim()) entity.slug = slug.trim()
    const parsedAliases = aliases.split(',').map((alias) => alias.trim()).filter(Boolean)
    if (parsedAliases.length) entity.aliases = parsedAliases
    if (summary.trim()) entity.summary = summary.trim()
    if (carouselChoice !== 'keep') entity.showInCarousel = carouselChoice === 'show'

    return {
      requestId,
      actor: { kind: 'dashboard', name: 'myboon founder dashboard' },
      entity,
      memories: memories.map((memory) => ({
        memoryType: memory.memoryType,
        title: memory.title.trim(),
        summary: memory.summary.trim(),
        ...(memory.body.trim() ? { body: memory.body.trim() } : {}),
        eventAt: memory.eventAt,
        ...(memory.sourceLabel.trim() ? { sourceLabel: memory.sourceLabel.trim() } : {}),
        ...(memory.sourceUrl.trim() ? { sourceUrl: memory.sourceUrl.trim() } : {}),
      })),
    }
  }

  async function submitPreview(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setIsPreviewing(true)
    try {
      const res = await fetch('/internal/entities/api/entity-commands/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ command: buildCommand() }),
      })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      if (!res.ok) throw new Error(await readableError(res))
      setPreview(await res.json() as ManualEntityPreviewResponse)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to preview Entity command')
    } finally {
      setIsPreviewing(false)
    }
  }

  async function applyPreview() {
    if (!preview) return
    setError(null)
    setIsApplying(true)
    try {
      const res = await fetch('/internal/entities/api/entity-commands/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ command: preview.command, previewHash: preview.planHash }),
      })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      if (!res.ok) throw new Error(await readableError(res))
      const result = await res.json() as ManualEntityApplyResponse
      await onApplied(result.entity.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply Entity command')
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className={styles.commandBackdrop} role="presentation" onMouseDown={(event) => !isApplying && event.target === event.currentTarget && onClose()}>
      <section className={styles.commandPanel} role="dialog" aria-modal="true" aria-labelledby="create-entity-title">
        <header className={styles.commandHeader}>
          <div>
            <p className={styles.kicker}>Entity Manager command</p>
            <h2 id="create-entity-title">Create or enrich an Entity</h2>
            <p>Preview first. Nothing is written until you apply the reviewed command.</p>
          </div>
          <button className={styles.iconButton} type="button" title="Close" disabled={isApplying} onClick={onClose}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <form className={styles.commandForm} onSubmit={submitPreview}>
          <fieldset disabled={isPreviewing || isApplying}>
            <legend>Entity</legend>
            <div className={styles.commandGrid}>
              <CommandField label="Name" required value={name} onChange={(value) => { setName(value); invalidatePreview() }} />
              <CommandField label="Type" required value={type} onChange={(value) => { setType(value); invalidatePreview() }} />
              <CommandField label="Slug (optional)" value={slug} onChange={(value) => { setSlug(value); invalidatePreview() }} />
              <CommandField label="Aliases, comma separated" value={aliases} onChange={(value) => { setAliases(value); invalidatePreview() }} />
            </div>
            <label className={styles.commandField}>
              <span>Entity note</span>
              <textarea value={summary} rows={3} onChange={(event) => { setSummary(event.target.value); invalidatePreview() }} />
            </label>
            <label className={styles.commandField}>
              <span>Carousel selection</span>
              <select value={carouselChoice} onChange={(event) => { setCarouselChoice(event.target.value as typeof carouselChoice); invalidatePreview() }}>
                <option value="keep">Keep current selection</option>
                <option value="show">Show in carousel</option>
                <option value="hide">Hide from carousel</option>
              </select>
            </label>
          </fieldset>

          <div className={styles.memoryEditorHeader}>
            <div>
              <h3>Timeline memories</h3>
              <p>Add only concise events you want saved under this Entity.</p>
            </div>
            <button className={styles.textButton} type="button" disabled={isPreviewing || isApplying} onClick={() => { setMemories((current) => [...current, newMemory()]); invalidatePreview() }}>
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              Add event
            </button>
          </div>

          {memories.map((memory, index) => (
            <fieldset className={styles.memoryEditor} key={memory.id} disabled={isPreviewing || isApplying}>
              <legend>Event {index + 1}</legend>
              <div className={styles.memoryEditorTopline}>
                <select value={memory.memoryType} onChange={(event) => updateMemory(memory.id, 'memoryType', event.target.value)}>
                  <option value="timeline_event">Timeline event</option>
                  <option value="news_event">News event</option>
                  <option value="research_note">Research note</option>
                  <option value="market_signal">Market signal</option>
                  <option value="social_signal">Social signal</option>
                  <option value="metric_change">Metric change</option>
                </select>
                <input type="date" required value={memory.eventAt} onChange={(event) => updateMemory(memory.id, 'eventAt', event.target.value)} />
                <button className={styles.iconButton} type="button" title="Remove event" onClick={() => removeMemory(memory.id)}>
                  <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
              </div>
              <CommandField label="Internal title" required value={memory.title} onChange={(value) => updateMemory(memory.id, 'title', value)} />
              <label className={styles.commandField}>
                <span>Concise timeline summary</span>
                <textarea required rows={3} value={memory.summary} onChange={(event) => updateMemory(memory.id, 'summary', event.target.value)} />
              </label>
              <label className={styles.commandField}>
                <span>Deeper internal research (optional)</span>
                <textarea rows={4} value={memory.body} onChange={(event) => updateMemory(memory.id, 'body', event.target.value)} />
              </label>
              <div className={styles.commandGrid}>
                <CommandField label="Source label (optional)" value={memory.sourceLabel} onChange={(value) => updateMemory(memory.id, 'sourceLabel', value)} />
                <CommandField label="Source URL (optional)" type="url" value={memory.sourceUrl} onChange={(value) => updateMemory(memory.id, 'sourceUrl', value)} />
              </div>
            </fieldset>
          ))}

          {error ? <div className={styles.loginError}>{error}</div> : null}

          {preview ? (
            <section className={styles.commandPreview}>
              <div className={styles.previewHeadline}>
                <span>{preview.entity.action}</span>
                <strong>{preview.entity.name}</strong>
                <small>{preview.entity.slug}</small>
              </div>
              <p>
                {preview.entity.changes.length ? `Entity changes: ${preview.entity.changes.join(', ')}.` : 'No Entity fields will change.'}
                {' '}{preview.memories.filter((memory) => memory.action === 'create').length} memories will be added;
                {' '}{preview.memories.filter((memory) => memory.action === 'skip_duplicate').length} duplicates will be skipped.
              </p>
              {preview.warnings.map((warning) => <div className={styles.previewWarning} key={warning}>{warning}</div>)}
            </section>
          ) : null}

          <footer className={styles.commandActions}>
            <button className={styles.textButton} type="button" disabled={isApplying} onClick={onClose}>Cancel</button>
            <button className={styles.previewButton} type="submit" disabled={!name.trim() || !type.trim() || isPreviewing || isApplying}>
              {isPreviewing ? 'Previewing...' : preview ? 'Refresh preview' : 'Preview command'}
            </button>
            <button className={styles.applyButton} type="button" disabled={!preview || isApplying || isPreviewing} onClick={() => void applyPreview()}>
              {isApplying ? 'Applying...' : 'Apply command'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function CommandField({ label, value, onChange, required = false, type = 'text' }: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
}) {
  return (
    <label className={styles.commandField}>
      <span>{label}</span>
      <input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function newMemory(): DraftMemory {
  return {
    id: createRequestId(),
    memoryType: 'timeline_event',
    title: '',
    summary: '',
    body: '',
    eventAt: new Date().toISOString().slice(0, 10),
    sourceLabel: '',
    sourceUrl: '',
  }
}

function createRequestId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `manual-${id}`
}

async function readableError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null
  return body?.error ?? `Request failed with ${res.status}`
}
