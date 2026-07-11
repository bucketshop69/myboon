import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_NEWS_SOURCES, findNewsSource, newsSources } from '../config'
import {
  buildScoutPrompt,
  buildScoutRequest,
  parseScoutResponse,
} from '../scout-contract'
import type { NewsScoutResponse } from '../types'

const source = DEFAULT_NEWS_SOURCES[0]
const sourceUrl = source.urls[0]
const now = new Date('2026-07-04T12:00:00.000Z')
const request = buildScoutRequest(source, sourceUrl, now)
const expected = {
  jobId: request.job_id,
  sourceId: source.sourceId,
  urlId: sourceUrl.urlId,
}

function validResponse(overrides: Partial<NewsScoutResponse> = {}): NewsScoutResponse {
  return {
    schema_version: 'myboon.hermes.scout_response.v1',
    job_id: request.job_id,
    source_id: source.sourceId,
    url_id: sourceUrl.urlId,
    status: 'success',
    source_observed: {
      url: sourceUrl.url,
      observed_at: now.toISOString(),
      access_method: 'browser',
      access_status: 'ok',
    },
    candidates: [{
      headline: 'CoinDesk headline',
      article_url: 'https://www.coindesk.com/example',
      summary: 'Observed summary',
      author: 'CoinDesk Staff',
      section: 'Markets',
      evidence: ['visible article card'],
    }],
    errors: [],
    ...overrides,
  }
}

test('buildScoutRequest uses the configured source and URL IDs', () => {
  assert.equal(request.schema_version, 'myboon.hermes.scout_request.v1')
  assert.equal(request.job_id, 'news_scout_coindesk_latest_crypto_news_1783166400000')
  assert.equal(request.source.source_id, 'coindesk')
  assert.equal(request.source.name, 'CoinDesk')
  assert.equal(request.source_url.url_id, 'latest_crypto_news')
  assert.equal(request.source_url.url, 'https://www.coindesk.com/latest-crypto-news')
  assert.equal(request.response_rules.return_json_only, true)
})

test('buildScoutPrompt includes JSON-only rules and the full request JSON', () => {
  const prompt = buildScoutPrompt(request)

  assert.match(prompt, /Return JSON only/)
  assert.match(prompt, /Do not publish/)
  assert.match(prompt, /Do not score, rank, judge, or editorially filter candidates within the requested discovery scope/)
  assert.match(prompt, /ignore ads, navigation, newsletters, and external promotions/)
  assert.match(prompt, /Only if direct access is blocked and source_url\.reader_fallback_url is present/)
  assert.match(prompt, /Never construct a reader fallback when none is configured/)
  assert.match(prompt, /return status "failed", candidates \[\], and errors as an array of strings/)
  assert.match(prompt, /when source_url\.url is HTTPS, return HTTPS article URLs/)
  assert.match(prompt, /hrefs containing literal "\.\.\." or "…"/)
  assert.match(prompt, /Request JSON:/)
  assert.match(prompt, /Return schema:/)
  assert.match(prompt, /"schema_version": "myboon\.hermes\.scout_request\.v1"/)
  assert.match(prompt, /"source_id": "coindesk"/)
  assert.match(prompt, /"url_id": "latest_crypto_news"/)
  assert.doesNotMatch(prompt, /relevance_score|max_candidates|min_relevance_score|"score"/)
})

