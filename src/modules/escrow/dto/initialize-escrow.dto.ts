import { IsString, IsNumber, IsUUID, Min } from 'class-validator';

export class InitializeEscrowDto {
  @IsUUID()
  orderId: string;

  /** Stellar public key of the entity signing the deploy tx */
  @IsString()
  signerAddress: string;

  /** Seller's Stellar public key (serviceProvider + releaseSigner) */
  @IsString()
  sellerAddress: string;

  /** Buyer's Stellar public key (receiver) */
  @IsString()
  buyerAddress: string;

  /** USDC amount for the escrow */
  @IsNumber()
  @Min(0.0000001)
  amount: number;

  /** Human-readable title for the escrow contract */
  @IsString()
  title: string;
}
