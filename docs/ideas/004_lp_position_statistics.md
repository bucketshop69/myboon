# Idea 004 — Liquidity Provider Position Statistics

**Date:** 2026-01-22
**Status:** Draft

## What the idea is

Create a detailed statistics panel for liquidity provider positions that calculates and displays performance metrics during active periods. For example, if a position was active for two hours and generated 5% rewards, the system should calculate and display:

- Total duration of the active period (hours, minutes, seconds)
- Total rewards earned during the period
- Earnings per unit time (per minute, per hour, per second)
- Average hourly yield percentage
- Estimated annualized returns based on current performance
- Efficiency metrics showing how well the range matched market movements

## Why it matters

LPs need granular insights into their position performance to make informed decisions about:
- Range optimization for different market conditions
- Capital allocation across different pools
- Timing for rebalancing positions
- Understanding the relationship between time spent in-range and earnings
- Comparing performance across different protocols and timeframes

## Rough steps

1. **Position Tracking**: Monitor active LP positions and record start/end times, price ranges, and reward accumulation
2. **Time-Based Calculations**: Calculate duration metrics (total time active, time in-range, time out-of-range)
3. **Reward Rate Analysis**: Compute earnings rates per minute/hour/second during active periods
4. **Performance Metrics**: Display average hourly yields, estimated APY, and efficiency ratios
5. **Visualization**: Show these metrics in an intuitive dashboard with historical comparisons
6. **Export Options**: Allow users to export performance data for tax or analytical purposes