test('buildScoutRequest includes guidance only for its configured source URL', () => {
  const decrypt = findNewsSource(newsSources(), 'decrypt')!
  const decryptRequest = buildScoutRequest(decrypt, decrypt.urls[0], now)
  const decryptPrompt = buildScoutPrompt(decryptRequest)

  assert.deepEqual(
    decryptRequest.source_url.discovery_instructions,
    decrypt.urls[0].discoveryInstructions
  )
  assert.equal(
    decryptRequest.source_url.reader_fallback_url,
    'https://r.jina.ai/https://decrypt.co/news/editors-picks'
  )
  assert.match(decryptPrompt, /Inspect only the article list under the Editors' Picks heading/)
  assert.match(decryptPrompt, /follow any discovery_instructions/i)
  assert.equal(request.source_url.discovery_instructions, undefined)
  assert.equal(request.source_url.reader_fallback_url, undefined)
})

test('parseScoutResponse returns a valid response', () => {
  const parsed = parseScoutResponse(JSON.stringify(validResponse()), expected)

  assert.equal(parsed.job_id, request.job_id)
  assert.equal(parsed.source_id, 'coindesk')
  assert.equal(parsed.url_id, 'latest_crypto_news')
  assert.equal(parsed.candidates[0].headline, 'CoinDesk headline')
})

test('parseScoutResponse extracts a valid JSON response from wrapped stdout', () => {
  const parsed = parseScoutResponse([
    'I inspected the page and found the following response:',
    '```json',
    JSON.stringify(validResponse()),
    '```',
    'Done.',
  ].join('\n'), expected)

  assert.equal(parsed.job_id, request.job_id)
  assert.equal(parsed.candidates[0].article_url, 'https://www.coindesk.com/example')
})

test('parseScoutResponse rejects stdout with no JSON object', () => {
  assert.throws(
    () => parseScoutResponse('not json', expected),
    /did not contain a JSON object/
  )
})

test('parseScoutResponse rejects an invalid JSON object', () => {
  assert.throws(
    () => parseScoutResponse('before { not json } after', expected),
    /valid JSON object/
  )
})

test('parseScoutResponse rejects wrong schema version', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify({
      ...validResponse(),
      schema_version: 'wrong',
    }), expected),
    /schema_version/
  )
})

test('parseScoutResponse rejects wrong job ID', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify({
      ...validResponse(),
      job_id: 'wrong-job',
    }), expected),
    /job_id/
  )
})

test('parseScoutResponse rejects wrong source ID', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify({
      ...validResponse(),
      source_id: 'wrong-source',
    }), expected),
    /source_id/
  )
})

test('parseScoutResponse rejects wrong URL ID', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify({
      ...validResponse(),
      url_id: 'wrong-url',
    }), expected),
    /url_id/
  )
})

test('parseScoutResponse rejects missing source observation', () => {
  const response = validResponse() as unknown as Record<string, unknown>
  delete response.source_observed

  assert.throws(
    () => parseScoutResponse(JSON.stringify(response), expected),
    /source_observed/
  )
})

test('parseScoutResponse rejects non-array candidates', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify({
      ...validResponse(),
      candidates: {},
    }), expected),
    /candidates/
  )
})

test('parseScoutResponse rejects candidates missing headline', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify({
      ...validResponse(),
      candidates: [{ article_url: 'https://www.coindesk.com/example' }],
    }), expected),
    /headline/
  )
})

test('parseScoutResponse rejects candidates missing article_url', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify({
      ...validResponse(),
      candidates: [{ headline: 'Missing URL' }],
    }), expected),
    /article_url/
  )
})

test('parseScoutResponse rejects non-string evidence arrays', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify({
      ...validResponse(),
      candidates: [{
        headline: 'CoinDesk headline',
        article_url: 'https://www.coindesk.com/example',
        evidence: ['ok', 1],
      }],
    }), expected),
    /evidence/
  )
})

test('parseScoutResponse accepts the strict failed-access response shape', () => {
  const parsed = parseScoutResponse(JSON.stringify(validResponse({
    status: 'failed',
    candidates: [],
    errors: ['Cloudflare blocked every allowed access method.'],
  })), expected)

  assert.equal(parsed.status, 'failed')
  assert.deepEqual(parsed.candidates, [])
  assert.deepEqual(parsed.errors, ['Cloudflare blocked every allowed access method.'])
})

test('parseScoutResponse rejects failed responses containing candidates', () => {
  assert.throws(
    () => parseScoutResponse(JSON.stringify(validResponse({ status: 'failed' })), expected),
    /failed status must not contain candidates/
  )
})
