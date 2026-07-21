import {
  Keypair,
  PublicKey,
  Transaction,
  type BlockhashWithExpiryBlockHeight,
  type Commitment,
  type SignatureResult,
  type SignatureStatus,
} from '@solana/web3.js';
import {
  createMeteoraPendingStore,
  type MeteoraExecutionController,
  type MeteoraExecutionError,
  type MeteoraExecutionErrorCode,
  type MeteoraExecutionProgress,
  type MeteoraExecutionRequest,
  type MeteoraExecutionResult,
  type MeteoraExecutionStage,
  type MeteoraExecutionWallet,
  type MeteoraPendingExecution,
  type MeteoraPendingStatus,
  type MeteoraPendingStep,
  type MeteoraPendingStorage,
  type MeteoraPendingStore,
  type MeteoraReconcileContext,
  type MeteoraTransactionBundleLike,
  type MeteoraWalletReadiness,
} from './meteora.pending';

export * from './meteora.pending';

type SimulationResponse = {
  value: {
    err: unknown;
    logs?: string[] | null;
  };
};

type ConfirmationResponse = { value: SignatureResult };
type SignatureStatusesResponse = { value: (SignatureStatus | null)[] };

export interface MeteoraExecutionConnection {
  getLatestBlockhash(commitment?: Commitment): Promise<BlockhashWithExpiryBlockHeight>;
  simulateTransaction(transaction: Transaction): Promise<SimulationResponse>;
  confirmTransaction(
    strategy: {
      signature: string;
      blockhash: string;
      lastValidBlockHeight: number;
    },
    commitment?: Commitment,
  ): Promise<ConfirmationResponse>;
  getSignatureStatuses(
    signatures: string[],
    config?: { searchTransactionHistory?: boolean },
  ): Promise<SignatureStatusesResponse>;
  getBlockHeight?(commitment?: Commitment): Promise<number>;
}

export interface MeteoraExecutionDependencies {
  connection: MeteoraExecutionConnection;
  pendingStore?: MeteoraPendingStore;
  pendingStorage?: MeteoraPendingStorage;
  getWalletSnapshot?: () => MeteoraExecutionWallet<Transaction>;
  commitment?: Commitment;
  confirmationTimeoutMs?: number;
  maxTransactions?: number;
  explorerBaseUrl?: string;
  now?: () => number;
}

export type NativeMeteoraExecutionRequest = MeteoraExecutionRequest<Transaction, Keypair>;
export type NativeMeteoraExecutionController = MeteoraExecutionController<Transaction, Keypair>;

const activeWalletScopes = new Map<string, string>();
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TRANSACTIONS = 10;

class MeteoraExecutionFailure extends Error {
  constructor(
    readonly code: MeteoraExecutionErrorCode,
    message: string,
    readonly retryable = false,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MeteoraExecutionFailure';
  }
}

export function createNativeMeteoraPendingStorage(): MeteoraPendingStorage {
  async function storage() {
    const module = await import('@react-native-async-storage/async-storage');
    return module.default;
  }

  return {
    async getItem(key) {
      return (await storage()).getItem(key);
    },
    async setItem(key, value) {
      await (await storage()).setItem(key, value);
    },
    async removeItem(key) {
      await (await storage()).removeItem(key);
    },
  };
}

function toExecutionError(error: unknown): MeteoraExecutionError {
  if (error instanceof MeteoraExecutionFailure) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      cause: error.cause,
    };
  }

  return {
    code: 'TX_SEND_FAILED',
    message: error instanceof Error ? error.message : 'Meteora execution failed.',
    retryable: false,
    cause: error,
  };
}

function result(
  intentId: string,
  status: MeteoraExecutionStage,
  signatures: string[],
  explorerUrls: string[],
  resourceAddress: string | null,
  pending: MeteoraPendingExecution | null,
  error: MeteoraExecutionError | null,
): MeteoraExecutionResult {
  return {
    intentId,
    status,
    signatures,
    explorerUrls,
    resourceAddress,
    pending,
    error,
  };
}

function walletScope(network: string, address: string): string {
  return `${network}:${address.trim().toLowerCase()}`;
}

function parseExpiry(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date
    ? value.getTime()
    : typeof value === 'number'
      ? value
      : Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new MeteoraExecutionFailure('INVALID_REQUEST', 'Execution expiry is invalid.');
  }
  return parsed;
}

