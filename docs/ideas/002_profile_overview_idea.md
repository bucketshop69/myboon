# Idea 002 — Profile Overview & App Usage

**Date:** 2026-01-21
**Status:** Draft

## What the idea is

When a wallet connects, display a comprehensive profile overview that identifies and visualizes the specific decentralized applications (dApps) and programs the wallet has used.

Specifically, we want to highlight usage of protocols like:
- Pacific
- Drift
- Meteora
- And others...

The core visualization feature is to plot these interactions **on a candlestick chart** to show where and when valid app usage occurred relative to price action.

## Why it matters

Understanding *where* a user trades relative to market movement is powerful. It allows users to see:
- "I trade momentum on Drift but range-bound on Meteora."
- "My Pacific trades usually catch the tops."
Visualizing protocol usage against price provides context that a simple transaction list lacks.

## Rough steps

1. **Wallet Connection**: Trigger analysis immediately upon wallet connection.
2. **Program Identification**: Scan transaction history to identify interactions with known program IDs (Pacific, Drift, Meteora).
3. **Chart Overlay**: 
   - Load candlestick data for relevant assets.
   - Overlay icons or markers indicating *which* app was used at that specific point in time/price.
