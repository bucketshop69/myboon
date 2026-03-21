# #045 — Landing Page: Hero Section

> **COMPLETED** — `apps/web` created (Next.js 15, `@myboon/web`). Hero section implemented with centered phone mockup, 4 floating tab cards, independent float animations, hover-to-preview interactions, icon row (Newsroom, GitHub, X, Download), and "coming soon" tooltips on CTA + Download.

## Problem

myboon has no web presence. The product exists as a mobile app and a VPS API, but there is no page a user can land on that communicates what the product is, what makes it compelling, and what they would experience if they opened the app. The feed is the differentiator — it tells traders something they can't get anywhere else — but there is no surface to demonstrate that before someone downloads the app.

The first impression needs to do three things simultaneously: show the product in action, communicate the depth of the intelligence engine behind it, and feel distinctively different from every generic DeFi landing page that exists. Generic means: hero image, tagline, three feature bullets, a CTA button. We want none of that.

## Goal

1. A single hero section that serves as the full above-the-fold experience of the myboon landing page
2. The mobile app is placed at the center of the screen as the literal focal point — everything orbits it
3. The four product tabs (Feed, Predict, Trade, Swap) appear as cards floating around the phone in 3D space — hovering any card animates the phone screen to preview that tab
4. The overall visual impression is a living product demo, not a marketing page

## Dependencies

- Blocked by: none
- Blocks: #046 (workflow section sits below this on the same page)

## Scope

- `apps/web/` — new Next.js app, created fresh in the monorepo under `apps/`
- `apps/web/src/app/page.tsx` — root landing page, renders hero + workflow sections
- `apps/web/src/components/hero/` — all hero section components
- `apps/web/src/styles/` — global styles and design token imports
- `apps/web/package.json` — Next.js app config
- Root `pnpm-workspace.yaml` — must include `apps/web`

---

## Visual Design Language

The visual identity is pulled directly from the mobile app's existing design system. The mobile app lives in `apps/hybrid-expo` and already has a theme file with defined color tokens, typography scales, and spacing values. The web landing page uses these exact same tokens — same blacks, same greens and reds for PnL signals, same font choices — so the landing page and the app feel like they came from the same hand.

The overall aesthetic sits in the space between a Bloomberg terminal and a high-end crypto product. Dark background. Subtle grid or noise texture. Precise typography. No gradients that don't earn their place. Motion that communicates intelligence rather than decoration.

---

## The Phone Mockup

The centerpiece is a rendered mobile device frame — a phone in portrait orientation — positioned at the horizontal and vertical center of the hero section. The phone frame itself should feel physical and crafted: subtle bezels, a power button outline, a camera notch or pill cutout at the top. It should not look like a flat rectangle with rounded corners. The level of detail in the frame signals craftsmanship.

Inside the frame, the phone screen is live. It renders actual content — a static or looping snapshot of the real Feed tab UI. The content inside the phone should look like real narrative cards: a category pill, a short text block, a timestamp. It should be immediately recognizable as financial intelligence content, not placeholder Lorem Ipsum.

The phone is not static. It has a continuous, very subtle float animation — a slow, gentle vertical drift of a few pixels over a 3–4 second cycle, combined with an equally gentle tilt in 3D space (a few degrees of perspective rotation on the Y axis, as if the phone is slightly angled toward the viewer). This motion is almost subliminal. The viewer may not consciously register it, but they will feel that the phone is alive.

When a user hovers one of the floating tab cards (described below), the phone screen transitions to show that tab's content. The transition inside the screen should feel like a real app navigation — a slide or a cross-fade, not an abrupt swap. The content preview for each tab:

- **Feed** — shows narrative cards (the default state, what the phone shows on page load)
- **Predict** — shows a market card with YES/NO odds bars and a percentage
- **Trade** — shows a perps interface or a price chart stub
- **Swap** — shows a token swap interface with two token rows and a quote

---

## The Floating Tab Cards

Four cards float around the phone — two on the left, two on the right, or distributed with intentional asymmetry (not perfectly mirrored, which would feel rigid). Each card represents one of the four product tabs. They float in 3D space around the phone with depth — some cards are visually closer to the viewer, some are further back, achieved through scale, opacity, and z-index layering.

Each card has its own slow, continuous float animation. The float cycles are deliberately offset from each other and from the phone's own float cycle — they drift independently, not in sync. This creates a sense that each element is its own object in space rather than part of a synchronized animation group.

**Card anatomy:**

Each card is a compact, self-contained tile — dark background with a subtle border that catches the light (a very thin border using a slightly lighter shade of the background, or a faint glow). Inside the card:

