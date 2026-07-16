import { NextRequest } from 'next/server'
import {
  expectedInternalPolymarketCatalogWriteToken,
  proxyInternalWriteApi,
} from '../../../../../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CollectionPublishRouteContext {
  params: Promise<{ collectionKey: string }>
}

export async function POST(request: NextRequest, context: CollectionPublishRouteContext) {
  const { collectionKey } = await context.params
  return proxyInternalWriteApi(
    request,
    `/internal/polymarket/collections/${encodeURIComponent(collectionKey)}/publish`,
    {
      writeToken: expectedInternalPolymarketCatalogWriteToken(),
      unavailableMessage: 'Internal Polymarket catalog publish service is unavailable',
      passthroughStatuses: [400, 404, 409, 422],
    },
  )
}
