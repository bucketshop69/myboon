import {
  type MeteoraExecutionController,
  type MeteoraExecutionError,
  type MeteoraExecutionProgress,
  type MeteoraExecutionRequest,
  type MeteoraExecutionResult,
  type MeteoraExecutionWallet,
  type MeteoraPendingExecution,
  type MeteoraTransactionBundleLike,
  type MeteoraWalletReadiness,
} from './meteora.pending';

export * from './meteora.pending';

export interface MeteoraExecutionDependencies {
  connection?: unknown;
  pendingStore?: unknown;
  pendingStorage?: unknown;
  getWalletSnapshot?: () => MeteoraExecutionWallet;
  explorerBaseUrl?: string;
}

const UNSUPPORTED_MESSAGE = 'Meteora transaction execution is available in the mobile app only.';

function unsupportedError(): MeteoraExecutionError {
  return {
    code: 'EXECUTION_UNSUPPORTED',
    message: UNSUPPORTED_MESSAGE,
    retryable: false,
  };
}

function emitUnsupported<TTransaction, TSigner>(
  request: MeteoraExecutionRequest<TTransaction, TSigner>,
): MeteoraExecutionProgress {
  const progress: MeteoraExecutionProgress = {
    intentId: request.intentId,
    stage: 'unsupported',
    currentStep: 0,
    totalSteps: 0,
    signatures: [],
    explorerUrls: [],
    message: UNSUPPORTED_MESSAGE,
    error: unsupportedError(),
    pending: null,
  };
  request.onProgress?.(progress);
  return progress;
}

function unsupportedResult(
  intentId: string,
  pending: MeteoraPendingExecution | null = null,
): MeteoraExecutionResult {
  return {
    intentId,
    status: 'unsupported',
    signatures: pending?.steps.map((step) => step.signature) ?? [],
    explorerUrls: pending?.steps.map((step) => step.explorerUrl) ?? [],
    resourceAddress: pending?.resourceAddress ?? null,
    pending,
    error: unsupportedError(),
  };
}

export function getMeteoraWalletReadiness(
  wallet: MeteoraExecutionWallet,
): MeteoraWalletReadiness {
  if (wallet.isPreparing) {
    return {
      status: 'wallet_preparing',
      canExecute: false,
      walletAddress: wallet.address,
      message: 'Wallet session is still preparing.',
      requirement: 'wait',
    };
  }
  if (!wallet.connected || !wallet.address) {
    return {
      status: 'disconnected',
      canExecute: false,
      walletAddress: null,
      message: 'Connect a Solana wallet in the mobile app to continue.',
      requirement: 'connect_wallet',
    };
  }
  return {
    status: 'wallet_unsupported',
    canExecute: false,
    walletAddress: wallet.address,
    message: UNSUPPORTED_MESSAGE,
    requirement: 'sign_and_send_transaction',
  };
}

/**
 * Browser-safe execution controller. It never imports web3, the DLMM SDK, or
 * invokes the build callback, so opening the read-only web detail screen cannot
 * pull transaction dependencies into the browser bundle.
 */
export function createMeteoraExecutionController<
  TTransaction = unknown,
  TSigner = unknown,
>(
  _dependencies: MeteoraExecutionDependencies = {},
): MeteoraExecutionController<TTransaction, TSigner> {
  return {
    async execute(request) {
      emitUnsupported(request);
      return unsupportedResult(request.intentId);
    },
    async recover(pending, options) {
      const progress: MeteoraExecutionProgress = {
        intentId: pending.intentId,
        stage: 'unsupported',
        currentStep: pending.steps.length,
        totalSteps: pending.totalSteps,
        signatures: pending.steps.map((step) => step.signature),
        explorerUrls: pending.steps.map((step) => step.explorerUrl),
        message: UNSUPPORTED_MESSAGE,
        error: unsupportedError(),
        pending,
      };
      options?.onProgress?.(progress);
      return unsupportedResult(pending.intentId, pending);
    },
    activeIntentId() {
      return null;
    },
  };
}

// Ensures structural bundle compatibility remains visible to TypeScript users.
export type WebMeteoraTransactionBundle = MeteoraTransactionBundleLike<unknown, unknown>;
