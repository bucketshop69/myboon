'use client'

import Image from 'next/image'

interface HomeCanvasJourneyPhoneProps {
  activeIndex: number
}

const feedItems = [
  {
    tag: 'Oil',
    time: '4h ago',
    title: 'Whale selling $23.7K against WTI $150 and $120 in May.',
    body: 'Both priced 99.9% taking profit on Iran risk premium. Also betting NO on Hormuz traffic normalizing by June.',
  },
  {
    tag: 'Iran',
    time: '5h ago',
    title: '0xc8ab...',
    body: 'betting France warships through Hormuz by May 31. Also $7.5K SELL on traffic normalizing by May 15.',
  },
  {
    tag: 'Iran',
    time: '11h ago',
    title: '0xc8ab...',
    body: 'betting $10K Strait traffic stays blocked past May 15. Market at 99.9% YES against near-certainty.',
  },
  {
    tag: 'Fed',
    time: '12h ago',
    title: 'Two whales betting against BOTH Fed Chair picks.',
    body: 'Bessent and Miran at 99.9% smart money selling both. $2.3M says neither makes it.',
  },
]

const polymarketRows = [
  { type: 'IPL', name: 'Punjab Kings vs Delhi Capitals', yes: '56c', no: '44c' },
  { type: 'EPL', name: 'Tottenham Hotspur FC vs. Leeds United', yes: '25c', no: '55c' },
  { type: 'IPL', name: 'Gujarat Titans vs Sunrisers Hyderabad', yes: '47c', no: '54c' },
  { type: 'EPL', name: 'Manchester City FC vs. Crystal Palace', yes: '81c', no: '13c' },
  { type: 'IPL', name: 'Lucknow Super Giants vs Chennai Super Kings', yes: '41c', no: '59c' },
]

const perpsRows = [
  { symbol: 'SUI', price: '$1.300', change: '+19.36%' },
  { symbol: 'STR', price: '$0.051104', change: '-6.06%' },
  { symbol: 'UNI', price: '$3.924', change: '+5.92%' },
]

const matchRows = [
  { home: 'Tottenham', away: 'Leeds', yes: '55%', draw: '25%', no: '23%', volume: '$114.3K vol' },
  { home: 'Manchester', away: 'Crystal Palace', yes: '81%', draw: '13%', no: '7%', volume: '$40.8K vol' },
  { home: 'Aston Villa', away: 'Liverpool', yes: '32%', draw: '26%', no: '44%', volume: '$17.5K vol' },
  { home: 'Wolverhampton', away: 'Fulham', yes: '27%', draw: '24%', no: '50%', volume: '$415 vol' },
]

const walletRows = [
  { token: 'P', name: 'Prediction cash', sub: 'Polymarket wallet', value: '$1,240', delta: '+6.2%' },
  { token: 'H', name: 'SOL-PERP', sub: 'Perps margin', value: '$3,880', delta: '+2.1%' },
  { token: 'M', name: 'Meteora LP', sub: 'SOL / USDC', value: '$920', delta: '+0.8%' },
]

function PhoneHeader() {
  return (
    <header className="grid grid-cols-[90px_1fr_36px] items-center gap-2 px-4 pb-2 pt-5">
      <Image
        src="/branding/myboon-wordmark-header.png"
        alt="myboon"
        width={86}
        height={45}
        className="h-[36px] w-[68px] object-contain object-left"
      />
      <div aria-hidden="true" />
      <div className="relative flex h-9 w-9 items-center justify-center justify-self-end rounded-full border-2 border-primary bg-surface-container/80 font-headline text-[11px] font-black text-primary-container">
        7
        <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-primary-container" />
      </div>
    </header>
  )
}

