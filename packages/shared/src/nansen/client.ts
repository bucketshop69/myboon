import { execSync } from 'child_process'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface NansenClientOptions {
  supabaseUrl: string
  supabaseKey: string
  nansenApiKey: string
}

interface NansenCacheRow {
  key: string
  data: unknown
  fetched_at: string
  ttl_hours: number
}

export class NansenClient {
  // Use `any` database generic so all table names are accepted without codegen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: SupabaseClient<any>
  private nansenApiKey: string

  constructor(opts: NansenClientOptions) {
    this.supabase = createClient(opts.supabaseUrl, opts.supabaseKey)
    this.nansenApiKey = opts.nansenApiKey
  }

  private async fromCache<T>(key: string): Promise<T | null> {
    const { data } = await this.supabase
      .from('nansen_cache')
      .select('data, fetched_at, ttl_hours')
      .eq('key', key)
      .single<NansenCacheRow>()

    if (!data) return null

    const ageHours = (Date.now() - new Date(data.fetched_at).getTime()) / 36e5
    if (ageHours > data.ttl_hours) return null

    return data.data as T
  }

  private async toCache(key: string, data: unknown, ttlHours: number): Promise<void> {
    await this.supabase.from('nansen_cache').upsert({
      key,
      data,
      fetched_at: new Date().toISOString(),
      ttl_hours: ttlHours,
    })
  }

  private exec(args: string): unknown {
    let raw: string
    try {
      raw = execSync(`nansen ${args} --format json`, {
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, NANSEN_API_KEY: this.nansenApiKey },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err: unknown) {
      const stderr = (err as { stderr?: string }).stderr ?? ''
      if (stderr.includes('credits') || stderr.includes('402')) {
        throw new Error('[nansen] Out of credits — skipping call')
      }
      if (stderr.includes('401') || stderr.includes('unauthorized') || stderr.includes('api key')) {
        throw new Error('[nansen] Invalid API key — check NANSEN_API_KEY in .env')
      }
      throw new Error(`[nansen] CLI error: ${stderr || String(err)}`)
    }
    const parsed = JSON.parse(raw) as { success: boolean; data: unknown }
    if (!parsed.success) throw new Error(`[nansen] API error: ${JSON.stringify(parsed)}`)
    return parsed.data
  }

  async marketScreener(query: string = ''): Promise<unknown> {
    const key = `pm:market-screener:${query}`
    const cached = await this.fromCache(key)
    if (cached) return cached

    const queryArg = query ? ` --query "${query}"` : ''
    const data = this.exec(`research prediction-market market-screener${queryArg}`)
    await this.toCache(key, data, 0.5) // 30min TTL
    return data
  }

  async eventScreener(query: string = ''): Promise<unknown> {
    const key = `pm:event-screener:${query}`
    const cached = await this.fromCache(key)
    if (cached) return cached

    const queryArg = query ? ` --query "${query}"` : ''
    const data = this.exec(`research prediction-market event-screener${queryArg}`)
    await this.toCache(key, data, 1) // 1h TTL
    return data
  }

  async bettorProfile(address: string): Promise<unknown> {
    const key = `pm:pnl:${address}`
    const cached = await this.fromCache(key)
    if (cached) return cached

    const data = this.exec(`research prediction-market pnl-by-address --address ${address}`)
    await this.toCache(key, data, 24) // 24h TTL
    return data
  }

  async marketDepth(marketId: string): Promise<unknown> {
    const key = `pm:depth:${marketId}`
    const cached = await this.fromCache(key)
    if (cached) return cached

    const holders = this.exec(`research prediction-market top-holders --market-id ${marketId}`)
    const orderbook = this.exec(`research prediction-market orderbook --market-id ${marketId}`)
    const data = { holders, orderbook }
    await this.toCache(key, data, 0.083) // 5min TTL
    return data
  }
}
