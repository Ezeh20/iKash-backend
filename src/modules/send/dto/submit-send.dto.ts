import { IsString, MinLength } from 'class-validator';

export class SubmitSendDto {
  // XDR de la transacción ya firmada por el frontend
  @IsString()
  @MinLength(1)
  signedXdr!: string;
}
