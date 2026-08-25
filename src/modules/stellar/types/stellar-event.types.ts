export type OnChainEscrowEventType =
  | 'ESCROW_CREATED'
  | 'ESCROW_FUNDED'
  | 'ESCROW_RELEASED'
  | 'ESCROW_REFUNDED'
  | 'ESCROW_CANCELLED'
  | 'ESCROW_DISPUTED';

export interface OnChainEscrowEvent {
  eventId: string;
  eventType: OnChainEscrowEventType;
  contractId: string;
  txHash: string;
  ledgerSequence: number;
  eventIndex: number;
  engagementId?: string;
  orderId?: string;
  escrowId?: string;
  amount?: string;
  timestamp?: Date;
  payload?: Record<string, unknown>;
}

export interface SorobanEventRaw {
  id: string;
  type?: string;
  ledger?: number;
  ledgerSequence?: number;
  ledgerClosedAt?: string;
  contractId?: string;
  contract_id?: string;
  txHash?: string;
  tx_hash?: string;
  transactionHash?: string;
  eventIndex?: number;
  index?: number;
  eventType?: string;
  event_type?: string;
  topic?: unknown[];
  topics?: unknown[];
  value?: unknown;
  engagementId?: string;
  orderId?: string;
  amount?: string;
  inSuccessfulContractCall?: boolean;
}
