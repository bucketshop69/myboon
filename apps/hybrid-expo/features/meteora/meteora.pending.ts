export type MeteoraExecutionNetwork = 'mainnet-beta' | 'devnet';

export type MeteoraPendingStepStatus =
  | 'submitted'
  | 'confirmed'
  | 'onchain_failed'
  | 'confirmation_unknown';

export type MeteoraPendingStatus =
  | 'prepared'
  | 'submitted'
  | 'confirming'
  | 'confirmed_syncing'
  | 'partially_complete'
  | 'confirmation_unknown'
  | 'onchain_failed';

export interface MeteoraPendingStep {
  index: number;
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  status: MeteoraPendingStepStatus;
  submittedAt: number;
  confirmedAt: number | null;
  explorerUrl: string;
  errorCode: string | null;
}

/**
 * Persistable execution metadata. This deliberately contains no serialized
 * transaction, wallet signature material, generated signer secret, or token
 * amount. It is safe to retain only after the wallet returns a signature.
 */
export interface MeteoraPendingExecution {
  version: 1;
  intentId: string;
  planId: string | null;
  previewId: string | null;
  walletAddress: string;
  network: MeteoraExecutionNetwork;
  poolAddress: string;
  action: string;
  resourceAddress: string | null;
  status: MeteoraPendingStatus;
  totalSteps: number;
  steps: MeteoraPendingStep[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  preparedBlockhash: string | null;
  preparedLastValidBlockHeight: number | null;
}

export interface MeteoraPendingStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface MeteoraPendingStore {
  get(intentId: string): Promise<MeteoraPendingExecution | null>;
  list(): Promise<MeteoraPendingExecution[]>;
  save(pending: MeteoraPendingExecution): Promise<void>;
  remove(intentId: string): Promise<void>;
  findActive(
    walletAddress: string,
    network: MeteoraExecutionNetwork,
  ): Promise<MeteoraPendingExecution | null>;
}

export type MeteoraWalletReadinessStatus =
  | 'wallet_preparing'
  | 'disconnected'
  | 'wallet_unsupported'
  | 'ready';

export interface MeteoraExecutionWallet<TTransaction = unknown> {
  connected: boolean;
  address: string | null;
  source?: 'privy' | 'mwa' | 'web' | 'e2e' | 'unknown';
  isPreparing?: boolean;
  sessionKey?: string;
  signAndSendTransaction?: (
    transaction: TTransaction,
  ) => Promise<string | { signature?: string | null }>;
}

export interface MeteoraWalletReadiness {
  status: MeteoraWalletReadinessStatus;
  canExecute: boolean;
  walletAddress: string | null;
  message: string;
  requirement: 'wait' | 'connect_wallet' | 'sign_and_send_transaction' | null;
}

export type MeteoraExecutionStage =
  | 'idle'
  | 'validation'
  | 'building'
  | 'simulating'
  | 'awaiting_wallet'
  | 'submitted'
  | 'confirming'
  | 'confirmed_syncing'
  | 'complete'
  | 'wallet_rejected'
  | 'expired_before_submit'
  | 'simulation_failed'
  | 'onchain_failed'
  | 'confirmation_unknown'
  | 'partially_complete'
  | 'unsupported'
  | 'failed';

export type MeteoraExecutionErrorCode =
  | 'DUPLICATE_ACTIVE_INTENT'
  | 'EXECUTION_UNSUPPORTED'
  | 'INVALID_REQUEST'
  | 'WALLET_PREPARING'
  | 'WALLET_DISCONNECTED'
  | 'WALLET_TX_UNSUPPORTED'
  | 'WALLET_CHANGED'
  | 'WALLET_REJECTED'
  | 'PREVIEW_EXPIRED'
  | 'BUILD_FAILED'
  | 'INVALID_TRANSACTION_PLAN'
  | 'MISSING_REQUIRED_SIGNER'
  | 'PENDING_PERSIST_FAILED'
  | 'SIMULATION_FAILED'
  | 'TX_SEND_FAILED'
  | 'BLOCKHASH_EXPIRED'
  | 'ONCHAIN_FAILED'
  | 'CONFIRMATION_UNKNOWN'
  | 'SYNC_PENDING'
  | 'SYNC_FAILED';

export interface MeteoraExecutionError {
  code: MeteoraExecutionErrorCode;
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export interface MeteoraExecutionProgress {
  intentId: string;
  stage: MeteoraExecutionStage;
  currentStep: number;
  totalSteps: number;
  signatures: string[];
  explorerUrls: string[];
  message: string;
  error: MeteoraExecutionError | null;
  pending: MeteoraPendingExecution | null;
}

export interface MeteoraTransactionBundleLike<TTransaction = unknown, TSigner = unknown> {
  action: string;
  poolAddress: string;
  resourceAddress: string | null;
  transactions: TTransaction[];
  additionalSigners: TSigner[];
  planId?: string;
  previewId?: string;
  createdAt?: string;
  expiresAt?: string;
  steps?: readonly unknown[];
}

export interface MeteoraReconcileContext {
  intentId: string;
  network: MeteoraExecutionNetwork;
  walletAddress: string;
  poolAddress: string;
  action: string;
  resourceAddress: string | null;
  signatures: string[];
}

export interface MeteoraExecutionRequest<TTransaction = unknown, TSigner = unknown> {
  intentId: string;
  network: MeteoraExecutionNetwork;
  poolAddress: string;
  action: string;
  expiresAt?: string | number | Date | null;
  wallet: MeteoraExecutionWallet<TTransaction>;
  build: () => Promise<MeteoraTransactionBundleLike<TTransaction, TSigner>>;
  validate?: (
    bundle: MeteoraTransactionBundleLike<TTransaction, TSigner>,
  ) => void | Promise<void>;
  reconcile?: (context: MeteoraReconcileContext) => boolean | void | Promise<boolean | void>;
  onProgress?: (progress: MeteoraExecutionProgress) => void;
}

export interface MeteoraExecutionResult {
  intentId: string;
  status: MeteoraExecutionStage;
  signatures: string[];
  explorerUrls: string[];
  resourceAddress: string | null;
  pending: MeteoraPendingExecution | null;
  error: MeteoraExecutionError | null;
}

export interface MeteoraExecutionController<TTransaction = unknown, TSigner = unknown> {
  execute(request: MeteoraExecutionRequest<TTransaction, TSigner>): Promise<MeteoraExecutionResult>;
  recover(
    pending: MeteoraPendingExecution,
    options?: {
      walletAddress?: string;
      network?: MeteoraExecutionNetwork;
      reconcile?: (context: MeteoraReconcileContext) => boolean | void | Promise<boolean | void>;
      onProgress?: (progress: MeteoraExecutionProgress) => void;
    },
  ): Promise<MeteoraExecutionResult>;
  activeIntentId(): string | null;
}

const INDEX_KEY = '@myboon/meteora/pending/v1/index';
const ITEM_PREFIX = '@myboon/meteora/pending/v1/item/';
const ACTIVE_PENDING_STATUSES = new Set<MeteoraPendingStatus>([
  'prepared',
  'submitted',
  'confirming',
  'confirmed_syncing',
  'partially_complete',
  'confirmation_unknown',
]);

function itemKey(intentId: string): string {
  return `${ITEM_PREFIX}${encodeURIComponent(intentId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function finiteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || finiteInteger(value);
}

function isNetwork(value: unknown): value is MeteoraExecutionNetwork {
  return value === 'mainnet-beta' || value === 'devnet';
}

function isPendingStatus(value: unknown): value is MeteoraPendingStatus {
  return (
    value === 'prepared'
    || value === 'submitted'
    || value === 'confirming'
    || value === 'confirmed_syncing'
    || value === 'partially_complete'
    || value === 'confirmation_unknown'
    || value === 'onchain_failed'
  );
}

function isPendingStepStatus(value: unknown): value is MeteoraPendingStepStatus {
  return (
    value === 'submitted'
    || value === 'confirmed'
    || value === 'onchain_failed'
    || value === 'confirmation_unknown'
  );
}

function parsePendingStep(value: unknown): MeteoraPendingStep | null {
  if (!isRecord(value)) return null;
  if (
    !finiteInteger(value.index)
    || typeof value.signature !== 'string'
    || !value.signature
    || typeof value.blockhash !== 'string'
    || !value.blockhash
    || !finiteInteger(value.lastValidBlockHeight)
    || !isPendingStepStatus(value.status)
    || !finiteInteger(value.submittedAt)
    || !nullableNumber(value.confirmedAt)
    || typeof value.explorerUrl !== 'string'
    || !nullableString(value.errorCode)
  ) {
    return null;
  }

  return {
    index: value.index,
    signature: value.signature,
    blockhash: value.blockhash,
    lastValidBlockHeight: value.lastValidBlockHeight,
    status: value.status,
    submittedAt: value.submittedAt,
    confirmedAt: value.confirmedAt,
    explorerUrl: value.explorerUrl,
    errorCode: value.errorCode,
  };
}

export function parseMeteoraPendingExecution(value: unknown): MeteoraPendingExecution | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.steps)) return null;
  const steps = value.steps.map(parsePendingStep);
  if (steps.some((step) => step === null)) return null;
  if (
    typeof value.intentId !== 'string'
    || !value.intentId
    || !nullableString(value.planId)
    || !nullableString(value.previewId)
    || typeof value.walletAddress !== 'string'
    || !value.walletAddress
    || !isNetwork(value.network)
    || typeof value.poolAddress !== 'string'
    || !value.poolAddress
    || typeof value.action !== 'string'
    || !value.action
    || !nullableString(value.resourceAddress)
    || !isPendingStatus(value.status)
    || !finiteInteger(value.totalSteps)
    || value.totalSteps < 1
    || !finiteInteger(value.createdAt)
    || !finiteInteger(value.updatedAt)
    || !nullableNumber(value.expiresAt)
    || (value.preparedBlockhash !== undefined && !nullableString(value.preparedBlockhash))
    || (
      value.preparedLastValidBlockHeight !== undefined
      && !nullableNumber(value.preparedLastValidBlockHeight)
    )
  ) {
    return null;
  }

  return {
    version: 1,
    intentId: value.intentId,
    planId: value.planId,
    previewId: value.previewId,
    walletAddress: value.walletAddress,
    network: value.network,
    poolAddress: value.poolAddress,
    action: value.action,
    resourceAddress: value.resourceAddress,
    status: value.status,
    totalSteps: value.totalSteps,
    steps: steps as MeteoraPendingStep[],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
    preparedBlockhash: value.preparedBlockhash === undefined ? null : value.preparedBlockhash,
    preparedLastValidBlockHeight: value.preparedLastValidBlockHeight === undefined
      ? null
      : value.preparedLastValidBlockHeight,
  };
}

function parseIndex(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))];
  } catch {
    return [];
  }
}

export function createMemoryMeteoraPendingStorage(): MeteoraPendingStorage {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

export function createMeteoraPendingStore(
  storage: MeteoraPendingStorage = createMemoryMeteoraPendingStorage(),
): MeteoraPendingStore {
  async function readIndex(): Promise<string[]> {
    return parseIndex(await storage.getItem(INDEX_KEY));
  }

  async function writeIndex(intentIds: string[]): Promise<void> {
    await storage.setItem(INDEX_KEY, JSON.stringify([...new Set(intentIds)]));
  }

  return {
    async get(intentId) {
      const raw = await storage.getItem(itemKey(intentId));
      if (!raw) return null;
      try {
        return parseMeteoraPendingExecution(JSON.parse(raw));
      } catch {
        return null;
      }
    },

    async list() {
      const intentIds = await readIndex();
      const entries = await Promise.all(intentIds.map(async (intentId) => {
        const raw = await storage.getItem(itemKey(intentId));
        if (!raw) return null;
        try {
          return parseMeteoraPendingExecution(JSON.parse(raw));
        } catch {
          return null;
        }
      }));
      return entries
        .filter((entry): entry is MeteoraPendingExecution => entry !== null)
        .sort((left, right) => right.updatedAt - left.updatedAt);
    },

    async save(pending) {
      const safe = parseMeteoraPendingExecution(pending);
      if (!safe) throw new Error('Refused to persist invalid Meteora pending metadata');
      await storage.setItem(itemKey(safe.intentId), JSON.stringify(safe));
      const intentIds = await readIndex();
      if (!intentIds.includes(safe.intentId)) {
        await writeIndex([...intentIds, safe.intentId]);
      }
    },

    async remove(intentId) {
      await storage.removeItem(itemKey(intentId));
      const intentIds = await readIndex();
      if (intentIds.includes(intentId)) {
        await writeIndex(intentIds.filter((entry) => entry !== intentId));
      }
    },

    async findActive(walletAddress, network) {
      const normalizedWallet = walletAddress.trim().toLowerCase();
      const entries = await this.list();
      return entries.find((entry) => (
        entry.network === network
        && entry.walletAddress.toLowerCase() === normalizedWallet
        && ACTIVE_PENDING_STATUSES.has(entry.status)
      )) ?? null;
    },
  };
}
