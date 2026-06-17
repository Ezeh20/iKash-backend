import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9.!_]+$/, { message: 'Alias must only contain lowercase letters, numbers, and allowed symbols (., !, _)' })
  alias?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsString()
  preferredCurrency?: string;

  @IsOptional()
  @IsBoolean()
  pendingAccountInfo?: boolean;

  @IsOptional()
  @IsString()
  kycStatus?: 'not_started' | 'in_progress' | 'in_review' | 'approved' | 'rejected' | 'expired' | 'kyc_expired' | 'abandoned' | 'resubmitted' | 'pending';

  @IsOptional()
  @IsString()
  @MaxLength(250)
  bio?: string;

  @IsOptional()
  @IsBoolean()
  securityUpdates?: boolean;
}