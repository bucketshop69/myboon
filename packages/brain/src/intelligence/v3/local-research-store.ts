import { appendFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import type { ResearchSourceBundle } from './research-source-tools.js'
import type {
  EntityResearchBook,
  HyperliquidEntityResearchResult,
} from './hyperliquid-entity-research.js'

export interface LocalResearchPacketRecord {
  kind: 'v3.local-research-packet'
  schemaVersion: 1
  generatedAt: string
  inputPath?: string
  source: HyperliquidEntityResearchResult['source']
  packet: HyperliquidEntityResearchResult['packets'][number]['packet']
  decision: HyperliquidEntityResearchResult['packets'][number]['decision']
  entityBookNote: HyperliquidEntityResearchResult['packets'][number]['entityBookNote']
  sourceResearch?: ResearchSourceBundle
}

export interface LocalResearchBookRecord {
  kind: 'v3.entity-research-book'
  schemaVersion: 1
  generatedAt: string
  book: EntityResearchBook
}

export interface WriteLocalEntityResearchOptions {
  rootDir: string
  inputPath?: string
  sourceResearchByLeadId?: Map<string, ResearchSourceBundle>
}

export interface WriteLocalEntityResearchResult {
  rootDir: string
  packetPaths: string[]
  entityBookPaths: string[]
  entityNotePaths: string[]
  runPath: string
  packetCount: number
  entityBookCount: number
  appendedNoteCount: number
  skippedDuplicateNoteCount: number
}

function safePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
}

function entityKey(book: EntityResearchBook): string {
  return `${book.entity.type}:${book.entity.id}`.toLowerCase()
}

function entityFilePart(book: EntityResearchBook): string {
  return `${safePart(book.entity.type)}-${safePart(book.entity.id)}`
}

function datePart(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'unknown-date' : date.toISOString().slice(0, 10)
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, path)
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

function readBookRecord(value: unknown): EntityResearchBook | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<LocalResearchBookRecord> & Partial<EntityResearchBook>
  if (record.kind === 'v3.entity-research-book' && record.book) return record.book
  if (record.entity && Array.isArray(record.notes)) return record as EntityResearchBook
  return null
}

export function defaultLocalResearchRoot(): string {
  return resolve(process.env.V3_LOCAL_DATA_DIR ?? join(process.cwd(), 'local-research', 'v3'))
}

export async function loadLocalEntityBooks(rootDir = defaultLocalResearchRoot()): Promise<EntityResearchBook[]> {
  const dir = join(rootDir, 'entity-books')
  let files: string[] = []
  try {
    files = await readdir(dir)
  } catch {
    return []
  }

  const books: EntityResearchBook[] = []
  for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
    try {
      const book = readBookRecord(await readJson(join(dir, file)))
      if (book) books.push(book)
    } catch {
      // Ignore malformed local books so one bad file does not stop the researcher.
    }
  }
  return books
}

export async function writeLocalEntityResearchResult(
  result: HyperliquidEntityResearchResult,
  options: WriteLocalEntityResearchOptions
): Promise<WriteLocalEntityResearchResult> {
  const rootDir = resolve(options.rootDir)
  const existingBooks = await loadLocalEntityBooks(rootDir)
  const existingNoteIds = new Set(existingBooks.flatMap((book) => book.notes.map((note) => note.id)))
  const packetPaths: string[] = []
  const entityBookPaths: string[] = []
  const entityNotePaths = new Set<string>()
  let appendedNoteCount = 0
  let skippedDuplicateNoteCount = 0

  for (const item of result.packets) {
    const record: LocalResearchPacketRecord = {
      kind: 'v3.local-research-packet',
      schemaVersion: 1,
      generatedAt: result.generatedAt,
      ...(options.inputPath ? { inputPath: options.inputPath } : {}),
      source: result.source,
      packet: item.packet,
      decision: item.decision,
      entityBookNote: item.entityBookNote,
      sourceResearch: options.sourceResearchByLeadId?.get(item.entityBookNote.leadId),
    }
    const packetPath = join(
      rootDir,
      'research-packets',
      datePart(item.packet.createdAt),
      `${safePart(item.packet.id)}.json`
    )
    await writeJsonAtomic(packetPath, record)
    packetPaths.push(packetPath)
  }

  for (const book of result.entityBooks) {
    const bookPath = join(rootDir, 'entity-books', `${entityFilePart(book)}.json`)
    await writeJsonAtomic(bookPath, {
      kind: 'v3.entity-research-book',
      schemaVersion: 1,
      generatedAt: result.generatedAt,
      book,
    } satisfies LocalResearchBookRecord)
    entityBookPaths.push(bookPath)

    const notePath = join(rootDir, 'entity-notes', `${entityFilePart(book)}.jsonl`)
    for (const note of book.notes) {
      if (existingNoteIds.has(note.id)) {
        skippedDuplicateNoteCount += 1
        continue
      }
      await mkdir(dirname(notePath), { recursive: true })
      await appendFile(notePath, `${JSON.stringify(note)}\n`, 'utf8')
      existingNoteIds.add(note.id)
      entityNotePaths.add(notePath)
      appendedNoteCount += 1
    }
  }

  const runPath = join(rootDir, 'runs', `${safePart(result.source)}-${safePart(result.generatedAt)}.json`)
  await writeJsonAtomic(runPath, {
    kind: 'v3.local-research-run',
    schemaVersion: 1,
    generatedAt: result.generatedAt,
    inputPath: options.inputPath ?? null,
    source: result.source,
    packetCount: result.packets.length,
    entityBookCount: result.entityBooks.length,
    packetPaths,
    entityBookPaths,
    entityNotePaths: [...entityNotePaths],
    appendedNoteCount,
    skippedDuplicateNoteCount,
  })

  return {
    rootDir,
    packetPaths,
    entityBookPaths,
    entityNotePaths: [...entityNotePaths],
    runPath,
    packetCount: result.packets.length,
    entityBookCount: result.entityBooks.length,
    appendedNoteCount,
    skippedDuplicateNoteCount,
  }
}

export function localCollectionLeadDirs(rootDir = defaultLocalResearchRoot()): {
  pendingDir: string
  processedDir: string
  failedDir: string
} {
  const collectionLeadsDir = join(resolve(rootDir), 'collection-leads')
  return {
    pendingDir: join(collectionLeadsDir, 'pending'),
    processedDir: join(collectionLeadsDir, 'processed'),
    failedDir: join(collectionLeadsDir, 'failed'),
  }
}
