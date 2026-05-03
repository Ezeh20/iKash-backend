import { IsString, IsUUID, IsOptional } from 'class-validator';

export class CompleteEscrowDto {
  /** iKash escrow record ID */
  @IsUUID()
  escrowId: string;

  /** Stellar public key of the service provider (seller) marking as complete */
  @IsString()
  serviceProvider: string;

  /** Optional evidence hash or link (e.g. CID from IPFS, or just a receipt string) */
  @IsOptional()
  @IsString()
  evidence?: string;
}
