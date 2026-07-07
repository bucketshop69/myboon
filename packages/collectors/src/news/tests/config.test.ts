import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_NEWS_SOURCES,
  activeNewsSourceUrls,
  activeNewsSources,
  findNewsSource,
  newsSources,
} from '../config'

test('DEFAULT_NEWS_SOURCES contains the default CoinDesk source', () => {
  assert.equal(DEFAULT_NEWS_SOURCES.length, 1)
  assert.deepEqual(DEFAULT_NEWS_SOURCES[0], {
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
  })
})

test('newsSources returns a fresh copy of the static config', () => {
  const sources = newsSources()

  assert.equal(sources.length, 1)
  assert.equal(sources[0].sourceId, 'coindesk')
  assert.equal(sources[0].sourceName, 'CoinDesk')
  assert.equal(sources[0].sourceType, 'curated_news')
  assert.equal(sources[0].status, 'active')
  assert.notEqual(sources, DEFAULT_NEWS_SOURCES)
  assert.notEqual(sources[0], DEFAULT_NEWS_SOURCES[0])
  assert.notEqual(sources[0].urls, DEFAULT_NEWS_SOURCES[0].urls)

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