function FeedCard({ item, selected = false }: { item: (typeof feedItems)[number]; selected?: boolean }) {
  return (
    <article className={[
      'rounded-lg border bg-surface-container/78 p-3 transition-colors',
      selected ? 'border-primary/85 bg-surface-container-highest/62 shadow-lg shadow-primary/10' : 'border-outline-variant/70',
    ].join(' ')}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-sm bg-tertiary/12 px-1.5 py-0.5 font-headline text-[8px] font-black uppercase tracking-[0.1em] text-tertiary">
          {item.tag}
        </span>
        <span className="font-headline text-[9px] font-bold text-outline">{item.time}</span>
      </div>
      <h4 className="mb-2 text-[13px] font-bold leading-snug text-on-surface">{item.title}</h4>
      <p className="text-[11px] font-medium leading-snug text-on-surface-variant/85">{item.body}</p>
    </article>
  )
}

function HomeFeedScreen() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <PhoneHeader />
      <div className="relative flex-1 overflow-hidden px-4 pb-5">
        <div className="flex min-h-[116px] items-center justify-center">
          <h3 className="font-headline text-[46px] font-extrabold leading-none text-on-surface">Feed</h3>
        </div>

        <div className="mb-3 rounded-lg border border-outline-variant/70 bg-surface-container/75 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[14px] font-bold text-on-surface">Latest narratives</span>
            <span className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-outline">Auto updated</span>
          </div>
          {[
            ['Top', 'Priority story from the publisher stream', '1'],
            ['Actions', 'Stories with market or perps routes', 'Live'],
            ['Fresh', 'Updated while the app is focused', '5m'],
          ].map(([label, text, value]) => (
            <div key={label} className="grid grid-cols-[58px_1fr_auto] gap-2 border-t border-outline-variant/45 py-2 first:border-t-0">
              <span className="font-headline text-[8px] font-black uppercase tracking-[0.09em] text-tertiary">{label}</span>
              <span className="truncate text-[11px] font-medium text-on-surface-variant">{text}</span>
              <span className="font-headline text-[10px] font-black text-on-surface">{value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <FeedCard item={feedItems[0]} selected />
          <FeedCard item={feedItems[1]} />
        </div>

        <div className="pointer-events-none absolute inset-x-4 bottom-4 h-24 bg-gradient-to-t from-[#063343] via-[#063343]/95 to-transparent" />
        <div className="absolute inset-x-4 bottom-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-tertiary/45 bg-surface-container-low/95 p-3 shadow-2xl shadow-black/30">
          <div>
            <div className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-tertiary">Show more</div>
            <div className="mt-1 text-[16px] font-black text-on-surface">Open the full Feed</div>
          </div>
          <div className="flex h-10 min-w-16 items-center justify-center rounded-full bg-tertiary px-4 font-headline text-[9px] font-black uppercase tracking-[0.08em] text-on-tertiary">
            Feed
          </div>
        </div>
      </div>
    </div>
  )
}

function FullFeedScreen({ showSelection = false }: { showSelection?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-surface-container-lowest/12">
      <PhoneHeader />
      <div className="flex-1 overflow-hidden px-4 pb-5">
        <div className="mb-3 flex items-center justify-between border-b border-outline-variant/55 pb-2 pt-1">
          <span className="font-headline text-[9px] font-black uppercase tracking-[0.12em] text-tertiary">Full feed</span>
          <span className="font-headline text-[8px] font-bold uppercase tracking-[0.1em] text-outline">Opened</span>
        </div>
        <div className="space-y-3">
          {feedItems.map((item, index) => (
            <div key={`${item.tag}-${item.time}`}>
              <FeedCard item={item} selected={showSelection && index === 0} />
              {showSelection && index === 0 && (
                <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-primary-container/35 bg-primary-container/12 p-2.5">
                  <div>
                    <div className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-primary-container">Feed item selected</div>
                    <div className="mt-0.5 text-[11px] font-bold text-on-surface">Tap to expand the narrative</div>
                  </div>
                  <div className="rounded-full bg-primary-container px-3 py-2 font-headline text-[9px] font-black uppercase tracking-[0.1em] text-on-primary-container">
                    Show details
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FeedDetailSheet() {
  return (
    <div className="absolute inset-0 z-20 bg-black/48">
      <div className="absolute inset-x-0 bottom-0 max-h-[505px] rounded-t-[28px] border border-primary/45 bg-surface-container-low p-5 shadow-2xl shadow-black/70">
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-primary/70" />
        <div className="mb-3 font-headline text-[9px] font-black uppercase tracking-[0.12em] text-primary-container">Details opened</div>
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-sm bg-tertiary/12 px-1.5 py-0.5 font-headline text-[8px] font-black uppercase tracking-[0.1em] text-tertiary">Iran</span>
          <span className="font-headline text-[9px] font-bold text-outline">11h ago</span>
        </div>
        <p className="text-[17px] font-bold leading-[1.55] text-on-surface">
          The wallet is running a coordinated two-theme play: Strait of Hormuz stays blocked and US-China
          relations stay cold. The $10K on Strait traffic not returning by May 15 is the sharpest edge.
        </p>
        <button className="mt-6 rounded-full border border-primary-container/30 bg-primary-container/10 px-4 py-2 font-headline text-[9px] font-black uppercase tracking-[0.1em] text-primary-container">
          Explain simply
        </button>
        <div className="mt-6 border-t border-outline-variant/80 pt-3">
          <div className="mb-3 font-headline text-[9px] font-black uppercase tracking-[0.12em] text-outline">Prediction market</div>
          <div className="rounded-lg border border-outline-variant/70 bg-surface-container/80 p-3">
            <h4 className="text-[13px] font-bold leading-snug text-on-surface">Strait of Hormuz traffic returns to normal by May 15?</h4>
            <div className="mt-3 grid grid-cols-2 gap-3 font-headline text-[18px] font-black">
              <div className="text-primary-container">YES 1%</div>
              <div className="text-right text-error">NO 99%</div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-outline-variant/60">
              <div className="h-full w-[99%] rounded-full bg-error" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MarketOddRow({ row }: { row: (typeof polymarketRows)[number] }) {
  return (
    <div className="grid grid-cols-[42px_1fr_auto] items-center gap-2 border-t border-outline-variant/50 py-2 first:border-t-0">
      <span className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-tertiary">{row.type}</span>
      <span className="truncate text-[11px] font-bold text-on-surface">{row.name}</span>
      <span className="flex gap-1 font-headline text-[10px] font-black">
        <span className="min-w-9 rounded border border-primary-container/30 bg-primary-container/10 px-1 py-1.5 text-center text-primary-container">{row.yes}</span>
        <span className="min-w-9 rounded border border-error/30 bg-error/10 px-1 py-1.5 text-center text-error">{row.no}</span>
      </span>
    </div>
  )
}

function HomeMarketsScreen() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <PhoneHeader />
      <div className="flex-1 overflow-hidden px-4 pb-5">
        <div className="mb-3 rounded-lg border border-outline-variant/65 bg-surface-container/70 p-3">
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div>
              <div className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-tertiary">Show more</div>
              <div className="mt-1 text-[16px] font-black text-on-surface">Open the full Feed</div>
            </div>
            <div className="flex h-10 min-w-16 items-center justify-center rounded-full bg-tertiary px-4 font-headline text-[9px] font-black uppercase tracking-[0.08em] text-on-tertiary">Feed</div>
          </div>
        </div>

        <div className="flex min-h-[110px] items-center justify-center">
          <h3 className="font-headline text-[48px] font-extrabold leading-none text-on-surface">Markets</h3>
        </div>
        <div className="rounded-lg border border-outline-variant/70 bg-surface-container/75 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[16px] font-bold text-on-surface">Polymarket</span>
            <span className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-outline">5 live</span>
          </div>
          {polymarketRows.map((row) => <MarketOddRow key={row.name} row={row} />)}
        </div>
        <div className="mt-3 rounded-lg border border-outline-variant/70 bg-surface-container/75 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[16px] font-bold text-on-surface">Perps</span>
            <span className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-outline">Top movers</span>
          </div>
          {perpsRows.map((row) => (
            <div key={row.symbol} className="grid grid-cols-[38px_1fr_auto] items-center gap-2 border-t border-outline-variant/50 py-2.5 first:border-t-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/45 bg-primary/40 font-headline text-[9px] font-black text-on-surface">{row.symbol}</span>
              <span>
                <span className="block text-[13px] font-bold text-on-surface">{row.symbol}</span>
                <span className="block font-headline text-[8px] text-outline">Open interest live</span>
              </span>
              <span className="text-right font-headline">
                <span className="block text-[10px] font-black text-on-surface">{row.price}</span>
                <span className={row.change.startsWith('+') ? 'block text-[8px] font-black text-primary-container' : 'block text-[8px] font-black text-error'}>{row.change}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-primary-container/35 bg-primary-container/12 p-3">
          <div className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-primary-container">Use signal</div>
          <div className="mt-1 text-[16px] font-black text-on-surface">Take action on your signals</div>
        </div>
      </div>
    </div>
  )
}

function MatchMarketCard({ row }: { row: (typeof matchRows)[number] }) {
  return (
    <article className="rounded-lg border border-outline-variant/70 bg-surface-container/75 p-3">
      <div className="mb-3 flex items-center justify-between font-headline text-[9px] font-bold text-outline">
        <span>May 12 - 00:30</span>
        <span className="rounded-full border border-outline-variant/70 px-2 py-0.5">{row.volume}</span>
      </div>
      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[13px] font-bold text-on-surface">
        <span>{row.home}</span>
        <span className="font-headline text-[10px] text-outline">vs</span>
        <span className="text-right">{row.away}</span>
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-1">
        <div className="h-1.5 rounded-full bg-primary-container" />
        <div className="h-1.5 rounded-full bg-tertiary" />
        <div className="h-1.5 rounded-full bg-error" />
      </div>
      <div className="mt-2 grid grid-cols-3 font-headline text-[11px] font-black">
        <span className="text-primary-container">{row.yes}</span>
        <span className="text-center text-tertiary">{row.draw} draw</span>
        <span className="text-right text-error">{row.no}</span>
      </div>
    </article>
  )
}

function FullMarketsScreen() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <PhoneHeader />
      <div className="flex-1 overflow-hidden px-4 pb-5">
        <div className="mb-4 flex gap-2 overflow-hidden border-y border-outline-variant/55 py-2">
          {['All', 'Sports', 'Politics', 'Other', 'Macro'].map((chip, index) => (
            <div
              key={chip}
              className={index === 0
                ? 'rounded-lg border border-tertiary/45 bg-tertiary/18 px-3 py-2 font-headline text-[10px] font-black text-on-surface'
                : 'rounded-lg border border-outline-variant/70 px-3 py-2 font-headline text-[10px] font-black text-outline'}
            >
              {chip}
            </div>
          ))}
        </div>
        <div className="mb-4 flex items-center justify-between">
          <span className="font-headline text-[12px] font-black uppercase tracking-[0.18em] text-on-surface">EPL - Upcoming</span>
          <span className="rounded bg-primary/30 px-2 py-1 font-headline text-[9px] font-black text-primary-container">9</span>
        </div>
        <div className="space-y-3">
          {matchRows.map((row) => <MatchMarketCard key={`${row.home}-${row.away}`} row={row} />)}
        </div>
      </div>
    </div>
  )
}

function WalletScreen() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <PhoneHeader />
      <div className="flex-1 overflow-hidden px-4 pb-5">
        <div className="flex min-h-[118px] items-center justify-center">
          <h3 className="font-headline text-[48px] font-extrabold leading-none text-on-surface">Wallet</h3>
        </div>
        <div className="rounded-lg border border-outline-variant/80 bg-surface-container-high/88 p-4">
          <div className="font-headline text-[8px] font-black uppercase tracking-[0.1em] text-outline">Net worth</div>
          <div className="mt-3 font-headline text-[38px] font-black leading-none text-on-surface">$9,428</div>
          <div className="mt-2 font-headline text-[10px] font-black text-primary-container">+3.8% today across 5 venues</div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {['Picks', 'Perps', 'Swap'].map((item, index) => (
            <div
              key={item}
              className={index === 0
                ? 'flex h-12 items-center justify-center rounded-lg bg-tertiary font-headline text-[9px] font-black uppercase tracking-[0.1em] text-on-tertiary'
                : 'flex h-12 items-center justify-center rounded-lg border border-outline-variant/70 bg-surface-container/75 font-headline text-[9px] font-black uppercase tracking-[0.1em] text-on-surface-variant'}
            >
              {item}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-outline-variant/70 bg-surface-container/75 p-3">
          <div className="mb-2 font-headline text-[8px] font-black uppercase tracking-[0.1em] text-outline">Positions</div>
          {walletRows.map((row) => (
            <div key={row.name} className="grid grid-cols-[38px_1fr_auto] items-center gap-2 border-t border-outline-variant/50 py-3 first:border-t-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/35 bg-primary/30 font-headline text-[10px] font-black text-tertiary">{row.token}</span>
              <span>
                <span className="block text-[13px] font-bold text-on-surface">{row.name}</span>
                <span className="block font-headline text-[8px] text-outline">{row.sub}</span>
              </span>
              <span className="text-right font-headline">
                <span className="block text-[11px] font-black text-on-surface">{row.value}</span>
                <span className="block text-[8px] font-black text-primary-container">{row.delta}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HomeCanvasJourneyPhone({ activeIndex }: HomeCanvasJourneyPhoneProps) {
  const clampedIndex = Math.max(0, Math.min(activeIndex, 5))
  const isHome = clampedIndex === 0
  const isFullFeed = clampedIndex === 1
  const isDetails = clampedIndex === 2
  const isHomeMarkets = clampedIndex === 3
  const isFullMarkets = clampedIndex === 4
  const isWallet = clampedIndex === 5

  return (
    <div className="relative w-[304px]">
      <div className="absolute -inset-5 rounded-[2.3rem] bg-primary/10 blur-2xl" />
      <div className="relative rounded-[2.2rem] bg-black p-[6px] shadow-2xl shadow-black/70 ring-1 ring-white/10">
        <div className="relative h-[612px] overflow-hidden rounded-[1.9rem] border border-outline-variant/55 bg-surface-container-lowest ring-1 ring-primary/20">
          <div
            className="absolute inset-0 transition-[background-position] duration-700 ease-out"
            style={{
              backgroundImage:
                'radial-gradient(circle at 18% 4%, rgba(255,209,102,0.22), transparent 190px), radial-gradient(circle at 84% 44%, rgba(6,214,160,0.10), transparent 230px), linear-gradient(180deg, rgba(40,169,201,0.88) 0%, rgba(17,138,178,0.80) 22%, rgba(10,111,145,0.88) 44%, rgba(5,47,63,0.98) 100%)',
              backgroundSize: '100% 180%',
              backgroundPosition: isHome ? '0 0' : isWallet ? '0 100%' : '0 42%',
            }}
          />

          <div className={['absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', isHome ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'].join(' ')}>
            <HomeFeedScreen />
          </div>
          <div className={['absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', isFullFeed || isDetails ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'].join(' ')}>
            <FullFeedScreen showSelection={isFullFeed || isDetails} />
          </div>
          <div className={['absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', isDetails ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'].join(' ')}>
            <FeedDetailSheet />
          </div>
          <div className={['absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', isHomeMarkets ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'].join(' ')}>
            <HomeMarketsScreen />
          </div>
          <div className={['absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', isFullMarkets ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'].join(' ')}>
            <FullMarketsScreen />
          </div>
          <div className={['absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', isWallet ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'].join(' ')}>
            <WalletScreen />
          </div>
        </div>
      </div>
      <div className="mx-auto -mt-3 h-10 w-56 rounded-full bg-black/45 blur-2xl" />
    </div>
  )
}
