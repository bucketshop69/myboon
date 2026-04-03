# #058 — Apple-Style Sticky Scroll: Features Section + World Inline

## Problem

The landing page (`/`) is a single `h-screen` hero with no scroll. A visitor who finishes reading the hero has nowhere to go — the CTA says "Coming Soon" and the `/world` newsroom is buried behind an icon link that most users will never click.

Two gaps:

1. **No feature storytelling below the fold.** The floating cards gesture at FEED / PREDICT / TRADE / SWAP but don't demonstrate them with depth. There is no scroll narrative — no "here's what each tab does and why it matters."

2. **The Newsroom is isolated.** `/world` is the most compelling piece of storytelling on the site — it shows the full intelligence pipeline as a living office. It should be the page's climax, not a separate route requiring navigation.

## Goal

1. Add an Apple-style sticky scroll section between the hero and a new World footer: phone mockup is pinned on one side while four feature panels scroll past it, each activating the corresponding phone screen.
2. Move the Newsroom canvas inline as the final section of the landing page — scroll into it, no navigation required.
3. Enhance the hero entrance with Framer Motion (staggered fade-in, not a redesign).

## Dependencies

- Builds on: #045 (hero), #046 (newsroom canvas)
- Blocked by: none

## Scope

- `apps/web/package.json` — add `framer-motion`
- `apps/web/src/app/page.tsx` — compose new page sections in order
- `apps/web/src/app/world/page.tsx` — add deprecation note; keep route alive but add banner pointing to `/`
- `apps/web/src/components/hero/HeroSection.tsx` — wrap entrance elements in Framer Motion
- `apps/web/src/components/features/FeaturesScroll.tsx` — new: sticky scroll section
- `apps/web/src/components/features/FeaturePanel.tsx` — new: one scroll step per feature
- `apps/web/src/components/world/NewsroomSection.tsx` — new: thin wrapper that embeds NewsroomCanvas inline with a heading + intro copy
- `apps/web/src/components/world/NewsroomCanvas.tsx` — make width responsive (swap fixed 1280px for `100%` with `aspect-ratio`)

## Changes

### 1. Install Framer Motion

```bash
pnpm --filter @myboon/web add framer-motion
```

No other animation libraries. All new motion uses Framer Motion. Existing CSS keyframe animations (float-phone, float-feed, etc.) stay as-is — do not migrate them.

---

### 2. Hero Entrance Animation (`HeroSection.tsx`)

Wrap the existing hero content in a Framer Motion stagger container. The elements already exist — this is purely entrance motion layered on top:

```tsx
import { motion } from 'framer-motion'

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 }
  }
}

const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }
}
```

Wrap: logo badge → headline → subline → CTA button → icon row — each as `<motion.div variants={item}>`. The phone mockup and floating cards animate in as a group with `opacity: 0 → 1` over 0.7s, delayed 0.4s.

Do not change colors, layout, or copy. Animation only.

---

### 3. Features Sticky Scroll Section (`FeaturesScroll.tsx`)

#### Layout

```
┌─────────────────────────────────────────────────────┐
│  sticky phone (left, 40%)  │  scroll panels (right) │
│                             │                        │
│  [PhoneFrame]               │  [FeaturePanel × 4]    │
│  screen changes on scroll   │  each 100vh tall       │
└─────────────────────────────────────────────────────┘
```

Outer container: `height: 500vh` (4 panels × ~100vh each, plus entry/exit breathing room).

Left column: `position: sticky; top: 0; height: 100vh` — holds the phone mockup. The phone is the same `<PhoneFrame>` component from the hero. Accept an `activeTab` prop (`'feed' | 'predict' | 'trade' | 'swap'`) that drives the screen content — already exists in PhoneFrame, just needs to be wired.

Right column: 4 `<FeaturePanel>` children, each `min-height: 100vh`, stacked vertically.

#### Scroll tracking

```tsx
'use client'
import { useScroll, useTransform, motion } from 'framer-motion'
import { useRef } from 'react'

const FEATURES = ['feed', 'predict', 'trade', 'swap'] as const
type Feature = typeof FEATURES[number]

export function FeaturesScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  // scrollYProgress 0→1 maps across all 4 panels
  // active index: 0–1 = feed, 0.25–0.5 = predict, 0.5–0.75 = trade, 0.75–1 = swap
  const [activeTab, setActiveTab] = useState<Feature>('feed')

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const idx = Math.min(3, Math.floor(v * 4))
    setActiveTab(FEATURES[idx])
  })

  return (
    <div ref={ref} style={{ height: '500vh' }} className="relative">
      {/* sticky phone */}
      <div className="sticky top-0 h-screen w-2/5 flex items-center justify-center">
        <PhoneFrame activeTab={activeTab} />
      </div>
      {/* scroll panels */}
      <div className="absolute top-0 right-0 w-3/5">
        {FEATURES.map((f) => <FeaturePanel key={f} feature={f} />)}
      </div>
    </div>
  )
}
```

`useState` + `useMotionValueEvent` (from `framer-motion`) drives `activeTab`. PhoneFrame receives it and crossfades the screen content — use `AnimatePresence` + `motion.div key={activeTab}` inside PhoneFrame for the screen swap:

```tsx
// inside PhoneFrame, replace current screen rendering with:
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
  >
    {/* existing screen content for activeTab */}
  </motion.div>
</AnimatePresence>
```

#### Feature Panel content (`FeaturePanel.tsx`)

Each panel is `min-h-screen flex items-center` with left-padding to clear the sticky phone column. Content per feature:

