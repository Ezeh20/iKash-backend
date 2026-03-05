import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEscrowDto {
  @IsUUID()
  orderId: string;

  @IsOptional()
  @IsString()
  txHashLock?: string;

  @IsOptional()
  @IsString()
  txHashRelease?: string;
}