import { describe, it, expect, beforeAll } from 'vitest'
import 'dotenv/config'
import { createPublisherSupabaseTools, createSupabaseTools } from '../publisher-tools/supabase.tools.js'

const SKIP = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(SKIP)('get_tag_history (integration)', () => {
  let getTagHistory: (args: { tags: string[]; limit?: number }) => Promise<unknown>

  beforeAll(() => {
    const tools = createPublisherSupabaseTools(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const tool = tools.find((t) => t.name === 'get_tag_history')
    if (!tool) throw new Error('get_tag_history tool not found')
    getTagHistory = tool.execute as typeof getTagHistory
  })

  it('returns an array for tags ["crypto"]', async () => {
    const result = await getTagHistory({ tags: ['crypto'] })
    expect(Array.isArray(result)).toBe(true)
  })

  it('each item has required fields', async () => {
    const result = (await getTagHistory({ tags: ['crypto'] })) as Array<Record<string, unknown>>
    for (const item of result) {
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('content_small')
      expect(item).toHaveProperty('reasoning')
      expect(item).toHaveProperty('tags')
      expect(item).toHaveProperty('content_type')
      expect(item).toHaveProperty('created_at')
    }
  })

  it('reasoning is null or a string <= 300 chars', async () => {
    const result = (await getTagHistory({ tags: ['crypto'] })) as Array<Record<string, unknown>>
    for (const item of result) {
      const r = item.reasoning
      if (r !== null && r !== undefined) {
        expect(typeof r).toBe('string')
        expect((r as string).length).toBeLessThanOrEqual(300)
      }
    }
  })

  it('result length is <= 15', async () => {
    const result = (await getTagHistory({ tags: ['crypto'] })) as unknown[]
    expect(result.length).toBeLessThanOrEqual(15)
  })
})

describe.skipIf(SKIP)('search_published (integration)', () => {
  let searchPublished: (args: { query: string }) => Promise<unknown>

  beforeAll(() => {
    const tools = createSupabaseTools({
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    })
    const tool = tools.find((t) => t.name === 'search_published')
    if (!tool) throw new Error('search_published tool not found')
    searchPublished = tool.execute as typeof searchPublished
  })

  it('returns an array for query "bitcoin"', async () => {
    const result = await searchPublished({ query: 'bitcoin' })
    expect(Array.isArray(result)).toBe(true)
  })

  it('each item has required fields', async () => {
    const result = (await searchPublished({ query: 'bitcoin' })) as Array<Record<string, unknown>>
    for (const item of result) {
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('content_small')
      expect(item).toHaveProperty('content_full')
      expect(item).toHaveProperty('reasoning')
      expect(item).toHaveProperty('tags')
      expect(item).toHaveProperty('created_at')
    }
  })

  it('content_full is null/undefined or <= 600 chars', async () => {
    const result = (await searchPublished({ query: 'bitcoin' })) as Array<Record<string, unknown>>
    for (const item of result) {
      const cf = item.content_full
      if (cf !== null && cf !== undefined) {
        expect(typeof cf).toBe('string')
        expect((cf as string).length).toBeLessThanOrEqual(600)
      }
    }
  })

  it('reasoning is null/undefined or <= 300 chars', async () => {
    const result = (await searchPublished({ query: 'bitcoin' })) as Array<Record<string, unknown>>
    for (const item of result) {
      const r = item.reasoning
      if (r !== null && r !== undefined) {
        expect(typeof r).toBe('string')
        expect((r as string).length).toBeLessThanOrEqual(300)
      }
    }
  })
})
