import { Buffer } from 'buffer';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  PACIFIC_CENTRAL_STATE,
  PACIFIC_PROGRAM_ID,
  PACIFIC_VAULT,
  USDC_MINT,
} from '@/features/perps/pacific.config';

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM,
  );
  return ata;
}

const DEPOSIT_DISCRIMINATOR = new Uint8Array([242, 35, 198, 137, 82, 225, 242, 182]);

function buildDepositData(amountUsdc: number): Uint8Array {
  const amountLamports = BigInt(Math.round(amountUsdc * 1_000_000));
  const amountBytes = new Uint8Array(8);
  const view = new DataView(amountBytes.buffer);
  view.setBigUint64(0, amountLamports, true);
  const data = new Uint8Array(16);
  data.set(DEPOSIT_DISCRIMINATOR, 0);
  data.set(amountBytes, 8);
  return data;
}

export function buildDepositInstruction(
  depositor: PublicKey,
  amountUsdc: number,
): TransactionInstruction {
  const programId = new PublicKey(PACIFIC_PROGRAM_ID);
  const centralState = new PublicKey(PACIFIC_CENTRAL_STATE);
  const vault = new PublicKey(PACIFIC_VAULT);
  const usdcMint = new PublicKey(USDC_MINT);
  const userAta = getAssociatedTokenAddress(depositor, usdcMint);
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('__event_authority')],
    programId,
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: centralState, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(buildDepositData(amountUsdc)),
  });
}
