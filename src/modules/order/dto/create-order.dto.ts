import { IsIn, IsNumberString, IsOptional, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  offerId: string;

  @IsUUID()
  buyerId: string;

  @IsUUID()
  sellerId: string;

  @IsNumberString()
  assetAmount: string;

  @IsNumberString()
  fiatAmount: string;

  @IsOptional()
  @IsIn(['created', 'locked', 'released', 'cancelled', 'expired', 'disputed'])
  orderStatus?: 'created' | 'locked' | 'released' | 'cancelled' | 'expired' | 'disputed';

  @IsOptional()
  expiresAt?: string; // ISO string
}