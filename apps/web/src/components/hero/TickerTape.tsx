'use client'

const ITEMS = [
  { sym: 'BTC', price: '67,842', change: '+2.4%', up: true },
  { sym: 'ETH', price: '3,291', change: '+1.8%', up: true },
  { sym: 'SOL', price: '142.30', change: '+5.1%', up: true },
  { sym: 'DOGE', price: '0.1482', change: '-1.2%', up: false },
  { sym: 'WIF', price: '2.34', change: '+12.7%', up: true },
  { sym: 'BONK', price: '0.0000234', change: '-3.1%', up: false },
  { sym: 'JUP', price: '1.12', change: '+4.2%', up: true },
  { sym: 'Iran deal by Apr 30', price: '62¢', change: 'YES', up: true },
  { sym: 'China–Taiwan 2027', price: '18¢', change: 'YES', up: false },
  { sym: 'Madrid v Bayern', price: '47¢', change: 'Madrid', up: true },
  { sym: 'Arsenal v PSG', price: '39¢', change: 'Arsenal', up: false },
]

function TickerItem({ sym, price, change, up }: typeof ITEMS[number]) {
  return (
    <span className="inline-flex items-center gap-2 px-4 whitespace-nowrap">
      <span className="font-headline text-[11px] font-bold tracking-wide text-on-surface/80">
        {sym}
      </span>
      <span className="font-headline text-[11px] text-on-surface-variant">
        {price}
      </span>
      <span
        className={`font-headline text-[11px] font-bold ${
          up ? 'text-tertiary' : 'text-error'
        }`}
      >
        {change}
      </span>
    </span>
  )
}

export default function TickerTape() {
  // Double the items for seamless loop
  const doubled = [...ITEMS, ...ITEMS]

  return (
    <div className="relative w-full overflow-hidden border-b border-outline-variant/20 bg-surface-container-lowest/80 backdrop-blur-sm z-50">
      <div className="ticker-scroll flex py-2">
        {doubled.map((item, i) => (
          <TickerItem key={i} {...item} />
        ))}
      </div>
    </div>
  )
}
