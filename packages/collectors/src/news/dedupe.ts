import { fingerprintScoutCandidate } from './fingerprint'
import type {
  NewsCandidateDedupeDecision,
  NewsScoutCandidate,
  PriorNewsObservation,
} from './types'

export function classifyNewsCandidate(
  sourceId: string,
  urlId: string,
  candidate: NewsScoutCandidate,
  prior: PriorNewsObservation[]
): NewsCandidateDedupeDecision {
  if (typeof candidate.headline !== 'string' || !candidate.headline.trim()) {
    return {
      outcome: 'ignored_invalid_candidate',
      candidate,
      fingerprint: null,
      reason: 'candidate missing headline',
    }
  }
  if (typeof candidate.article_url !== 'string' || !candidate.article_url.trim()) {
    return {
      outcome: 'ignored_invalid_candidate',
      candidate,
      fingerprint: null,
      reason: 'candidate missing article_url',
    }
  }
  if (candidate.article_url.includes('...') || candidate.article_url.includes('…')) {
    return {
      outcome: 'ignored_invalid_candidate',
      candidate,
      fingerprint: null,
      reason: 'candidate article_url is truncated',
    }
  }

  let fingerprint
  try {
    fingerprint = fingerprintScoutCandidate(sourceId, urlId, candidate)
  } catch {
    return {
      outcome: 'ignored_invalid_candidate',
      candidate,
      fingerprint: null,
      reason: 'candidate article_url is malformed',
    }
  }

  const matchingPrior = prior.filter((observation) => (
    observation.sourceId === sourceId
    && observation.articleIdentityKey === fingerprint.articleIdentityKey
  ))

  if (matchingPrior.length === 0) {
    return {
      outcome: 'new_candidate',
      candidate,
      fingerprint,
      reason: 'no prior observation for article identity',
    }
  }

  if (matchingPrior.some((observation) => observation.observationDedupeKey === fingerprint.observationDedupeKey)) {
    return {
      outcome: 'known_unchanged',
      candidate,
      fingerprint,
      reason: 'prior observation has the same article identity and observation key',
    }
  }

  if (matchingPrior.some((observation) => (
    observation.headlineHash === fingerprint.headlineHash
    && observation.summaryHash === fingerprint.summaryHash
  ))) {
    return {
      outcome: 'known_unchanged',
      candidate,
      fingerprint,
      reason: 'prior observation has the same article identity and content hashes',
    }
  }

  return {
    outcome: 'known_materially_changed',
    candidate,
    fingerprint,
    reason: 'prior observation has the same article identity with different headline or summary hash',
  }
}