function earliestExpiry(
  requestValue: string | number | Date | null | undefined,
  bundleValue: string | undefined,
): number | null {
  const values = [parseExpiry(requestValue), parseExpiry(bundleValue)].filter(
    (value): value is number => value !== null,
  );
  return values.length ? Math.min(...values) : null;
}

function assertNotExpired(expiresAt: number | null, now: number): void {
  if (expiresAt !== null && now >= expiresAt) {
    throw new MeteoraExecutionFailure(
      'PREVIEW_EXPIRED',
      'The Meteora preview expired before submission. Refresh it before trying again.',
      true,
    );
  }
}

function normalizeSignature(value: string | { signature?: string | null }): string {
  const signature = typeof value === 'string' ? value : value.signature;
  if (!signature || typeof signature !== 'string') {
    throw new MeteoraExecutionFailure(
      'TX_SEND_FAILED',
      'The wallet did not return a transaction signature.',
    );
  }
  return signature;
}

function isWalletRejection(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (code === 4001 || code === '4001' || code === 'WALLET_REJECTED') return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /reject|declin|denied|cancel(?:led|ed)? by (?:the )?user/i.test(message);
}

function explorerUrl(baseUrl: string, signature: string, network: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';
  return `${root}/tx/${encodeURIComponent(signature)}${cluster}`;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown on-chain error';
  }
}

function emitProgress(
  request: Pick<NativeMeteoraExecutionRequest, 'intentId' | 'onProgress'>,
  stage: MeteoraExecutionStage,
  currentStep: number,
  totalSteps: number,
  signatures: string[],
  explorerUrls: string[],
  message: string,
  error: MeteoraExecutionError | null = null,
  pending: MeteoraPendingExecution | null = null,
): MeteoraExecutionProgress {
  const progress: MeteoraExecutionProgress = {
    intentId: request.intentId,
    stage,
    currentStep,
    totalSteps,
    signatures: [...signatures],
    explorerUrls: [...explorerUrls],
    message,
    error,
    pending,
  };
  request.onProgress?.(progress);
  return progress;
}

function validateRequest(request: NativeMeteoraExecutionRequest): PublicKey {
  if (!request.intentId.trim() || request.intentId.length > 160) {
    throw new MeteoraExecutionFailure('INVALID_REQUEST', 'A valid execution intent ID is required.');
  }
  if (!request.poolAddress.trim() || !request.action.trim()) {
    throw new MeteoraExecutionFailure('INVALID_REQUEST', 'Pool address and action are required.');
  }

  const readiness = getMeteoraWalletReadiness(request.wallet);
  if (readiness.status === 'wallet_preparing') {
    throw new MeteoraExecutionFailure('WALLET_PREPARING', readiness.message, true);
  }
  if (readiness.status === 'disconnected') {
    throw new MeteoraExecutionFailure('WALLET_DISCONNECTED', readiness.message, true);
  }
  if (readiness.status === 'wallet_unsupported') {
    throw new MeteoraExecutionFailure('WALLET_TX_UNSUPPORTED', readiness.message);
  }

  try {
    return new PublicKey(readiness.walletAddress as string);
  } catch (cause) {
    throw new MeteoraExecutionFailure(
      'INVALID_REQUEST',
      'The connected wallet address is not a valid Solana address.',
      false,
      cause,
    );
  }
}

function validateBundle(
  request: NativeMeteoraExecutionRequest,
  bundle: MeteoraTransactionBundleLike<Transaction, Keypair>,
  maxTransactions: number,
): void {
  if (bundle.poolAddress !== request.poolAddress) {
    throw new MeteoraExecutionFailure(
      'INVALID_TRANSACTION_PLAN',
      'The transaction plan does not match the selected pool.',
    );
  }
  if (bundle.action !== request.action) {
    throw new MeteoraExecutionFailure(
      'INVALID_TRANSACTION_PLAN',
      'The transaction plan does not match the requested action.',
    );
  }
  if (
    !Array.isArray(bundle.transactions)
    || bundle.transactions.length < 1
    || bundle.transactions.length > maxTransactions
    || bundle.transactions.some((transaction) => !(transaction instanceof Transaction))
  ) {
    throw new MeteoraExecutionFailure(
      'INVALID_TRANSACTION_PLAN',
      `The transaction plan must contain between 1 and ${maxTransactions} legacy Solana transactions.`,
    );
  }
  if (
    !Array.isArray(bundle.additionalSigners)
    || bundle.additionalSigners.some((signer) => !(signer instanceof Keypair))
  ) {
    throw new MeteoraExecutionFailure(
      'INVALID_TRANSACTION_PLAN',
      'The transaction plan contains an invalid additional signer.',
    );
  }
}

