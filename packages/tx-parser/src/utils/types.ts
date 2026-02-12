export interface BalanceDelta {
  mint: string;
  owner: string;
  change: number;
}

export interface TokenTransfer {
  mint: string;
  from: string | undefined;
  to: string | undefined;
  amount: string;
  decimals: number;
  change: number;
}

export interface InnerInstruction {
  programId: string;
  accounts: number[];
  data: string;
  parentIndex: number;
}
