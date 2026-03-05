import { IsString, IsUUID } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsUUID()
  userId: string;

  @IsString()
  bankName: string;

  @IsString()
  accountDetails: string;
}