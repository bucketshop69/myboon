import type { OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';

interface PendingOpenOrderParams {
  id?: string;
  slug: string;
  tokenID: string;
  outcome: string;
  price: number;
  size: number;
}

export function makePendingOpenOrder(params: PendingOpenOrderParams): OpenOrder {
  return {
    id: params.id ?? `pending-${params.tokenID}-${Date.now()}`,
    status: 'local-pending',
    market: params.slug,
    asset_id: params.tokenID,
    side: 'BUY',
    original_size: String(params.size),
    size_matched: '0',
    price: String(params.price),
    outcome: params.outcome,
    created_at: Date.now(),
    order_type: 'GTC',
  };
}

export function prunePendingOpenOrders(
  pending: OpenOrder[],
  fetchedOrders: OpenOrder[],
  positions: PortfolioPosition[],
): OpenOrder[] {
  return pending.filter((order) => {
    const assetId = order.asset_id?.toLowerCase();
    if (!assetId) return false;
    const fetchedOrder = fetchedOrders.some((candidate) =>
      candidate.id === order.id || candidate.asset_id?.toLowerCase() === assetId
    );
    const fetchedPosition = positions.some((position) => position.asset?.toLowerCase() === assetId);
    return !fetchedOrder && !fetchedPosition;
  });
}

export function mergeOpenOrders(pending: OpenOrder[], fetched: OpenOrder[]): OpenOrder[] {
  const fetchedIds = new Set(fetched.map((order) => order.id));
  const fetchedAssets = new Set(fetched.map((order) => order.asset_id?.toLowerCase()).filter(Boolean));
  return [
    ...pending.filter((order) =>
      !fetchedIds.has(order.id) && !fetchedAssets.has(order.asset_id?.toLowerCase())
    ),
    ...fetched,
  ];
}
