import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_NEWS_SOURCES,
  activeNewsSourceUrls,
  activeNewsSources,
  findNewsSource,
  newsSources,
} from '../config'

test('DEFAULT_NEWS_SOURCES contains the five approved sources in deterministic order', () => {
  assert.deepEqual(DEFAULT_NEWS_SOURCES.map((source) => ({
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    status: source.status,
    urls: source.urls.map((url) => ({
      urlId: url.urlId,
      url: url.url,
      status: url.status,
    })),
  })), [
    {
      sourceId: 'coindesk',
      sourceName: 'CoinDesk',
      status: 'active',
      urls: [{
        urlId: 'latest_crypto_news',
        url: 'https://www.coindesk.com/latest-crypto-news',
        status: 'active',
      }],
    },
    {
      sourceId: 'theblock',
      sourceName: 'The Block',
      status: 'active',
      urls: [{ urlId: 'news', url: 'https://www.theblock.co/news', status: 'active' }],
    },
    {
      sourceId: 'decrypt',
      sourceName: 'Decrypt',
      status: 'active',
      urls: [{
        urlId: 'editors_picks',
        url: 'https://decrypt.co/news/editors-picks',
        status: 'active',
      }],
    },
    {
      sourceId: 'unchained',
      sourceName: 'Unchained',
      status: 'active',
      urls: [{ urlId: 'news', url: 'https://unchainedcrypto.com/news/', status: 'active' }],
    },
    {
      sourceId: 'thedefiant',
      sourceName: 'The Defiant',
      status: 'active',
      urls: [{ urlId: 'homepage', url: 'https://thedefiant.io/', status: 'active' }],
    },
  ])
})

test('newsSources returns a fresh copy of the static config', () => {
  const sources = newsSources()

  assert.equal(sources.length, 5)
  assert.equal(sources[0].sourceId, 'coindesk')
  assert.equal(sources[0].sourceName, 'CoinDesk')
  assert.equal(sources[0].sourceType, 'curated_news')
  assert.equal(sources[0].status, 'active')
  assert.notEqual(sources, DEFAULT_NEWS_SOURCES)
  assert.notEqual(sources[0], DEFAULT_NEWS_SOURCES[0])
  assert.notEqual(sources[0].urls, DEFAULT_NEWS_SOURCES[0].urls)
  assert.notEqual(
    sources[2].urls[0].discoveryInstructions,
    DEFAULT_NEWS_SOURCES[2].urls[0].discoveryInstructions
  )

  sources[0].sourceName = 'Mutated Source'
  sources[0].urls[0].url = 'https://example.com/mutated'

  assert.equal(DEFAULT_NEWS_SOURCES[0].sourceName, 'CoinDesk')
  assert.equal(DEFAULT_NEWS_SOURCES[0].urls[0].url, 'https://www.coindesk.com/latest-crypto-news')
})

test('newsSources returns a URL array for the default source', () => {
  const sources = newsSources()
  const [url] = sources[0].urls

  assert.equal(sources[0].urls.length, 1)
  assert.equal(url.urlId, 'latest_crypto_news')
  assert.equal(url.label, 'Latest Crypto News')
  assert.equal(url.url, 'https://www.coindesk.com/latest-crypto-news')
  assert.equal(url.status, 'active')
})

test('findNewsSource returns the configured source by source id', () => {
  const sources = newsSources()

  assert.equal(findNewsSource(sources, 'coindesk'), sources[0])
  assert.equal(findNewsSource(sources, 'thedefiant'), sources[4])
  assert.equal(findNewsSource(sources, 'missing'), null)
})

test('activeNewsSources excludes paused sources', () => {
  const sources = [{
    ...DEFAULT_NEWS_SOURCES[0],
    status: 'paused' as const,
  }]

  assert.equal(sources[0].status, 'paused')
  assert.deepEqual(activeNewsSources(sources), [])
})

test('activeNewsSources uses the static config by default', () => {
  assert.deepEqual(activeNewsSources(), newsSources())
})

test('activeNewsSourceUrls excludes paused URLs', () => {
  assert.deepEqual(activeNewsSourceUrls({
    ...DEFAULT_NEWS_SOURCES[0],
    urls: [
      DEFAULT_NEWS_SOURCES[0].urls[0],
      {
        urlId: 'paused_url',
        label: 'Paused URL',
        url: 'https://www.coindesk.com/paused',
        status: 'paused',
      },
    ],
  }), [DEFAULT_NEWS_SOURCES[0].urls[0]])
})

test('only noisy source pages carry URL-scoped discovery instructions', () => {
  const instructionsBySource = new Map(newsSources().map((source) => [
    source.sourceId,
    source.urls[0].discoveryInstructions,
  ]))

  assert.equal(instructionsBySource.get('coindesk'), undefined)
  assert.equal(instructionsBySource.get('theblock'), undefined)
  assert.equal(instructionsBySource.get('unchained'), undefined)
  assert.deepEqual(instructionsBySource.get('decrypt'), [
    "Inspect only the article list under the Editors' Picks heading.",
    'Ignore the coin-price ticker, navigation, and footer links.',
    'Do not infer recency; preserve only dates or relative times visible on an article card.',
  ])
  assert.deepEqual(instructionsBySource.get('thedefiant'), [
    'Return only article cards under the Latest heading and stop before Featured Stories.',
    'Exclude press releases, sponsored content, premium content, and navigation links.',
    'If a card has no visible summary or absolute publication date, omit that optional field rather than inventing it.',
    'Return The Defiant article links with the https:// scheme used by the configured source URL, never http://.',
  ])
})

test('Jina reader fallback is explicitly scoped to the three Cloudflare-blocked public pages', () => {
  const fallbackBySource = new Map(newsSources().map((source) => [
    source.sourceId,
    source.urls[0].readerFallbackUrl,
  ]))

  assert.equal(fallbackBySource.get('coindesk'), undefined)
  assert.equal(fallbackBySource.get('unchained'), undefined)
  assert.equal(
    fallbackBySource.get('theblock'),
    'https://r.jina.ai/https://www.theblock.co/news'
  )
  assert.equal(
    fallbackBySource.get('decrypt'),
    'https://r.jina.ai/https://decrypt.co/news/editors-picks'
  )
  assert.equal(
    fallbackBySource.get('thedefiant'),
    'https://r.jina.ai/https://thedefiant.io/'
  )
})
