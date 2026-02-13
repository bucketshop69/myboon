export type EntityType =
  | 'crypto-token'
  | 'macro-asset'
  | 'protocol'
  | 'person'
  | 'concept'
  | 'meme';

export type RepresentationType =
  | 'spot-token'
  | 'perp-contract'
  | 'lp-pair'
  | 'lending'
  | 'staking'
  | 'futures'
  | 'option';

export type EventType =
  | 'trade'
  | 'lp-activity'
  | 'perp-trade'
  | 'news'
  | 'social'
  | 'protocol-event'
  | 'price-movement'
  | 'volume-spike'
  | 'fee-spike'
  | 'whale-activity'
  | 'listing'
  | 'partnership'
  | 'research-completed';

export type ResearchSentiment = 'bullish' | 'bearish' | 'neutral' | 'unknown';

export interface EntityRelationship {
  type: 'listed-on' | 'integrated-with' | 'competes-with' | 'founder' | 'partner';
  targetEntityId: string;
  since?: number;
  metadata?: Record<string, unknown>;
}

export interface EntityMetadata {
  description?: string;
  category: string[];
  tags?: string[];
  socials?: {
    twitter?: string;
    discord?: string;
    telegram?: string;
    website?: string;
  };
  relationships?: EntityRelationship[];
  [key: string]: unknown;
}

export interface Entity {
  id: string;
  slug: string;
  name: string;
  symbol?: string;
  type: EntityType;
  verified: boolean;
  verifiedBy?: 'team' | 'community' | 'auto';
  metadata: EntityMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface Representation {
  id: string;
  entityId: string;
  type: RepresentationType;
  protocol: string;
  chain?: string;
  context: {
    mint?: string;
    market?: string;
    pair?: string;
    poolAddress?: string;
    metadata?: Record<string, unknown>;
  };
  active: boolean;
  discoveredAt: number;
  lastSeenAt: number;
}

export interface EntityEvent {
  id: string;
  entityId: string;
  relatedEntityIds?: string[];
  timestamp: number;
  type: EventType;
  summary: string;
  representationId?: string;
  data: Record<string, unknown>;
  source: {
    type: 'transaction' | 'news' | 'social' | 'protocol' | 'price' | 'manual';
    reference?: string;
    confidence?: number;
  };
  importance: number;
  createdAt: number;
}

export interface ResearchSource {
  tool: string;
  timestamp: number;
  dataFreshness?: number;
  success: boolean;
  error?: string;
}

export interface EntityResearch {
  id: string;
  entityId: string;
  timestamp: number;
  ttl: number;
  expiresAt: number;
  findings: {
    summary: string;
    sentiment?: ResearchSentiment;
    confidence: number;
    risks: string[];
    opportunities: string[];
    metadata: Record<string, unknown>;
  };
  sources: ResearchSource[];
  createdAt: number;
}

export interface ResearchResult {
  entityId: string;
  slug: string;
  symbol?: string;
  summary: string;
  sentiment: ResearchSentiment;
  confidence: number;
  riskScore: number;
  risks: string[];
  opportunities: string[];
  urgency: 'immediate' | 'high' | 'medium' | 'low';
  tradeable: boolean;
  dataCompleteness: number;
  sources: ResearchSource[];
  representations: Representation[];
  recentEvents: EntityEvent[];
  timestamp: number;
  expiresAt: number;
}

export interface CreateEntityInput {
  slug: string;
  name: string;
  symbol?: string;
  type: EntityType;
  verified?: boolean;
  verifiedBy?: 'team' | 'community' | 'auto';
  metadata?: Partial<EntityMetadata>;
}

export interface CreateRepresentationInput {
  entityId: string;
  type: RepresentationType;
  protocol: string;
  chain?: string;
  context: Representation['context'];
  active?: boolean;
}

export interface CreateEntityEventInput {
  entityId: string;
  relatedEntityIds?: string[];
  timestamp: number;
  type: EventType;
  summary: string;
  representationId?: string;
  data?: Record<string, unknown>;
  source: EntityEvent['source'];
  importance?: number;
}

export interface CreateEntityResearchInput {
  entityId: string;
  findings: EntityResearch['findings'];
  sources: ResearchSource[];
  ttl: number;
  timestamp?: number;
}

export interface FreshnessResult {
  exists: boolean;
  fresh: boolean;
  age?: number;
  expiresAt?: number;
}
