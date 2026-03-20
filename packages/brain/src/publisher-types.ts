// Shared types for publisher + critic pipeline

export type ContentType = 'fomo' | 'signal' | 'news'

export interface NarrativeAction {
  type: 'predict' | 'perps'
  slug?: string   // predict: polymarket slug
  asset?: string  // perps: base asset e.g. "BTC"
}

export interface PublishedOutput {
  content_small: string
  content_full: string
  reasoning: string
  tags: string[]
  priority: number
  publisher_score: number
  actions: NarrativeAction[]
  content_type: ContentType
}

export interface CriticOutput {
  verdict: 'approve' | 'revise' | 'reject'
  issues: string[]
  reasoning: string | null
}

export interface Narrative {
  id: string
  cluster: string
  observation: string
  score: number
  signal_count: number
  key_signals: string[]
  slugs: string[]
  status: string
  created_at: string
}

export interface PublishedNarrative {
  id: string
  content_small: string
  content_full: string
  tags: string[]
  content_type: ContentType
  actions: NarrativeAction[]
}