function requiredAdditionalSigners(
  transaction: Transaction,
  walletAddress: string,
  additionalSigners: Keypair[],
): Keypair[] {
  const required = new Set<string>();
  for (const instruction of transaction.instructions) {
    for (const account of instruction.keys) {
      if (account.isSigner) required.add(account.pubkey.toBase58());
    }
  }
  required.delete(walletAddress);
  if (!required.size) return [];

  const signerByAddress = new Map(
    additionalSigners.map((signer) => [signer.publicKey.toBase58(), signer]),
  );
  const matching: Keypair[] = [];
  for (const address of required) {
    const signer = signerByAddress.get(address);
    if (!signer) {
      throw new MeteoraExecutionFailure(
        'MISSING_REQUIRED_SIGNER',
        `The transaction plan is missing required signer ${address}.`,
      );
    }
    matching.push(signer);
  }
  return matching;
}

function checkWalletScope(
  expectedAddress: string,
  getWalletSnapshot: (() => MeteoraExecutionWallet<Transaction>) | undefined,
): void {
  if (!getWalletSnapshot) return;
  const current = getWalletSnapshot();
  if (!current.connected || !current.address || current.address !== expectedAddress) {
    throw new MeteoraExecutionFailure(
      'WALLET_CHANGED',
      'The connected wallet changed during execution. The transaction was not sent.',
    );
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new MeteoraExecutionFailure(
            'CONFIRMATION_UNKNOWN',
            'Confirmation timed out. Check the transaction before retrying.',
            true,
          ));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function confirmedStatus(status: SignatureStatus | null): boolean {
  return status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized';
}

async function inspectSignature(
  connection: MeteoraExecutionConnection,
  signature: string,
): Promise<'confirmed' | 'failed' | 'unknown'> {
  try {
    const statuses = await connection.getSignatureStatuses(
      [signature],
      { searchTransactionHistory: true },
    );
    const status = statuses.value[0] ?? null;
    if (status?.err) return 'failed';
    if (confirmedStatus(status)) return 'confirmed';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function terminalStatusFor(
  failureStage: MeteoraExecutionStage,
  confirmedSteps: number,
): MeteoraExecutionStage {
  return confirmedSteps > 0 ? 'partially_complete' : failureStage;
}

function pendingStatusFor(stage: MeteoraExecutionStage): MeteoraPendingStatus {
  if (stage === 'confirmation_unknown') return 'confirmation_unknown';
  if (stage === 'partially_complete') return 'partially_complete';
  if (stage === 'onchain_failed') return 'onchain_failed';
  if (stage === 'confirmed_syncing') return 'confirmed_syncing';
  if (stage === 'confirming') return 'confirming';
  return 'submitted';
}

async function persistBestEffort(
  store: MeteoraPendingStore,
  pending: MeteoraPendingExecution,
): Promise<void> {
  try {
    await store.save(pending);
  } catch (error) {
    // Never turn a known submitted signature into a retryable send failure.
    console.error('[meteora][execution][pending-save-failed]', {
      intentId: pending.intentId,
      signatures: pending.steps.map((step) => step.signature),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function reconcileContext(pending: MeteoraPendingExecution): MeteoraReconcileContext {
  return {
    intentId: pending.intentId,
    network: pending.network,
    walletAddress: pending.walletAddress,
    poolAddress: pending.poolAddress,
    action: pending.action,
    resourceAddress: pending.resourceAddress,
    signatures: pending.steps.map((step) => step.signature),
  };
}

export function getMeteoraWalletReadiness(
  wallet: MeteoraExecutionWallet<Transaction>,
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
      message: 'Connect a Solana wallet to continue.',
      requirement: 'connect_wallet',
    };
  }
  if (typeof wallet.signAndSendTransaction !== 'function') {
    return {
      status: 'wallet_unsupported',
      canExecute: false,
      walletAddress: wallet.address,
      message: 'Meteora execution requires a Solana wallet that can sign and send transactions.',
      requirement: 'sign_and_send_transaction',
    };
  }
  return {
    status: 'ready',
    canExecute: true,
    walletAddress: wallet.address,
    message: 'Wallet is ready for Meteora execution.',
    requirement: null,
  };
}

export function createMeteoraExecutionController(
  dependencies: MeteoraExecutionDependencies,
): NativeMeteoraExecutionController {
  const pendingStore = dependencies.pendingStore ?? createMeteoraPendingStore(
    dependencies.pendingStorage ?? createNativeMeteoraPendingStorage(),
  );
  const commitment = dependencies.commitment ?? 'confirmed';
  const confirmationTimeoutMs = dependencies.confirmationTimeoutMs
    ?? DEFAULT_CONFIRMATION_TIMEOUT_MS;
  const maxTransactions = dependencies.maxTransactions ?? DEFAULT_MAX_TRANSACTIONS;
  const explorerBaseUrl = dependencies.explorerBaseUrl ?? 'https://explorer.solana.com';
  const now = dependencies.now ?? Date.now;
  let activeIntent: string | null = null;

  async function execute(request: NativeMeteoraExecutionRequest): Promise<MeteoraExecutionResult> {
    let walletPublicKey: PublicKey;
    let bundle: MeteoraTransactionBundleLike<Transaction, Keypair> | null = null;
    let pending: MeteoraPendingExecution | null = null;
    let expiresAt: number | null = null;
    let scope: string | null = null;
    const signatures: string[] = [];
    const explorerUrls: string[] = [];
    let confirmedSteps = 0;

    emitProgress(request, 'validation', 0, 0, signatures, explorerUrls, 'Validating execution.');

    try {
      walletPublicKey = validateRequest(request);
      expiresAt = parseExpiry(request.expiresAt);
      assertNotExpired(expiresAt, now());
      scope = walletScope(request.network, walletPublicKey.toBase58());

      if (activeIntent !== null || activeWalletScopes.has(scope)) {
        throw new MeteoraExecutionFailure(
          'DUPLICATE_ACTIVE_INTENT',
          'Another Meteora execution is already active for this wallet.',
          true,
        );
      }
      // Reserve synchronously before the first await so two controllers cannot
      // both pass the duplicate check for the same wallet.
      activeIntent = request.intentId;
      activeWalletScopes.set(scope, request.intentId);

      const persistedActive = await pendingStore.findActive(walletPublicKey.toBase58(), request.network);
      if (persistedActive) {
        throw new MeteoraExecutionFailure(
          'DUPLICATE_ACTIVE_INTENT',
          'A submitted Meteora transaction still needs confirmation or recovery.',
          true,
        );
      }

      emitProgress(request, 'building', 0, 0, signatures, explorerUrls, 'Building transaction plan.');
      try {
        bundle = await request.build();
      } catch (cause) {
        throw new MeteoraExecutionFailure(
          'BUILD_FAILED',
          cause instanceof Error ? cause.message : 'Failed to build the Meteora transaction plan.',
          true,
          cause,
        );
      }

      validateBundle(request, bundle, maxTransactions);
      expiresAt = earliestExpiry(request.expiresAt, bundle.expiresAt);
      assertNotExpired(expiresAt, now());
      await request.validate?.(bundle);

      const totalSteps = bundle.transactions.length;
      for (let index = 0; index < totalSteps; index += 1) {
        // Preview expiry blocks the first submission. Once a multi-step plan
        // has started, continue its already-built, sequentially simulated
        // transactions so the user is not stranded after an earlier confirm.
        if (index === 0) assertNotExpired(expiresAt, now());
        checkWalletScope(walletPublicKey.toBase58(), dependencies.getWalletSnapshot);

        const transaction = bundle.transactions[index] as Transaction;
        const latest = await dependencies.connection.getLatestBlockhash(commitment);
        transaction.feePayer = walletPublicKey;
        transaction.recentBlockhash = latest.blockhash;
        transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
        transaction.signatures = [];

        const requiredSigners = requiredAdditionalSigners(
          transaction,
          walletPublicKey.toBase58(),
          bundle.additionalSigners,
        );
        if (requiredSigners.length) transaction.partialSign(...requiredSigners);

        emitProgress(
          request,
          'simulating',
          index + 1,
          totalSteps,
          signatures,
          explorerUrls,
          `Simulating transaction ${index + 1} of ${totalSteps}.`,
          null,
          pending,
        );
        let simulation: SimulationResponse;
        try {
          simulation = await dependencies.connection.simulateTransaction(transaction);
        } catch (cause) {
          throw new MeteoraExecutionFailure(
            'SIMULATION_FAILED',
            'Transaction simulation could not be completed.',
            true,
            cause,
          );
        }
        if (simulation.value.err) {
          throw new MeteoraExecutionFailure(
            'SIMULATION_FAILED',
            `Transaction simulation failed: ${errorMessage(simulation.value.err)}`,
            false,
            simulation.value,
          );
        }

        if (index === 0) assertNotExpired(expiresAt, now());
        if (dependencies.connection.getBlockHeight) {
          const blockHeight = await dependencies.connection.getBlockHeight(commitment);
          if (blockHeight > latest.lastValidBlockHeight) {
            throw new MeteoraExecutionFailure(
              'BLOCKHASH_EXPIRED',
              'The transaction blockhash expired before the wallet prompt.',
              true,
            );
          }
        }
        checkWalletScope(walletPublicKey.toBase58(), dependencies.getWalletSnapshot);

        if (!pending) {
          const preparedAt = now();
          pending = {
            version: 1,
            intentId: request.intentId,
            planId: bundle.planId ?? null,
            previewId: bundle.previewId ?? null,
            walletAddress: walletPublicKey.toBase58(),
            network: request.network,
            poolAddress: request.poolAddress,
            action: request.action,
            resourceAddress: bundle.resourceAddress,
            status: 'prepared',
            totalSteps,
            steps: [],
            createdAt: preparedAt,
            updatedAt: preparedAt,
            expiresAt,
            preparedBlockhash: latest.blockhash,
            preparedLastValidBlockHeight: latest.lastValidBlockHeight,
          };
          try {
            await pendingStore.save(pending);
          } catch (cause) {
            pending = null;
            throw new MeteoraExecutionFailure(
              'PENDING_PERSIST_FAILED',
              'Transaction recovery metadata could not be saved. No wallet request was opened.',
              true,
              cause,
            );
          }
        }

        emitProgress(
          request,
          'awaiting_wallet',
          index + 1,
          totalSteps,
          signatures,
          explorerUrls,
          `Approve transaction ${index + 1} of ${totalSteps} in your wallet.`,
          null,
          pending,
        );

        let signature: string;
        try {
          signature = normalizeSignature(
            await (request.wallet.signAndSendTransaction as NonNullable<
              NativeMeteoraExecutionRequest['wallet']['signAndSendTransaction']
            >)(transaction),
          );
        } catch (cause) {
          if (isWalletRejection(cause)) {
            throw new MeteoraExecutionFailure(
              'WALLET_REJECTED',
              'The wallet request was rejected. Your inputs are unchanged.',
              true,
              cause,
            );
          }
          throw new MeteoraExecutionFailure(
            'TX_SEND_FAILED',
            cause instanceof Error ? cause.message : 'The wallet could not send the transaction.',
            false,
            cause,
          );
        }

        const submittedAt = now();
        const url = explorerUrl(explorerBaseUrl, signature, request.network);
        signatures.push(signature);
        explorerUrls.push(url);
        const pendingStep: MeteoraPendingStep = {
          index,
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
          status: 'submitted',
          submittedAt,
          confirmedAt: null,
          explorerUrl: url,
          errorCode: null,
        };
        pending.steps.push(pendingStep);
        pending.status = 'submitted';
        pending.updatedAt = submittedAt;
        await persistBestEffort(pendingStore, pending);
        emitProgress(
          request,
          'submitted',
          index + 1,
          totalSteps,
          signatures,
          explorerUrls,
          `Transaction ${index + 1} of ${totalSteps} submitted.`,
          null,
          pending,
        );

        pending.status = 'confirming';
        pending.updatedAt = now();
        await persistBestEffort(pendingStore, pending);
        emitProgress(
          request,
          'confirming',
          index + 1,
          totalSteps,
          signatures,
          explorerUrls,
          `Confirming transaction ${index + 1} of ${totalSteps}.`,
          null,
          pending,
        );

        try {
          const confirmation = await withTimeout(
            dependencies.connection.confirmTransaction({
              signature,
              blockhash: latest.blockhash,
              lastValidBlockHeight: latest.lastValidBlockHeight,
            }, commitment),
            confirmationTimeoutMs,
          );
          if (confirmation.value.err) {
            pendingStep.status = 'onchain_failed';
            pendingStep.errorCode = 'ONCHAIN_FAILED';
            throw new MeteoraExecutionFailure(
              'ONCHAIN_FAILED',
              `Transaction failed on-chain: ${errorMessage(confirmation.value.err)}`,
              false,
              confirmation.value.err,
            );
          }
        } catch (cause) {
          if (cause instanceof MeteoraExecutionFailure && cause.code === 'ONCHAIN_FAILED') {
            throw cause;
          }
          const inspected = await inspectSignature(dependencies.connection, signature);
          if (inspected === 'failed') {
            pendingStep.status = 'onchain_failed';
            pendingStep.errorCode = 'ONCHAIN_FAILED';
            throw new MeteoraExecutionFailure(
              'ONCHAIN_FAILED',
              'The submitted transaction failed on-chain.',
              false,
              cause,
            );
          }
          if (inspected !== 'confirmed') {
            pendingStep.status = 'confirmation_unknown';
            pendingStep.errorCode = 'CONFIRMATION_UNKNOWN';
            throw new MeteoraExecutionFailure(
              'CONFIRMATION_UNKNOWN',
              'Confirmation is unknown. Check the saved signature before taking another action.',
              true,
              cause,
            );
          }
        }

        pendingStep.status = 'confirmed';
        pendingStep.confirmedAt = now();
        pendingStep.errorCode = null;
        confirmedSteps += 1;
        pending.updatedAt = now();
        pending.status = index === totalSteps - 1 ? 'confirmed_syncing' : 'confirming';
        await persistBestEffort(pendingStore, pending);
      }

      if (!pending || !bundle) {
        throw new MeteoraExecutionFailure(
          'INVALID_TRANSACTION_PLAN',
          'The transaction plan did not submit any transactions.',
        );
      }

      emitProgress(
        request,
        'confirmed_syncing',
        pending.totalSteps,
        pending.totalSteps,
        signatures,
        explorerUrls,
        'Confirmed on-chain — syncing position or order.',
        null,
        pending,
      );

      if (request.reconcile) {
        try {
          const reconciled = await request.reconcile(reconcileContext(pending));
          if (reconciled === false) {
            pending.status = 'confirmed_syncing';
            pending.updatedAt = now();
            await persistBestEffort(pendingStore, pending);
            const syncError: MeteoraExecutionError = {
              code: 'SYNC_PENDING',
              message: 'Confirmed on-chain. The position or order is still syncing.',
              retryable: true,
            };
            return result(
              request.intentId,
              'confirmed_syncing',
              signatures,
              explorerUrls,
              bundle.resourceAddress,
              pending,
              syncError,
            );
          }
        } catch (cause) {
          pending.status = 'confirmed_syncing';
          pending.updatedAt = now();
          await persistBestEffort(pendingStore, pending);
          const syncError: MeteoraExecutionError = {
            code: 'SYNC_FAILED',
            message: 'Confirmed on-chain, but position or order sync failed.',
            retryable: true,
            cause,
          };
          return result(
            request.intentId,
            'confirmed_syncing',
            signatures,
            explorerUrls,
            bundle.resourceAddress,
            pending,
            syncError,
          );
        }
      }

      await pendingStore.remove(request.intentId);
      emitProgress(
        request,
        'complete',
        pending.totalSteps,
        pending.totalSteps,
        signatures,
        explorerUrls,
        'Meteora execution complete.',
      );
      return result(
        request.intentId,
        'complete',
        signatures,
        explorerUrls,
        bundle.resourceAddress,
        null,
        null,
      );
    } catch (cause) {
      const executionError = toExecutionError(cause);
      let failureStage: MeteoraExecutionStage;
      if (executionError.code === 'WALLET_REJECTED') failureStage = 'wallet_rejected';
      else if (executionError.code === 'PREVIEW_EXPIRED' || executionError.code === 'BLOCKHASH_EXPIRED') {
        failureStage = 'expired_before_submit';
      } else if (executionError.code === 'SIMULATION_FAILED') failureStage = 'simulation_failed';
      else if (executionError.code === 'ONCHAIN_FAILED') failureStage = 'onchain_failed';
      else if (executionError.code === 'CONFIRMATION_UNKNOWN') failureStage = 'confirmation_unknown';
      else failureStage = 'failed';

      const status = terminalStatusFor(failureStage, confirmedSteps);
      if (pending) {
        if (pending.steps.length === 0 && executionError.code === 'WALLET_REJECTED') {
          await pendingStore.remove(pending.intentId);
          pending = null;
        } else {
          pending.status = pending.steps.length === 0
            ? 'confirmation_unknown'
            : pendingStatusFor(status);
          pending.updatedAt = now();
          const lastStep = pending.steps[pending.steps.length - 1];
          if (lastStep && lastStep.status === 'submitted') {
            if (executionError.code === 'ONCHAIN_FAILED') lastStep.status = 'onchain_failed';
            if (executionError.code === 'CONFIRMATION_UNKNOWN') lastStep.status = 'confirmation_unknown';
            lastStep.errorCode = executionError.code;
          }
          await persistBestEffort(pendingStore, pending);
        }
      }
      emitProgress(
        request,
        status,
        pending?.steps.length ?? 0,
        bundle?.transactions.length ?? 0,
        signatures,
        explorerUrls,
        executionError.message,
        executionError,
        pending,
      );
      return result(
        request.intentId,
        status,
        signatures,
        explorerUrls,
        bundle?.resourceAddress ?? null,
        pending,
        executionError,
      );
    } finally {
      if (scope && activeWalletScopes.get(scope) === request.intentId) {
        activeWalletScopes.delete(scope);
      }
      if (activeIntent === request.intentId) activeIntent = null;
      // Ephemeral signers remain reachable only through the local bundle and
      // are released here. They are never serialized or persisted.
      bundle = null;
    }
  }

  async function recover(
    pending: MeteoraPendingExecution,
    options: Parameters<NativeMeteoraExecutionController['recover']>[1] = {},
  ): Promise<MeteoraExecutionResult> {
    const request = {
      intentId: pending.intentId,
      onProgress: options?.onProgress,
    };
    const signatures = pending.steps.map((step) => step.signature);
    const urls = pending.steps.map((step) => step.explorerUrl);

    if (
      (options?.walletAddress && options.walletAddress !== pending.walletAddress)
      || (options?.network && options.network !== pending.network)
    ) {
      const executionError: MeteoraExecutionError = {
        code: 'WALLET_CHANGED',
        message: 'Pending execution belongs to a different wallet or network.',
        retryable: false,
      };
      emitProgress(
        request,
        'failed',
        pending.steps.length,
        pending.totalSteps,
        signatures,
        urls,
        executionError.message,
        executionError,
        pending,
      );
      return result(
        pending.intentId,
        'failed',
        signatures,
        urls,
        pending.resourceAddress,
        pending,
        executionError,
      );
    }

    emitProgress(
      request,
      'confirming',
      pending.steps.length,
      pending.totalSteps,
      signatures,
      urls,
      'Rechecking submitted Meteora transaction signatures.',
      null,
      pending,
    );

    if (pending.steps.length === 0) {
      let visible = false;
      if (options?.reconcile) {
        try {
          visible = (await options.reconcile(reconcileContext(pending))) === true;
        } catch {
          visible = false;
        }
      }
      if (visible) {
        await pendingStore.remove(pending.intentId);
        emitProgress(
          request,
          'complete',
          0,
          pending.totalSteps,
          signatures,
          urls,
          'Meteora resource found on-chain. Recovery complete.',
        );
        return result(
          pending.intentId,
          'complete',
          signatures,
          urls,
          pending.resourceAddress,
          null,
          null,
        );
      }
      if (
        pending.preparedLastValidBlockHeight !== null
        && dependencies.connection.getBlockHeight
      ) {
        const currentBlockHeight = await dependencies.connection.getBlockHeight(commitment);
        if (currentBlockHeight > pending.preparedLastValidBlockHeight) {
          await pendingStore.remove(pending.intentId);
          const executionError: MeteoraExecutionError = {
            code: 'BLOCKHASH_EXPIRED',
            message: 'No submitted resource was found and the prepared blockhash expired. It is safe to build again.',
            retryable: true,
          };
          emitProgress(
            request,
            'expired_before_submit',
            0,
            pending.totalSteps,
            signatures,
            urls,
            executionError.message,
            executionError,
            null,
          );
          return result(
            pending.intentId,
            'expired_before_submit',
            signatures,
            urls,
            pending.resourceAddress,
            null,
            executionError,
          );
        }
      }
      pending.status = 'confirmation_unknown';
      pending.updatedAt = now();
      await persistBestEffort(pendingStore, pending);
      const executionError: MeteoraExecutionError = {
        code: 'CONFIRMATION_UNKNOWN',
        message: 'Wallet handoff began, but no signature was saved. Checking the public resource before any retry.',
        retryable: true,
      };
      emitProgress(
        request,
        'confirmation_unknown',
        0,
        pending.totalSteps,
        signatures,
        urls,
        executionError.message,
        executionError,
        pending,
      );
      return result(
        pending.intentId,
        'confirmation_unknown',
        signatures,
        urls,
        pending.resourceAddress,
        pending,
        executionError,
      );
    }

    let confirmed = 0;
    for (const step of pending.steps) {
      const inspected = await inspectSignature(dependencies.connection, step.signature);
      if (inspected === 'failed') {
        step.status = 'onchain_failed';
        step.errorCode = 'ONCHAIN_FAILED';
        pending.status = confirmed > 0 ? 'partially_complete' : 'onchain_failed';
        pending.updatedAt = now();
        await persistBestEffort(pendingStore, pending);
        const executionError: MeteoraExecutionError = {
          code: 'ONCHAIN_FAILED',
          message: 'A submitted Meteora transaction failed on-chain.',
          retryable: false,
        };
        const status = confirmed > 0 ? 'partially_complete' : 'onchain_failed';
        emitProgress(
          request,
          status,
          confirmed,
          pending.totalSteps,
          signatures,
          urls,
          executionError.message,
          executionError,
          pending,
        );
        return result(
          pending.intentId,
          status,
          signatures,
          urls,
          pending.resourceAddress,
          pending,
          executionError,
        );
      }
      if (inspected === 'unknown') {
        step.status = 'confirmation_unknown';
        step.errorCode = 'CONFIRMATION_UNKNOWN';
        pending.status = confirmed > 0 ? 'partially_complete' : 'confirmation_unknown';
        pending.updatedAt = now();
        await persistBestEffort(pendingStore, pending);
        const executionError: MeteoraExecutionError = {
          code: 'CONFIRMATION_UNKNOWN',
          message: 'Confirmation remains unknown. The transaction was not resent.',
          retryable: true,
        };
        const status = confirmed > 0 ? 'partially_complete' : 'confirmation_unknown';
        emitProgress(
          request,
          status,
          confirmed,
          pending.totalSteps,
          signatures,
          urls,
          executionError.message,
          executionError,
          pending,
        );
        return result(
          pending.intentId,
          status,
          signatures,
          urls,
          pending.resourceAddress,
          pending,
          executionError,
        );
      }
      step.status = 'confirmed';
      step.confirmedAt ??= now();
      step.errorCode = null;
      confirmed += 1;
    }

    if (confirmed < pending.totalSteps) {
      pending.status = 'partially_complete';
      pending.updatedAt = now();
      await persistBestEffort(pendingStore, pending);
      const executionError: MeteoraExecutionError = {
        code: 'CONFIRMATION_UNKNOWN',
        message: 'Submitted steps are confirmed, but unsigned remaining steps cannot be resent automatically.',
        retryable: true,
      };
      emitProgress(
        request,
        'partially_complete',
        confirmed,
        pending.totalSteps,
        signatures,
        urls,
        executionError.message,
        executionError,
        pending,
      );
      return result(
        pending.intentId,
        'partially_complete',
        signatures,
        urls,
        pending.resourceAddress,
        pending,
        executionError,
      );
    }

    pending.status = 'confirmed_syncing';
    pending.updatedAt = now();
    await persistBestEffort(pendingStore, pending);
    emitProgress(
      request,
      'confirmed_syncing',
      confirmed,
      pending.totalSteps,
      signatures,
      urls,
      'Confirmed on-chain — syncing position or order.',
      null,
      pending,
    );

    if (options?.reconcile) {
      try {
        const reconciled = await options.reconcile(reconcileContext(pending));
        if (reconciled === false) {
          const syncError: MeteoraExecutionError = {
            code: 'SYNC_PENDING',
            message: 'Confirmed on-chain. The position or order is still syncing.',
            retryable: true,
          };
          return result(
            pending.intentId,
            'confirmed_syncing',
            signatures,
            urls,
            pending.resourceAddress,
            pending,
            syncError,
          );
        }
      } catch (cause) {
        const syncError: MeteoraExecutionError = {
          code: 'SYNC_FAILED',
          message: 'Confirmed on-chain, but position or order sync failed.',
          retryable: true,
          cause,
        };
        return result(
          pending.intentId,
          'confirmed_syncing',
          signatures,
          urls,
          pending.resourceAddress,
          pending,
          syncError,
        );
      }
    }

    await pendingStore.remove(pending.intentId);
    emitProgress(
      request,
      'complete',
      confirmed,
      pending.totalSteps,
      signatures,
      urls,
      'Meteora execution complete.',
    );
    return result(
      pending.intentId,
      'complete',
      signatures,
      urls,
      pending.resourceAddress,
      null,
      null,
    );
  }

  return {
    execute,
    recover,
    activeIntentId() {
      return activeIntent;
    },
  };
}