| feature | icon (Material Symbol) | headline | body |
|---------|----------------------|----------|------|
| `feed` | `sensors` | The feed the market reads first. | Narrative intelligence synthesized from Polymarket signals, on-chain whale flow, and a multi-agent brain — delivered before the market prices it in. |
| `predict` | `bar_chart` | Polymarket odds, without the noise. | Live market probabilities surfaced by topic, not by recency. Know what's moving before you see it in the price. |
| `trade` | `trending_up` | Perps, one tap. | Pacific Protocol perpetuals on Solana. Up to 10× leverage. Execution from the same app you use to read the narrative. |
| `swap` | `swap_horiz` | Jupiter liquidity. No routing fees. | Best execution across all Solana DEX routes, surfaced inline. Swap the token the narrative is about, from the card that told you about it. |

Panel animation: enter viewport → `opacity: 0, x: 40 → opacity: 1, x: 0` using Framer Motion's `whileInView` with `once: true`, `margin: "-20%"`.

```tsx
<motion.div
  initial={{ opacity: 0, x: 40 }}
  whileInView={{ opacity: 1, x: 0 }}
  viewport={{ once: true, margin: '-20%' }}
  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
>
```

#### Mobile behavior

Below `lg` breakpoint: sticky layout collapses. Phone mockup hidden. Feature panels go full-width, stacked vertically, no sticky behavior. Each panel gets a static phone screen thumbnail (small, above the text). This is the degraded mobile path — acceptable for now.

```tsx
// in FeaturesScroll.tsx
<div className="lg:hidden">
  {FEATURES.map((f) => <MobileFeaturePanel key={f} feature={f} />)}
</div>
<div className="hidden lg:block">
  {/* sticky desktop layout */}
</div>
```

---

### 4. Newsroom Section Inline (`NewsroomSection.tsx`)

New thin wrapper component. Renders at the bottom of `page.tsx` after `<FeaturesScroll />`.

```tsx
export function NewsroomSection() {
  return (
    <section className="py-24 px-6 border-t border-outline-variant">
      <div className="max-w-5xl mx-auto mb-12 text-center">
        <p className="text-xs font-headline tracking-widest text-primary uppercase mb-3">
          Under the hood
        </p>
        <h2 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-4">
          The newsroom never sleeps.
        </h2>
        <p className="text-on-surface-variant text-base max-w-xl mx-auto">
          Every signal that enters myboon passes through a multi-agent pipeline — 
          collectors, analyst, editorial, broadcast. This is what it looks like.
        </p>
      </div>
      <div className="w-full overflow-x-auto rounded-xl border border-outline-variant">
        <NewsroomCanvas />
      </div>
    </section>
  )
}
```

#### Make NewsroomCanvas responsive

`NewsroomCanvas.tsx` currently hardcodes `width={1280} height={720}`. Change to:

```tsx
// Replace fixed dimensions with:
const ASPECT = 720 / 1280

// Use a ResizeObserver or container ref to get available width, then:
const canvasWidth = containerWidth   // fills parent
const canvasHeight = containerWidth * ASPECT
```

Use `useRef` on a wrapper div + `ResizeObserver` to track `containerWidth`. Minimum width: 640px (below that, horizontal scroll via `overflow-x-auto` on the parent). All internal canvas coordinates scale by `containerWidth / 1280`.

---

### 5. Update `page.tsx`

```tsx
import { HeroSection } from '@/components/hero/HeroSection'
import { FeaturesScroll } from '@/components/features/FeaturesScroll'
import { NewsroomSection } from '@/components/world/NewsroomSection'

export default function Home() {
  return (
    <main>
      <HeroSection />
      <FeaturesScroll />
      <NewsroomSection />
    </main>
  )
}
```

Remove the `h-screen` constraint from `HeroSection` if it currently forces the page to `overflow: hidden` — the page must now scroll.

---

### 6. Deprecate `/world` standalone route

Keep the route alive (do not 404 existing links). Add a banner at the top:

```tsx
// apps/web/src/app/world/page.tsx — add above the canvas:
<div className="text-center py-4 px-6 bg-surface-container text-on-surface-variant text-sm">
  The newsroom is now part of the{' '}
  <a href="/" className="text-primary underline">main page</a>. 
  This standalone view will be removed in a future update.
</div>
```

---

### 7. Remove Press Start 2P font

`apps/web/src/app/layout.tsx` loads `Press_Start_2P` but it is unused. Remove the import and the `${pressStart2P.variable}` from the body className. This eliminates ~100KB of unused font payload.

## Acceptance Criteria

- [ ] `framer-motion` is in `apps/web/package.json` dependencies
- [ ] Hero elements stagger-fade on page load (logo → headline → subline → CTA → icons)
- [ ] `FeaturesScroll` section renders below hero; outer container is taller than viewport (allows scroll)
- [ ] Phone mockup is sticky (stays in viewport) while scrolling through all 4 feature panels
- [ ] `activeTab` changes to `feed → predict → trade → swap` as user scrolls through each panel
- [ ] Phone screen crossfades (via `AnimatePresence`) when `activeTab` changes
- [ ] Each `FeaturePanel` animates in from right (`x: 40 → 0`) on scroll into viewport
- [ ] `NewsroomSection` renders below `FeaturesScroll` with heading, intro copy, and the canvas
- [ ] `NewsroomCanvas` fills its container width with correct aspect ratio (no horizontal overflow on 1280px viewport)
- [ ] On mobile (`< lg`), sticky layout is not used; feature panels are full-width stacked
- [ ] `/world` route still loads and shows the deprecation banner
- [ ] `Press_Start_2P` font is removed from layout.tsx
- [ ] Page loads without hydration errors (`useScroll` and `useMotionValueEvent` are in `'use client'` components only)
