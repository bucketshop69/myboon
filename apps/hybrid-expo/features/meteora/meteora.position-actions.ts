import type { MeteoraStrategy } from '@myboon/shared/meteora';
import type { MeteoraExecutionUpdate, MeteoraExecuteResult, MeteoraPrepareContext } from './meteora.form';

/**
 * Beta position-management actions launched from the Profile action sheet:
 * Claim fees, Remove liquidity (partial or full), and Close position.
 *
 * These are lighter than the pool-detail create/limit-order preview cycle —
 * "here's what you'll get", not a full multi-quote preview — but they still
 * build, simulate, sign, submit, confirm, and reconcile through the same
 * execution controller used by create/add.
 */

export interface MeteoraPositionSummary {
  positionAddress: string;
  poolAddress: string;
  lowerBinId: number;
  upperBinId: number;
  activeBinId: number | null;
  isOutOfRange: boolean | null;
}

export interface MeteoraClaimPreview {
  positionAddress: string;
  poolAddress: string;
  transactionCount: number;
  note: string;
}

export interface MeteoraRemovePreview {
  positionAddress: string;
  poolAddress: string;
  removeBps: number;
  claimAndClose: boolean;
  transactionCount: number;
}

export interface MeteoraAddLiquidityPreview {
  positionAddress: string;
  poolAddress: string;
  strategy: MeteoraStrategy;
  tokenXAtomic: string;
  tokenYAtomic: string;
  transactionCount: number;
}

export interface MeteoraPositionActionsAdapter {
  prepareClaim(
    context: MeteoraPrepareContext,
    position: MeteoraPositionSummary,
  ): Promise<MeteoraClaimPreview>;
  executeClaim(
    context: MeteoraPrepareContext,
    preview: MeteoraClaimPreview,
    onProgress?: (update: MeteoraExecutionUpdate) => void,
  ): Promise<MeteoraExecuteResult>;
  prepareRemove(
    context: MeteoraPrepareContext,
    position: MeteoraPositionSummary,
    removeBps: number,
    claimAndClose: boolean,
  ): Promise<MeteoraRemovePreview>;
  executeRemove(
    context: MeteoraPrepareContext,
    preview: MeteoraRemovePreview,
    onProgress?: (update: MeteoraExecutionUpdate) => void,
  ): Promise<MeteoraExecuteResult>;
  /**
   * Adds liquidity to an existing position. Meteora's position read API does
   * not expose the distribution strategy the position was originally
   * created with, so beta defaults added liquidity to Spot (even
   * distribution) regardless of the position's original strategy — see the
   * note surfaced to the caller. This is a known limitation, not a bug in
   * buildAddLiquidity itself.
   */
  prepareAdd(
    context: MeteoraPrepareContext,
    position: MeteoraPositionSummary,
    amounts: { tokenXAtomic: string; tokenYAtomic: string },
  ): Promise<MeteoraAddLiquidityPreview>;
  executeAdd(
    context: MeteoraPrepareContext,
    preview: MeteoraAddLiquidityPreview,
    onProgress?: (update: MeteoraExecutionUpdate) => void,
  ): Promise<MeteoraExecuteResult>;
}

const UNAVAILABLE_MESSAGE = 'Managing a Meteora position is not available on this platform yet.';

/**
 * Generic (non-native, non-web) fallback — Metro resolves `.native.ts` or
 * `.web.ts` before this file on device/browser builds. This guarded
 * implementation exists so the module still type-checks and behaves safely
 * under tooling (tsc, tests) that doesn't apply platform resolution.
 */
export const meteoraPositionActionsAdapter: MeteoraPositionActionsAdapter = {
  async prepareClaim(context, position) {
    return {
      positionAddress: position.positionAddress,
      poolAddress: position.poolAddress,
      transactionCount: 0,
      note: UNAVAILABLE_MESSAGE,
    };
  },
  async executeClaim() {
    throw new Error(UNAVAILABLE_MESSAGE);
  },
  async prepareRemove(context, position, removeBps, claimAndClose) {
    return {
      positionAddress: position.positionAddress,
      poolAddress: position.poolAddress,
      removeBps,
      claimAndClose,
      transactionCount: 0,
    };
  },
  async executeRemove() {
    throw new Error(UNAVAILABLE_MESSAGE);
  },
  async prepareAdd(context, position, amounts) {
    return {
      positionAddress: position.positionAddress,
      poolAddress: position.poolAddress,
      strategy: 'spot',
      tokenXAtomic: amounts.tokenXAtomic,
      tokenYAtomic: amounts.tokenYAtomic,
      transactionCount: 0,
    };
  },
  async executeAdd() {
    throw new Error(UNAVAILABLE_MESSAGE);
  },
};
