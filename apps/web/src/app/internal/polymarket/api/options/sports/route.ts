import { proxyInternalApi } from '../../../../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return proxyInternalApi(
    '/internal/polymarket/collections/options/sports',
    {
      configurationMessage: 'Internal Polymarket catalog is unavailable',
      unavailableMessage: 'Polymarket sports metadata is unavailable',
    },
  )
}
