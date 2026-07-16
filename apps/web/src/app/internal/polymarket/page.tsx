import type { Metadata } from 'next'
import { getInternalSession, hasValidInternalSession, isInternalDashboardConfigured } from '../_lib/server'
import { InternalLoginPanel } from '../components/InternalLoginPanel'
import { PolymarketCollectionEditor } from './PolymarketCollectionEditor'

export const metadata: Metadata = {
  title: 'Polymarket Catalog | myboon Internal',
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function InternalPolymarketPage() {
  const session = await getInternalSession()
  const isConfigured = isInternalDashboardConfigured()
  const isAuthorized = hasValidInternalSession(session)

  if (!isAuthorized) {
    return (
      <InternalLoginPanel
        isConfigured={isConfigured}
        kicker="Internal catalog"
        title="Polymarket markets"
        copy="Enter the internal token to curate and publish the featured Polymarket collection."
      />
    )
  }

  return <PolymarketCollectionEditor />
}
