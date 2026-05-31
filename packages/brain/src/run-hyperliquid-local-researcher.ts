import { mkdir, readdir, readFile, rename, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import type {
  HyperliquidResearchLead,
  HyperliquidResearchLeadArtifact,
} from '@myboon/collectors/hyperliquid/research-leads'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import {
  buildHyperliquidEntityResearch,
  summarizeEntityResearch,
} from './intelligence/v3/hyperliquid-entity-research.js'
import {
  defaultLocalResearchRoot,
  loadLocalEntityBooks,
  localCollectionLeadDirs,
  writeLocalEntityResearchResult,
} from './intelligence/v3/local-research-store.js'
import {
  runResearchSourceSearch,
  type ResearchSearchProvider,
} from './intelligence/v3/research-source-tools.js'

interface HyperliquidEntityResearchShadowArtifact {
  kind: 'hyperliquid.entity-research-shadow'
  generatedAt: string
  collectionLeads: HyperliquidResearchLead[]
}

interface LeadBatch {
  generatedAt: string
  leads: HyperliquidResearchLead[]
}

const localDataDir = defaultLocalResearchRoot()
const inputPath = process.env.HYPERLIQUID_LOCAL_RESEARCH_INPUT
const maxPackets = Number(process.env.HYPERLIQUID_LOCAL_RESEARCH_MAX_PACKETS ?? 25)
const includeWatch = process.env.HYPERLIQUID_LOCAL_RESEARCH_INCLUDE_WATCH !== '0'
const archiveInput = process.env.V3_LOCAL_RESEARCH_ARCHIVE_INPUT
const searchProvider = parseSearchProvider(process.env.V3_RESEARCH_SEARCH_PROVIDER)
const searxngUrl = process.env.V3_RESEARCH_SEARXNG_URL

function parseSearchProvider(raw?: string): ResearchSearchProvider {
  if (!raw || raw === '0' || raw.toLowerCase() === 'disabled') return 'disabled'
  if (raw.toLowerCase() === 'searxng') return 'searxng'
  throw new Error(`Unsupported V3_RESEARCH_SEARCH_PROVIDER "${raw}". Use "disabled" or "searxng".`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function extractLeadBatch(value: unknown): LeadBatch {
  if (!isObject(value)) throw new Error('Lead batch must be an object')

  if (value.kind === 'hyperliquid.research-leads') {
    const artifact = value as Partial<HyperliquidResearchLeadArtifact>
    if (!Array.isArray(artifact.leads)) throw new Error('hyperliquid.research-leads artifact is missing leads[]')
    return {
      generatedAt: typeof artifact.generatedAt === 'string' ? artifact.generatedAt : new Date().toISOString(),
      leads: artifact.leads,
    }
  }

  if (value.kind === 'hyperliquid.entity-research-shadow') {
    const artifact = value as Partial<HyperliquidEntityResearchShadowArtifact>
    if (!Array.isArray(artifact.collectionLeads)) {
      throw new Error('hyperliquid.entity-research-shadow artifact is missing collectionLeads[]')
    }
    return {
      generatedAt: typeof artifact.generatedAt === 'string' ? artifact.generatedAt : new Date().toISOString(),
      leads: artifact.collectionLeads,
    }
  }

  if (Array.isArray(value.leads)) {
    return {
      generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : new Date().toISOString(),
      leads: value.leads as HyperliquidResearchLead[],
    }
  }

  throw new Error(`Unsupported lead batch kind "${String(value.kind ?? 'unknown')}"`)
}

async function readLeadBatch(path: string): Promise<LeadBatch> {
  return extractLeadBatch(JSON.parse(await readFile(path, 'utf8')) as unknown)
}

function isInsideDir(file: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(file))
  return Boolean(rel && !rel.startsWith('..') && !isAbsolute(rel))
}

async function listJsonFiles(path: string): Promise<string[]> {
  const info = await stat(path)
  if (info.isFile()) return [resolve(path)]
  if (!info.isDirectory()) return []

  const files = await readdir(path)
  return files
    .filter((file) => file.endsWith('.json') && !file.endsWith('.tmp'))
    .sort()
    .map((file) => resolve(path, file))
}

async function resolveInputFiles(): Promise<{ files: string[], pendingDir: string, processedDir: string, failedDir: string }> {
  const dirs = localCollectionLeadDirs(localDataDir)
  if (inputPath) {
    return {
      ...dirs,
      files: await listJsonFiles(resolve(inputPath)),
    }
  }

  await mkdir(dirs.pendingDir, { recursive: true })
  return {
    ...dirs,
    files: await listJsonFiles(dirs.pendingDir),
  }
}

function shouldArchiveInput(file: string, pendingDir: string): boolean {
  if (archiveInput === '1') return true
  if (archiveInput === '0') return false
  return isInsideDir(file, pendingDir)
}

async function moveInputFile(file: string, targetDir: string): Promise<string> {
  await mkdir(targetDir, { recursive: true })
  const target = join(targetDir, basename(file))
  await rename(file, target)
  return target
}

function selectedLeadsForResearch(
  leads: HyperliquidResearchLead[],
  selectedLeadIds: Set<string>
): HyperliquidResearchLead[] {
  return leads.filter((lead) => selectedLeadIds.has(lead.id))
}

async function processInputFile(file: string): Promise<Record<string, unknown>> {
  const batch = await readLeadBatch(file)
  const existingBooks = await loadLocalEntityBooks(localDataDir)
  const now = new Date().toISOString()
  const entityResearch = buildHyperliquidEntityResearch(batch.leads, {
    now,
    includeWatch,
    maxPackets,
    existingBooks,
    skipExistingNotes: true,
  })
  const selectedLeadIds = new Set(entityResearch.packets.map((item) => item.entityBookNote.leadId))
  const selectedLeads = selectedLeadsForResearch(batch.leads, selectedLeadIds)
  const sourceResearchByLeadId = await runResearchSourceSearch(selectedLeads, {
    provider: searchProvider,
    searxngUrl,
    now,
  })
  const writeResult = await writeLocalEntityResearchResult(entityResearch, {
    rootDir: localDataDir,
    inputPath: file,
    sourceResearchByLeadId,
  })

  return {
    inputPath: file,
    batchGeneratedAt: batch.generatedAt,
    leadsRead: batch.leads.length,
    selectedLeads: selectedLeads.length,
    researchPacketSummary: summarizeEntityResearch(entityResearch),
    output: writeResult,
    sourceResearch: {
      provider: searchProvider,
      leadsSearched: selectedLeads.length,
      queryCount: [...sourceResearchByLeadId.values()].reduce((sum, bundle) => sum + bundle.queries.length, 0),
      resultCount: [...sourceResearchByLeadId.values()].reduce((sum, bundle) => sum + bundle.results.length, 0),
      errorCount: [...sourceResearchByLeadId.values()].reduce((sum, bundle) => sum + bundle.errors.length, 0),
    },
    topPackets: entityResearch.packets.slice(0, 6).map((item) => ({
      entity: item.packet.entities[0]?.canonicalName,
      lane: item.entityBookNote.lane,
      archetype: item.packet.archetype,
      decision: item.decision.decision,
      priority: item.decision.priority,
      headline: item.packet.headlineClaim,
      memoryUpdate: item.entityBookNote.memoryUpdate,
      generatedQueries: sourceResearchByLeadId.get(item.entityBookNote.leadId)?.queries.map((query) => query.query) ?? [],
      sourceResults: sourceResearchByLeadId.get(item.entityBookNote.leadId)?.results.slice(0, 3).map((result) => ({
        title: result.title,
        url: result.url,
      })) ?? [],
    })),
  }
}

async function main(): Promise<void> {
  const { files, pendingDir, processedDir, failedDir } = await resolveInputFiles()
  if (files.length === 0) {
    console.log(JSON.stringify({
      localDataDir,
      inputPath: inputPath ?? pendingDir,
      processed: 0,
      note: 'No pending Hyperliquid lead JSON files found.',
    }, null, 2))
    return
  }

  const processed: unknown[] = []
  const failed: unknown[] = []

  for (const file of files) {
    try {
      const result = await processInputFile(file)
      let archivedPath: string | null = null
      if (shouldArchiveInput(file, pendingDir)) {
        archivedPath = await moveInputFile(file, processedDir)
      }
      processed.push({ ...result, archivedPath })
    } catch (err) {
      let archivedPath: string | null = null
      if (shouldArchiveInput(file, pendingDir)) {
        archivedPath = await moveInputFile(file, failedDir)
      }
      failed.push({
        inputPath: file,
        archivedPath,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  console.log(JSON.stringify({
    localDataDir,
    inputPath: inputPath ?? pendingDir,
    processedCount: processed.length,
    failedCount: failed.length,
    processed,
    failed,
    note: 'Local researcher wrote packets/entity books only. Supabase and published_narratives were not touched.',
  }, null, 2))

  if (failed.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('[hyperliquid-local-researcher] Fatal error:', err)
  process.exit(1)
})
