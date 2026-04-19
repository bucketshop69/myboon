/**
 * useEvmSigner — Derives an EVM signer from Solana wallet signature.
 *
 * The EVM private key is derived deterministically: keccak256(solana_signature).
 * This key lives ONLY in memory on the phone — never persisted to disk.
 * Used for local EIP-712 order signing (Phase 2 local model).
 *
 * The same derivation runs on the server for relay ops (Safe deploy/approve/withdraw).
 * Both sides get the same key from the same Solana signature.
 */

import { useCallback, useRef, useState } from 'react';
import { Wallet } from '@ethersproject/wallet';
import { keccak256 } from '@ethersproject/keccak256';

// V2 exchange contract addresses (for EIP-712 domain verifyingContract)
export const V2_CONTRACTS = {
  CTF_EXCHANGE: '0xE111180000d2663C0091e4f400237545B87B996B',
  NEG_RISK_CTF_EXCHANGE: '0xe2222d279d744050d28e00520010520000310F59',
} as const;

// V2 EIP-712 order domain + struct (matches @polymarket/clob-client-v2)
const CTF_EXCHANGE_V2_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '2',
  chainId: 137,
};

const CTF_EXCHANGE_V2_ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'metadata', type: 'bytes32' },
    { name: 'builder', type: 'bytes32' },
  ],
};

// Builder code (public, no secret) — UUID as bytes32
const BUILDER_CODE = '0x019d669d344778c68c77c2f403474b9400000000000000000000000000000000';
const BYTES32_ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

// Signature type for Gnosis Safe
const SIG_TYPE_POLY_GNOSIS_SAFE = 2;

export interface SignedOrderV2 {
  salt: string;
  maker: string;
  signer: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: 'BUY' | 'SELL';
  signatureType: number;
  timestamp: string;
  metadata: string;
  builder: string;
  expiration: string;
  signature: string;
}

export type TickSize = '0.1' | '0.01' | '0.001' | '0.0001';

export interface OrderParams {
  tokenID: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  /** V2 exchange contract address (neg-risk vs regular) */
  exchangeAddress: string;
  /** Tick size for rounding (default '0.01') */
  tickSize?: TickSize;
}

function generateSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return BigInt(hex).toString();
}

// Rounding helpers (match SDK exactly)
function roundDown(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(n * factor) / factor;
}

function roundUp(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.ceil(n * factor) / factor;
}

function roundNormal(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function decimalPlaces(n: number): number {
  const s = n.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

const ROUNDING_CONFIG: Record<TickSize, { price: number; size: number; amount: number }> = {
  '0.1':    { price: 1, size: 2, amount: 3 },
  '0.01':   { price: 2, size: 2, amount: 4 },
  '0.001':  { price: 3, size: 2, amount: 5 },
  '0.0001': { price: 4, size: 2, amount: 6 },
};

const COLLATERAL_DECIMALS = 6;

/**
 * Calculate maker/taker amounts matching the SDK's getOrderRawAmounts + parseUnits.
 */
function calcAmounts(price: number, size: number, side: 'BUY' | 'SELL', tickSize: TickSize = '0.01'): { makerAmount: string; takerAmount: string } {
  const rc = ROUNDING_CONFIG[tickSize];
  const rawPrice = roundNormal(price, rc.price);

  if (side === 'BUY') {
    const rawTakerAmt = roundDown(size, rc.size);
    let rawMakerAmt = rawTakerAmt * rawPrice;
    if (decimalPlaces(rawMakerAmt) > rc.amount) {
      rawMakerAmt = roundUp(rawMakerAmt, rc.amount + 4);
      if (decimalPlaces(rawMakerAmt) > rc.amount) {
        rawMakerAmt = roundDown(rawMakerAmt, rc.amount);
      }
    }
    // parseUnits equivalent: multiply by 10^6
    const makerAmount = BigInt(Math.round(rawMakerAmt * 10 ** COLLATERAL_DECIMALS)).toString();
    const takerAmount = BigInt(Math.round(rawTakerAmt * 10 ** COLLATERAL_DECIMALS)).toString();
    return { makerAmount, takerAmount };
  } else {
    const rawMakerAmt = roundDown(size, rc.size);
    let rawTakerAmt = rawMakerAmt * rawPrice;
    if (decimalPlaces(rawTakerAmt) > rc.amount) {
      rawTakerAmt = roundUp(rawTakerAmt, rc.amount + 4);
      if (decimalPlaces(rawTakerAmt) > rc.amount) {
        rawTakerAmt = roundDown(rawTakerAmt, rc.amount);
      }
    }
    const makerAmount = BigInt(Math.round(rawMakerAmt * 10 ** COLLATERAL_DECIMALS)).toString();
    const takerAmount = BigInt(Math.round(rawTakerAmt * 10 ** COLLATERAL_DECIMALS)).toString();
    return { makerAmount, takerAmount };
  }
}

export function useEvmSigner() {
  const walletRef = useRef<Wallet | null>(null);
  const [ready, setReady] = useState(false);
  const [eoaAddr, setEoaAddr] = useState<string | null>(null);

  /**
   * Derive EVM wallet from Solana signature (same derivation as server).
   * Call this after Solana wallet signs the enable message.
   * Key stays in memory only — never persisted.
   */
  const deriveFromSignature = useCallback((solanaSignature: Uint8Array): { eoaAddress: string } => {
    const sigHex = '0x' + Array.from(solanaSignature, (b: number) => b.toString(16).padStart(2, '0')).join('');
    const evmPrivateKey = keccak256(sigHex);
    const wallet = new Wallet(evmPrivateKey);
    walletRef.current = wallet;
    setReady(true);
    setEoaAddr(wallet.address);
    console.log('[evm-signer] Derived EOA:', wallet.address);
    return { eoaAddress: wallet.address };
  }, []);

  /**
   * Sign a V2 order locally using EIP-712.
   * Returns the full signed order ready to send to VPS for proxying.
   */
  const signOrder = useCallback(async (params: OrderParams, safeAddress: string): Promise<SignedOrderV2> => {
    const wallet = walletRef.current;
    if (!wallet) throw new Error('EVM signer not initialized — call deriveFromSignature first');

    const { makerAmount, takerAmount } = calcAmounts(params.price, params.size, params.side, params.tickSize);
    const timestamp = Date.now().toString();
    const salt = generateSalt();

    const domain = {
      ...CTF_EXCHANGE_V2_DOMAIN,
      verifyingContract: params.exchangeAddress,
    };

    const message = {
      salt,
      maker: safeAddress,        // Safe = funder (where pUSD lives)
      signer: wallet.address,    // EOA = signer
      tokenId: params.tokenID,
      makerAmount,
      takerAmount,
      side: params.side === 'BUY' ? 0 : 1,
      signatureType: SIG_TYPE_POLY_GNOSIS_SAFE,
      timestamp,
      metadata: BYTES32_ZERO,
      builder: BUILDER_CODE,
    };

    // EIP-712 sign
    const signature = await wallet._signTypedData(domain, CTF_EXCHANGE_V2_ORDER_TYPES, message);

    return {
      salt,
      maker: safeAddress,
      signer: wallet.address,
      tokenId: params.tokenID,
      makerAmount,
      takerAmount,
      side: params.side,
      signatureType: SIG_TYPE_POLY_GNOSIS_SAFE,
      timestamp,
      metadata: BYTES32_ZERO,
      builder: BUILDER_CODE,
      expiration: '0',
      signature,
    };
  }, []);

  return {
    deriveFromSignature,
    signOrder,
    isReady: ready,
    eoaAddress: eoaAddr,
  };
}
