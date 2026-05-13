export type PredictOperation =
  | 'predict_setup'
  | 'buy'
  | 'sell'
  | 'cancel'
  | 'redeem'
  | 'withdraw'
  | 'deposit'
  | 'wrap'
  | 'predict_session';

export type PredictOperationStatus =
  | 'submitted'
  | 'waiting_to_match'
  | 'filled'
  | 'not_filled'
  | 'cancel_requested'
  | 'cancelled'
  | 'collecting'
  | 'bridging'
  | 'completed'
  | 'failed'
  | 'session_expired';

export interface PredictOperationIdentifiers {
  orderId?: string;
  tokenId?: string;
  conditionId?: string;
  txHash?: string;
  bridgeAddress?: string;
  relayerTransactionId?: string;
  tradingAddress?: string;
  depositWalletAddress?: string;
}

export interface PredictOperationRetry {
  canRetry: boolean;
  retryAfterMs?: number;
  pollAfterMs?: number;
}

export interface PredictOperationError {
  code: string;
  detailsId?: string;
}

export interface PredictOperationEnvelope {
  ok: boolean;
  operationId: string;
  operation: PredictOperation;
  status: PredictOperationStatus;
  userMessage: string;
  identifiers?: PredictOperationIdentifiers;
  retry?: PredictOperationRetry;
  lifecycleError?: PredictOperationError;
}
