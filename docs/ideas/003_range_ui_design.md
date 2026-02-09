# Idea 003 — Range Visualization UI Design

**Date:** 2026-01-22
**Status:** Draft

## What the idea is

Create a visualization feature that shows Meteora or any LP (Liquidity Provider) range on a line chart or candlestick chart. The visualization should include:

1. A vertical line at the starting point of the candlestick
2. Two horizontal lines extending from that vertical line to show the upper and lower range boundaries
3. Generate unique IDs for each chart element to enable proper tracking and interaction

## Why it matters

LPs need to visualize their active range on price charts to understand when their liquidity is being utilized. This visual representation helps traders see:
- When their positions are active in the market
- How price moves affect their liquidity provision
- The effectiveness of their range selection relative to market volatility

## Rough steps

1. **Chart Integration**: Integrate with the existing candlestick chart implementation to overlay range indicators
2. **Vertical Line Creation**: Draw a vertical line at the specific point where the range begins (typically at the opening of a candle)
3. **Horizontal Range Lines**: From that vertical line, extend two horizontal lines showing the upper and lower bounds of the LP range
4. **ID Generation**: Create unique IDs for each visual element (vertical line, upper horizontal line, lower horizontal line) to enable proper identification and interaction
5. **Styling**: Apply consistent styling that distinguishes the range indicators from the underlying price data
6. **Interactivity**: Allow users to hover over or click on range indicators to see detailed information about the LP position