import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  publicKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  alias?: string;

  @IsOptional()
  @IsString()
  kycStatus?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  currentNonce?: string;
}