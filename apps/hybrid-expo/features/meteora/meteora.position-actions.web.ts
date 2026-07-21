import type { MeteoraPositionActionsAdapter } from './meteora.position-actions';

const UNAVAILABLE_MESSAGE = 'Managing a Meteora position requires the mobile app.';

/**
 * Signing/submitting a position action (claim, remove, close, add) is
 * genuinely mobile-only — it goes through the native execution controller
 * and Mobile Wallet Adapter — so the `execute*` methods below stay guarded.
 *
 * `prepare*`, however, is a read-only preview: it only needs to validate
 * inputs and report how many on-chain transactions the action will take.
 * Meteora's DLMM actions (claim, remove, close, add) are each a single
 * transaction, matching the native adapter's `transactionCount` values —
 * stubbing this to 0 on web left the action-sheet's "Transaction steps" row
 * stuck showing 0 regardless of the percentage selected (TC-POS-004
 * regression).
 */
export const meteoraPositionActionsAdapter: MeteoraPositionActionsAdapter = {
  async prepareClaim(context, position) {
    if (position.poolAddress !== context.pool.address) {
      throw new Error('The position pool does not match the open pool.');
    }
    return {
      positionAddress: position.positionAddress,
      poolAddress: position.poolAddress,
      transactionCount: 1,
      note: 'Claims all unclaimed fees and rewards on this position. This does not remove liquidity or close the position.',
    };
  },
  async executeClaim() {
    throw new Error(UNAVAILABLE_MESSAGE);
  },
  async prepareRemove(context, position, removeBps, claimAndClose) {
    if (position.poolAddress !== context.pool.address) {
      throw new Error('The position pool does not match the open pool.');
    }
    if (!Number.isInteger(removeBps) || removeBps < 1 || removeBps > 10_000) {
      throw new Error('Removal percentage must be between 1 and 10000 basis points.');
    }
    return {
      positionAddress: position.positionAddress,
      poolAddress: position.poolAddress,
      removeBps,
      claimAndClose,
      transactionCount: 1,
    };
  },
  async executeRemove() {
    throw new Error(UNAVAILABLE_MESSAGE);
  },
  async prepareAdd(context, position, amounts) {
    if (position.poolAddress !== context.pool.address) {
      throw new Error('The position pool does not match the open pool.');
    }
    return {
      positionAddress: position.positionAddress,
      poolAddress: position.poolAddress,
      strategy: 'spot',
      tokenXAtomic: amounts.tokenXAtomic,
      tokenYAtomic: amounts.tokenYAtomic,
      transactionCount: 1,
    };
  },
  async executeAdd() {
    throw new Error(UNAVAILABLE_MESSAGE);
  },
};
