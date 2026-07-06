import type { NewsSourceConfig, NewsSourceUrlConfig } from './types'

export const DEFAULT_NEWS_SOURCES: NewsSourceConfig[] = [{
  sourceId: 'coindesk',
  sourceName: 'CoinDesk',
  sourceType: 'curated_news',
  status: 'active',
  urls: [{
    urlId: 'latest_crypto_news',
    label: 'Latest Crypto News',
    url: 'https://www.coindesk.com/latest-crypto-news',
    status: 'active',
  }],
}]

function cloneSource(source: NewsSourceConfig): NewsSourceConfig {
  return {
    ...source,
    urls: source.urls.map((url) => ({ ...url })),
  }
}

export function newsSources(): NewsSourceConfig[] {
  return DEFAULT_NEWS_SOURCES.map(cloneSource)
}

export function activeNewsSources(sources: NewsSourceConfig[] = newsSources()): NewsSourceConfig[] {
  return sources.filter((source) => source.status === 'active')
}

export function activeNewsSourceUrls(source: NewsSourceConfig): NewsSourceUrlConfig[] {
  return source.urls.filter((url) => url.status === 'active')
}

export function findNewsSource(
  sources: NewsSourceConfig[],
  sourceId: string
): NewsSourceConfig | null {
  return sources.find((source) => source.sourceId === sourceId) ?? null
}
