# Idea 005 - Home Canvas Navigation

**Date:** 2026-05-09  
**Status:** Draft

## What the idea is

Replace the current four-tab app structure with a single Home canvas built around three scrolling chapters:

1. **Feed** - the front door where the user understands what is moving.
2. **Markets** - the action surface where prediction markets, perps, and swaps live together.
3. **Wallet** - the ownership surface where positions, balances, activity, and account state live.

The Home screen should feel like the main product experience, not just the first tab. Instead of asking the user to switch between persistent tabs, the app should guide them through a natural flow:

**Feed tells me what matters -> Markets lets me act -> Wallet shows what I own.**

The mockup reference for this direction is:

`docs/mockups/home-no-tabs-codex-v2.html`

That mockup is not intended as a word-for-word or pixel-for-pixel implementation spec. It captures the desired information architecture and navigation model.

## Why it matters

The existing app structure treats Feed, Predict, Trade, and Swap as equal destinations. That is functional, but it makes the product feel like a set of tools sitting beside each other.

The new structure gives myboon a clearer product hierarchy:

- Feed becomes the primary discovery surface.
- Markets becomes the umbrella for all ways to act on a signal.
- Wallet becomes the place to understand ownership, exposure, and outcomes.

This better matches the user's real journey. They usually do not start by thinking "I want the Predict tab" or "I want the Swap tab." They start with a signal, then decide whether there is a market, perp, token, or position worth opening.

## Core structure

### Home

Home is one vertically scrolling surface with three major sections:

- **Feed section:** live narratives, signal cards, and a compact "today across myboon" summary.
- **Markets section:** entry cards for prediction markets, perps, and swap routes, plus featured opportunities from the feed.
- **Wallet section:** net worth, connected venues, open positions, recent activity, and wallet actions.

Each section should have a clear centered identity inside the scroll content. The header can update as the user scrolls, for example:

- `Feed 1/3`
- `Markets 2/3`
- `Wallet 3/3`

### Full routes

The full app areas still exist, but they are reached from route cards and content cards instead of a persistent bottom tab bar:

- Feed cards open narrative details or the full feed route.
- Market cards open prediction, perp, or swap routes.
- Wallet cards open wallet details, positions, activity, or settings.

Detail screens should push on top of Home, and Back should return the user to the same Home scroll position when possible.

## Navigation principles

1. **No persistent bottom tabs**

   The bottom of the screen should belong to the current content, action dock, sheet, keyboard, or detail flow. A permanent nav bar competes with those surfaces.

2. **One app header**

   The header should provide identity and wayfinding, not a row of global actions. It can hold the app mark, active section label, and account/avatar entry.

3. **Markets is the action layer**

   Predict, Trade/Perps, and Swap should be presented as market lanes, not as peer-level tabs. This makes the app feel more coherent and gives Feed a cleaner handoff.

4. **Wayfinding through content**

   Users should learn where they can go through cards, summaries, and section transitions. Route cards should be explicit enough that removing the tab bar does not make the app feel hidden.

5. **Details still behave normally**

   Tapping a narrative, market, token, or position should open a detail screen. The new structure changes top-level navigation, not the expectation that details are focused screens.

## Implementation sketch

The likely implementation direction is:

1. Replace the current feed-only index route with a `HomeScreen`.
2. Remove the global bottom navigation mount from the root layout.
3. Keep existing full routes such as `/predict`, `/trade`, and `/swap`.
4. Add Home section components:
   - `FeedHomeSection`
   - `MarketsHomeSection`
   - `WalletHomeSection`
5. Add route cards from Home into the full app areas.
6. Add scroll-aware section state for the header.
7. Preserve detail navigation and back behavior.

## Open questions

- Should the full Feed route remain separate, or is the Home Feed section enough for the first version?
- Should "Wallet" open the existing drawer, a full screen, or both depending on context?
- How much market data belongs on Home before the user should be pushed into the full Markets route?
- Should Home use a single scroll view for all sections, or a section list with explicit anchors?
- How strongly should the header animate between section identities?

## Color and visual direction notes

This document is mainly about structure. The color system should be discussed separately before implementation.

The current mockup uses the existing myboon teal, deep blue, yellow, green, and red language. That keeps brand continuity, but the final app should avoid feeling like a flat single-hue teal interface. The Home canvas will need enough contrast between Feed, Markets, and Wallet that the user can feel section changes without relying only on text labels.
