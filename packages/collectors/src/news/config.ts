import type { NewsSourceConfig, NewsSourceUrlConfig } from './types'

export const DEFAULT_NEWS_SOURCES: NewsSourceConfig[] = [
  {
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
  },
  {
    sourceId: 'theblock',
    sourceName: 'The Block',
    sourceType: 'curated_news',
    status: 'active',
    urls: [{
      urlId: 'news',
      label: 'News',
      url: 'https://www.theblock.co/news',
      status: 'active',
      readerFallbackUrl: 'https://r.jina.ai/https://www.theblock.co/news',
    }],
  },
  {
    sourceId: 'decrypt',
    sourceName: 'Decrypt',
    sourceType: 'curated_news',
    status: 'active',
    urls: [{
      urlId: 'editors_picks',
      label: "Editors' Picks",
      url: 'https://decrypt.co/news/editors-picks',
      status: 'active',
      readerFallbackUrl: 'https://r.jina.ai/https://decrypt.co/news/editors-picks',
      discoveryInstructions: [
        "Inspect only the article list under the Editors' Picks heading.",
        'Ignore the coin-price ticker, navigation, and footer links.',
        'Do not infer recency; preserve only dates or relative times visible on an article card.',
      ],
    }],
  },
  {
    sourceId: 'unchained',
    sourceName: 'Unchained',
    sourceType: 'curated_news',
    status: 'active',
    urls: [{
      urlId: 'news',
      label: 'News',
      url: 'https://unchainedcrypto.com/news/',
      status: 'active',
    }],
  },
  {
    sourceId: 'thedefiant',
    sourceName: 'The Defiant',
    sourceType: 'curated_news',
    status: 'active',
    urls: [{
      urlId: 'homepage',
      label: 'Homepage',
      url: 'https://thedefiant.io/',
      status: 'active',
      readerFallbackUrl: 'https://r.jina.ai/https://thedefiant.io/',
      discoveryInstructions: [
        'Return only article cards under the Latest heading and stop before Featured Stories.',
        'Exclude press releases, sponsored content, premium content, and navigation links.',
        'If a card has no visible summary or absolute publication date, omit that optional field rather than inventing it.',
        'Return The Defiant article links with the https:// scheme used by the configured source URL, never http://.',
      ],
    }],
  },
]

function cloneSource(source: NewsSourceConfig): NewsSourceConfig {
  return {
    ...source,
    urls: source.urls.map((url) => ({
      ...url,
      readerFallbackUrl: url.readerFallbackUrl,
      discoveryInstructions: url.discoveryInstructions
        ? [...url.discoveryInstructions]
        : undefined,
    })),
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
