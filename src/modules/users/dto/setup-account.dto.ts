import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetupAccountDto {
  // Stage 1
  @IsOptional()
  @IsString()
  @MaxLength(80)
  alias?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Stage 2
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsString()
  preferredCurrency?: string;

  // Stage 3
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;
}
