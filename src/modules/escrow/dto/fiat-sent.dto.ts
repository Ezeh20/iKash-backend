import { IsString, IsOptional } from 'class-validator';

export class FiatSentDto {
  /** Optional evidence hash or link (e.g. CID from IPFS, or just a receipt description) */
  @IsOptional()
  @IsString()
  evidence?: string;

  /** Stellar public key of the buyer signing the evidence upload */
  @IsString()
  buyerAddress: string;
}
