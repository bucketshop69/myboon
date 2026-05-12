'use client'

import Image from 'next/image'

const feedItems = [
  {
    label: 'Top',
    title: 'Solana ETF odds reprice after issuer update',
    body: 'Prediction markets and SOL perps moved together inside a 12 minute window.',
    meta: '4m',
  },
]

const marketRows = [
  { market: 'Fed cut in June?', type: 'Macro', yes: '34c', no: '66c' },
  { market: 'Madrid wins UCL semi', type: 'Sport', yes: '47c', no: '29c' },
]

const positions = [
  { token: 'P', name: 'Prediction cash', venue: 'Polymarket wallet', value: '$1,240', delta: '+6.2%' },
  { token: 'S', name: 'SOL-PERP', venue: 'Perps margin', value: '$3,880', delta: '+2.1%' },
]

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex min-h-12 items-center justify-center">
      <h3 className="font-headline text-[32px] font-extrabold leading-none text-on-surface">{children}</h3>
    </div>
  )
}

function FeedCard({ item }: { item: (typeof feedItems)[number] }) {
  return (
    <article className="rounded-lg border border-outline-variant/70 bg-surface-container/75 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-sm border border-tertiary/20 bg-tertiary/10 px-1.5 py-0.5 font-headline text-[8px] font-black uppercase tracking-[0.08em] text-tertiary">
          {item.label}
        </span>
        <span className="ml-auto font-headline text-[9px] text-outline">{item.meta}</span>
      </div>
      <h4 className="mb-1.5 text-[13px] font-bold leading-snug text-on-surface">{item.title}</h4>
      <p className="text-[11px] leading-snug text-on-surface-variant/80">{item.body}</p>
    </article>
  )
}

function MarketRow({ row }: { row: (typeof marketRows)[number] }) {
  return (
    <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2 border-t border-outline-variant/40 pt-2 first:border-t-0 first:pt-0">
      <span className="font-headline text-[7px] font-black uppercase tracking-[0.08em] text-tertiary">{row.type}</span>
      <span className="truncate text-[11px] font-semibold text-on-surface">{row.market}</span>
      <span className="flex gap-1 font-headline text-[10px] font-black">
        <span className="min-w-8 rounded border border-primary-container/25 bg-primary-container/10 px-1 py-1 text-center text-primary-container">{row.yes}</span>
        <span className="min-w-8 rounded border border-error/25 bg-error/10 px-1 py-1 text-center text-error">{row.no}</span>
      </span>
    </div>
  )
}

function PositionRow({ item }: { item: (typeof positions)[number] }) {
  return (
    <div className="grid grid-cols-[34px_1fr_auto] items-center gap-2 border-t border-outline-variant/50 py-2 first:border-t-0">
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-outline-variant/70 bg-surface-container-high font-headline text-[10px] font-black text-tertiary">
        {item.token}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-bold text-on-surface">{item.name}</span>
        <span className="block truncate font-headline text-[8px] text-outline">{item.venue}</span>
      </span>
      <span className="text-right font-headline">
        <span className="block text-[10px] font-black text-on-surface">{item.value}</span>
        <span className="block text-[8px] font-bold text-primary-container">{item.delta}</span>
      </span>
    </div>
  )
}

export default function HomeCanvasPhonePrototype() {
  return (
    <div className="relative w-[292px]">
      <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-2xl" />
      <div className="relative rounded-[2.15rem] bg-black p-[6px] shadow-2xl shadow-black/70 ring-1 ring-white/10">
        <div className="relative h-[590px] overflow-hidden rounded-[1.85rem] border border-outline-variant/55 bg-surface-container-lowest ring-1 ring-primary/20">
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, #125E74 0%, #0C5066 28%, #063343 58%, #031F2C 100%)' }}
          />
          <div className="relative z-10 flex h-full flex-col">
            <header className="grid grid-cols-[90px_1fr_32px] items-center gap-2 px-3 pb-2 pt-5">
              <Image src="/branding/myboon-wordmark-header.png" alt="myboon" width={86} height={45} className="h-[32px] w-[62px] object-contain object-left" priority />
              <div aria-hidden="true" />
              <div className="flex h-8 w-8 items-center justify-center justify-self-end rounded-full border border-outline-variant bg-primary-container font-headline text-[9px] font-black text-on-primary-container">
                8F
              </div>
            </header>

            <div className="flex-1 overflow-hidden px-3 pb-5">
              <div className="space-y-3" style={{ transform: 'scale(0.92)', transformOrigin: 'top center' }}>
                <section>
                  <SectionTitle>Feed</SectionTitle>
                  <div className="mb-2 rounded-lg border border-outline-variant/70 bg-surface-container/70 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[13px] font-bold text-on-surface">Latest narratives</span>
                      <span className="font-headline text-[7px] font-black uppercase tracking-[0.08em] text-outline">Auto updated</span>
                    </div>
                    <div className="grid grid-cols-[48px_1fr_auto] gap-2 border-t border-outline-variant/40 py-2 font-headline text-[9px] first:border-t-0">
                      <span className="font-black uppercase text-tertiary">Top</span>
                      <span className="truncate text-on-surface-variant">Priority story stream</span>
                      <span className="font-black text-on-surface">1</span>
                    </div>
                  </div>
                  {feedItems.map((item) => <FeedCard key={item.title} item={item} />)}
                </section>

                <section>
                  <SectionTitle>Markets</SectionTitle>
                  <div className="rounded-lg border border-outline-variant/70 bg-surface-container/75 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[14px] font-bold text-on-surface">Live markets</span>
                      <span className="font-headline text-[8px] font-black uppercase tracking-[0.08em] text-outline">Polymarket + perps</span>
                    </div>
                    <div className="space-y-2">
                      {marketRows.map((row) => <MarketRow key={row.market} row={row} />)}
                      <div className="grid grid-cols-[32px_1fr_auto] items-center gap-2 border-t border-outline-variant/40 pt-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-on-surface/10 bg-primary/40 font-headline text-[9px] font-black text-on-surface">SOL</span>
                        <span>
                          <span className="block text-[11px] font-bold text-on-surface">SOL-PERP</span>
                          <span className="block font-headline text-[7px] text-outline">Open interest $42.1M</span>
                        </span>
                        <span className="text-right font-headline text-[10px] font-black text-primary-container">+5.1%</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionTitle>Wallet</SectionTitle>
                  <div className="rounded-lg border border-outline-variant/80 bg-surface-container-high/90 p-3">
                    <div className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-outline">Net worth</div>
                    <div className="mt-1 font-headline text-[34px] font-black leading-none text-on-surface">$9,428</div>
                    <div className="mt-1 font-headline text-[10px] font-bold text-primary-container">+3.8% today across 5 venues</div>
                  </div>
                  <div className="mt-2 rounded-lg border border-outline-variant/70 bg-surface-container/75 p-3">
                    <div className="mb-1 font-headline text-[8px] font-black uppercase tracking-[0.1em] text-outline">Positions</div>
                    {positions.map((item) => <PositionRow key={item.name} item={item} />)}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto -mt-3 h-10 w-56 rounded-full bg-black/45 blur-2xl" />
    </div>
  )
}
