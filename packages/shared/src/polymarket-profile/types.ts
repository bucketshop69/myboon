// ── Polymarket Profile API types ──
// Derived from live API responses, not OpenAPI spec (spec has nullable everywhere)

export interface PublicProfile {
  createdAt: string | null
  proxyWallet: string | null
  profileImage: string | null
  displayUsernamePublic: boolean | null
  bio: string | null
  pseudonym: string | null
  name: string | null
  users: ProfileUser[] | null
  xUsername: string | null
  verifiedBadge: boolean | null
}

export interface ProfileUser {
  id: string
  creator: boolean
  mod: boolean
}

export interface PortfolioValue {
  user: string
  value: number
}

export interface MarketsTraded {
  user: string
  traded: number
}

export interface Position {
  proxyWallet: string
  asset: string
  conditionId: string
  size: number
  avgPrice: number
  initialValue: number
  currentValue: number
  cashPnl: number
  percentPnl: number
  totalBought: number
  realizedPnl: number
  percentRealizedPnl: number
  curPrice: number
  redeemable: boolean
  mergeable: boolean
  title: string
  slug: string
  icon: string
  eventId?: string
  eventSlug: string
  outcome: string
  outcomeIndex: number
  oppositeOutcome: string
  oppositeAsset: string
  endDate: string
  negativeRisk: boolean
}

export interface ClosedPosition {
  proxyWallet: string
  asset: string
  conditionId: string
  avgPrice: number
  totalBought: number
  realizedPnl: number
  curPrice: number
  timestamp: number
  title: string
  slug: string
  icon: string
  eventSlug: string
  outcome: string
  outcomeIndex: number
  oppositeOutcome: string
  oppositeAsset: string
  endDate: string
}

export interface Activity {
  proxyWallet: string
  timestamp: number
  conditionId: string
  type: 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'REWARD' | 'CONVERSION' | 'MAKER_REBATE' | 'REFERRAL_REWARD'
  size: number
  usdcSize: number
  transactionHash: string
  price: number
  asset: string
  side: 'BUY' | 'SELL'
  outcomeIndex: number
  title: string
  slug: string
  icon: string
  eventSlug: string
  outcome: string
  name: string | null
  pseudonym: string | null
  bio: string | null
  profileImage: string | null
  profileImageOptimized: string | null
}

// ── Query option types ──

export type PositionSortBy =
  | 'CURRENT' | 'INITIAL' | 'TOKENS' | 'CASHPNL'
  | 'PERCENTPNL' | 'TITLE' | 'RESOLVING' | 'PRICE' | 'AVGPRICE'

export type ClosedPositionSortBy =
  | 'REALIZEDPNL' | 'TITLE' | 'PRICE' | 'AVGPRICE' | 'TIMESTAMP'

export type ActivitySortBy = 'TIMESTAMP' | 'TOKENS' | 'CASH'

export type ActivityType =
  | 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM'
  | 'REWARD' | 'CONVERSION' | 'MAKER_REBATE' | 'REFERRAL_REWARD'

export type SortDirection = 'ASC' | 'DESC'

export interface PositionsQuery {
  user: string
  market?: string[]
  eventId?: number[]
  sizeThreshold?: number
  limit?: number
  offset?: number
  sortBy?: PositionSortBy
  sortDirection?: SortDirection
  redeemable?: boolean
  mergeable?: boolean
  title?: string
}

export interface ClosedPositionsQuery {
  user: string
  market?: string[]
  eventId?: number[]
  title?: string
  limit?: number
  offset?: number
  sortBy?: ClosedPositionSortBy
  sortDirection?: SortDirection
}

export interface ActivityQuery {
  user: string
  market?: string[]
  eventId?: number[]
  type?: ActivityType[]
  start?: number
  end?: number
  limit?: number
  offset?: number
  sortBy?: ActivitySortBy
  sortDirection?: SortDirection
  side?: 'BUY' | 'SELL'
}
