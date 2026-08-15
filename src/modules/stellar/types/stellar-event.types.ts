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
  payload?: Record<string, any>;
}

export interface SorobanEventRaw {
  id: string;
  type?: string;
  ledger: number;
  ledgerClosedAt?: string;
  contractId: string;
  topic: string[];
  value: any;
  inSuccessfulContractCall?: boolean;
  txHash: string;
}