- A small icon or glyph at the top left representing the tab (a signal waveform for Feed, a chart for Predict, an arrow exchange for Trade, a token swap icon for Swap)
- The tab name in a medium-weight, slightly spaced uppercase label
- A one-line description of what that tab does — written as the user benefit, not a feature description. For example, Feed: "Narrative intelligence before the market moves." Predict: "Polymarket odds at a glance." Trade: "Perps, one tap." Swap: "Jupiter liquidity, no fees."
- A small visual element at the bottom of the card — for Feed, a tiny sparkline or a news ticker stub; for Predict, a miniature YES/NO bar; for Trade, a micro price chart; for Swap, two small token symbols with an arrow

**Hover state:**

When the user hovers a card, several things happen simultaneously:

1. The card itself brightens slightly — the border intensifies, the background lifts a shade, a subtle glow spreads behind it
2. The card translates slightly toward the viewer in 3D space (scales up by a small factor, maybe 1.05)
3. The phone screen transitions to show the preview for that tab (described above)
4. The other three cards dim slightly — not disappear, but recede — to reinforce that focus is on the hovered card

When the user moves away from all cards, everything returns to the neutral resting state.

---

## Depth and Atmosphere

The background is not flat black. It has dimension. Options that feel right:

- A very subtle radial gradient centered behind the phone — slightly lighter in the center, fading to near-black at the edges — which creates the impression that the phone and cards are floating in a lit space rather than a void
- A fine dot grid or cross-hair grid at very low opacity (3–5%), receding into the background, providing spatial reference without competing with the foreground content
- Subtle vignetting at the corners

Particle effects or ambient floating elements are acceptable if they reinforce the "intelligence network" feeling — very small dots or lines that slowly drift, suggesting signal flow — but they must stay subordinate to the main composition. If they distract from the phone and cards, they are wrong.

---

## Typography and Copy

Above the phone, a short header — two lines maximum. The first line should be the product name or a minimal identity marker. The second line is the value proposition in the fewest possible words. Something in the spirit of: "The feed the market reads first." or "Narrative intelligence for on-chain traders." The exact copy is not finalized here, but the constraint is: if it takes more than two seconds to read, it is too long.

Below the phone (or below the CTA), a single line of supporting context in a smaller, muted typeface — something that anchors the product in reality. "Powered by Polymarket signals, on-chain flow, and a multi-agent brain." This line is not a CTA. It is evidence.

A single CTA button appears below or alongside the header — "Get Early Access" or "Open App". It should not be styled like a typical web button. It should look like it belongs in the same design language as the product itself — potentially a minimal outlined button with a subtle glow or an arrow indicator.

---

## Responsive Behavior

The hero section is primarily designed for desktop (1280px and above). On tablet widths, the floating cards may collapse to a row below the phone, losing the 3D orbit arrangement but retaining the hover interaction. On mobile widths, the floating cards disappear entirely — the phone mockup becomes full-width, and the tab names appear as a simple scrollable row beneath it. The 3D effects are disabled on touch devices — they rely on hover, which does not translate to touch.

---

## Performance Constraints

All animations must be CSS transform and opacity only — no animations that trigger layout recalculation. The phone screen content (the live previews) is rendered as static HTML snapshots, not iframes or live fetches — this is a marketing page and it must load fast. The 3D perspective effects are achieved with CSS `perspective` and `transform: rotateX/Y` on the container — not WebGL, not Three.js, not a canvas renderer. The goal is a page that loads in under 2 seconds on a standard connection.

---

## Acceptance Criteria

- [ ] `apps/web` exists as a Next.js app, included in pnpm workspace, runnable with `pnpm --filter @myboon/web dev`
- [ ] Hero section renders on desktop with phone mockup centered and four tab cards floating around it
- [ ] Phone has a continuous subtle float animation (vertical drift + slight Y-axis tilt)
- [ ] Each tab card has an independent float animation cycle not synchronized with the others
- [ ] Hovering a tab card brightens that card and changes the phone screen content to that tab's preview
- [ ] Phone screen content transitions smoothly (cross-fade or slide) between tab previews on hover
- [ ] Non-hovered cards dim when one card is hovered; all return to resting state when hover ends
- [ ] Design tokens (colors, typography) match the mobile app's theme file
- [ ] Background has depth — not flat black, includes subtle radial gradient or grid texture
- [ ] All animations use CSS transforms and opacity only (no layout-triggering properties)
- [ ] Page loads without visible layout shift on desktop Chrome
- [ ] On mobile viewport, 3D effects and floating cards are disabled; phone mockup fills width
