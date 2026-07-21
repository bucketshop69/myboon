import { MeteoraSdkClient } from '@myboon/shared/meteora';
import { PublicKey, type Connection } from '@solana/web3.js';
import { METEORA_RPC_URL } from './meteora.config';
import type {
  MeteoraLimitDraft,
  MeteoraPhaseTwoAdapter,
  MeteoraPhaseTwoPreview,
  MeteoraPositionDraft,
  MeteoraPrepareContext,
} from './meteora.form';
import { createCenteredRange } from './meteora.form';

/**
 * Browser-safe read-only adapter. This file must not re-export the unsuffixed
 * module because Metro resolves that import back to this `.web.ts` file.
 *
 * Signing/submitting a Meteora transaction is genuinely mobile-only (it
 * relies on the native execution controller and Mobile Wallet Adapter), so
 * `preparePosition`/`prepareLimitOrder`/`execute` stay guarded here. But
 * `getWalletBalances` is a pure read against Solana RPC via `@solana/web3.js`
 * — nothing about it needs native APIs — so it must not be stubbed to
 * `{ x: null, y: null }`. Doing so left the pool-detail "Amount" balance rows
 * stuck on "Balance Unavailable" for every web session, regardless of wallet
 * connection state (TC-DETAIL-004 regression).
 */
const sdk = new MeteoraSdkClient({
  rpcUrl: METEORA_RPC_URL,
  network: 'mainnet-beta',
});

export const meteoraPhaseTwoAdapter: MeteoraPhaseTwoAdapter = {
  async getDefaultRange(pool) {
    const range = createCenteredRange(pool.currentPrice, pool.binStep);
    if (!range) throw new Error('The current pool price is unavailable.');
    return range;
  },
  async preparePosition(context, draft) {
    return unavailablePreview('position', context, draft);
  },
  async prepareLimitOrder(context, draft) {
    return unavailablePreview('limit', context, draft);
  },
  async execute() {
    throw new Error('Meteora execution is available in the mobile app only.');
  },
  async getWalletBalances(pool, walletAddress) {
    try {
      const owner = new PublicKey(walletAddress);
      const [x, y] = await Promise.all([
        readTokenBalance(sdk.connection, owner, pool.tokenX.address),
        readTokenBalance(sdk.connection, owner, pool.tokenY.address),
      ]);
      return { x, y };
    } catch {
      // A genuine RPC failure (rate limit, bad config, etc.) — the caller
      // shows "Unavailable" rather than hanging on "Checking…" forever.
      return { x: null, y: null };
    }
  },
};

async function readTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mintAddress: string,
): Promise<string> {
  const response = await connection.getParsedTokenAccountsByOwner(
    owner,
    { mint: new PublicKey(mintAddress) },
    'confirmed',
  );
  let atomic = 0n;
  let decimals = 0;
  for (const account of response.value) {
    const tokenAmount = account.account.data.parsed.info.tokenAmount as {
      amount: string;
      decimals: number;
    };
    atomic += BigInt(tokenAmount.amount);
    decimals = tokenAmount.decimals;
  }
  return formatAtomic(atomic.toString(), decimals);
}

function formatAtomic(value: string, decimals: number): string {
  const padded = value.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals) || '0';
  if (decimals === 0) return whole;
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function unavailablePreview(
  kind: 'position' | 'limit',
  context: MeteoraPrepareContext,
  draft: MeteoraPositionDraft | MeteoraLimitDraft,
): MeteoraPhaseTwoPreview {
  const now = Date.now();
  const position = kind === 'position' ? draft as MeteoraPositionDraft : null;
  const limit = kind === 'limit' ? draft as MeteoraLimitDraft : null;
  return {
    id: `web-${kind}-${now}`,
    kind,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    currentPrice: context.pool.currentPrice ?? '0',
    requestedMinPrice: position?.requestedMinPrice || undefined,
    requestedMaxPrice: position?.requestedMaxPrice || undefined,
    executableMinPrice: position?.requestedMinPrice || undefined,
    executableMaxPrice: position?.requestedMaxPrice || undefined,
    requestedTargetPrice: limit?.requestedPrice || undefined,
    executableTargetPrice: limit?.requestedPrice || undefined,
    transactionCount: 0,
    costs: [],
    warnings: [{
      code: 'EXECUTION_UNSUPPORTED',
      message: 'Review is available here, but Meteora transaction execution currently requires the mobile app.',
      blocking: true,
    }],
    canExecute: false,
    walletAddress: context.walletAddress,
    network: 'mainnet-beta',
  };
}
