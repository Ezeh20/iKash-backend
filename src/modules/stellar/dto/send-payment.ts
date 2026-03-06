import { IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AssetDto {
  @IsString()
  code!: string; // "USDC" o "XLM"

  @IsOptional()
  @IsString()
  issuer?: string; // requerido si no es XLM
}

export class SendPaymentDto {
  @IsString()
  destination!: string; // G...

  @IsString()
  @Matches(/^\d+(\.\d{1,7})?$/)
  amount!: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssetDto)
  asset?: AssetDto;
}