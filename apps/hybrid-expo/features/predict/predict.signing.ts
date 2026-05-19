import { ClobClient, OrderType, Side, SignatureTypeV2, Chain } from '@polymarket/clob-client-v2';
import type { ApiKeyCreds, SignedOrder } from '@polymarket/clob-client-v2';
import { requireActiveEvmWallet } from '@/hooks/useEvmSigner';
import { resolveApiBaseUrl, fetchWithTimeout } from '@/lib/api';
import type { PlaceBetParams } from './predict.api';

const CLOB_HOST = process.env.EXPO_PUBLIC_CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID = Chain.POLYGON;
const BUILDER_CODE = '0xda0aa9e10ba50d0077e25e94cf9e4d9ef749821528acf6fc758df962d67b63ed';

export interface DepositWalletCallToSign {
  target: string;
  value: string;
  data: string;
}

export interface DepositWalletSignatureRequest {
  kind: 'deposit_wallet_batch';
  operation: string;
  ownerAddress: string;
  depositWalletAddress: string;
  chainId: number;
  nonce: string;
  deadline: string;
  calls: DepositWalletCallToSign[];
}

export interface SignedDepositWalletBatch {
  type: 'WALLET';
  from: string;
  to: string;
  nonce: string;
  signature: string;
  depositWalletParams: {
    depositWallet: string;
    deadline: string;
    calls: DepositWalletCallToSign[];
  };
}

const DEPOSIT_WALLET_TYPES = {
  Call: [
    { name: 'target', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ],
  Batch: [
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'calls', type: 'Call[]' },
  ],
};

export async function createPolymarketApiCreds(): Promise<ApiKeyCreds> {
  const wallet = requireActiveEvmWallet();
  const client = new ClobClient({
    host: CLOB_HOST,
    chain: CHAIN_ID,
    signer: wallet,
  });
  return client.createOrDeriveApiKey();
}

export async function signDepositWalletBatch(
  request: DepositWalletSignatureRequest,
): Promise<SignedDepositWalletBatch> {
  const wallet = requireActiveEvmWallet();
  const signerAddress = (await wallet.getAddress()).toLowerCase();
  if (signerAddress !== request.ownerAddress.toLowerCase()) {
    throw new Error('Predict signer changed. Reconnect Predict and try again.');
  }

  const domain = {
    name: 'DepositWallet',
    version: '1',
    chainId: request.chainId,
    verifyingContract: request.depositWalletAddress,
  };
  const message = {
    wallet: request.depositWalletAddress,
    nonce: request.nonce,
    deadline: request.deadline,
    calls: request.calls,
  };
  const signature = await wallet._signTypedData(domain, DEPOSIT_WALLET_TYPES, message);

  return {
    type: 'WALLET',
    from: request.ownerAddress,
    to: '0x00000000000Fb5C9ADea0298D729A0CB3823Cc07',
    nonce: request.nonce,
    signature,
    depositWalletParams: {
      depositWallet: request.depositWalletAddress,
      deadline: request.deadline,
      calls: request.calls,
    },
  };
}

export async function signAndSubmitDepositWalletBatch(
  polygonAddress: string,
  request: DepositWalletSignatureRequest,
): Promise<Record<string, unknown>> {
  const batch = await signDepositWalletBatch(request);
  const baseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/clob/wallet-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygonAddress, batch }),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof data.userMessage === 'string'
        ? data.userMessage
        : typeof data.detail === 'string'
          ? data.detail
          : 'Failed to submit signed Predict wallet action',
    );
  }
  return data;
}

export async function createSignedPredictOrder(params: PlaceBetParams): Promise<SignedOrder> {
  const wallet = requireActiveEvmWallet();
  const client = new ClobClient({
    host: CLOB_HOST,
    chain: CHAIN_ID,
    signer: wallet,
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: params.tradingAddress ?? params.polygonAddress,
    builderConfig: { builderCode: BUILDER_CODE },
  });

  const side = params.side === 'BUY' ? Side.BUY : Side.SELL;
  const orderType = params.orderType === 'FAK'
    ? OrderType.FAK
    : params.orderType === 'FOK'
      ? OrderType.FOK
      : params.orderType === 'GTC'
        ? OrderType.GTC
        : OrderType.GTC;

  if (orderType === OrderType.FOK || orderType === OrderType.FAK) {
    const amount = typeof params.amount === 'number'
      ? params.amount
      : typeof params.size === 'number'
        ? params.size * params.price
        : null;
    if (!amount || amount <= 0) throw new Error('Missing order amount');
    return client.createMarketOrder(
      {
        tokenID: params.tokenID,
        price: params.price,
        amount,
        side,
        orderType,
        builderCode: BUILDER_CODE,
      },
      { tickSize: '0.01', negRisk: !!params.negRisk },
    );
  }

  if (typeof params.size !== 'number') throw new Error('Missing order size');
  return client.createOrder(
    {
      tokenID: params.tokenID,
      price: params.price,
      size: params.size,
      side,
      builderCode: BUILDER_CODE,
    },
    { tickSize: '0.01', negRisk: !!params.negRisk },
  );
}
