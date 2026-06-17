import { IsString, Matches, MinLength } from 'class-validator';

export class PrepareSendDto {
  // Alias del usuario o dirección Stellar (G...)
  @IsString()
  @MinLength(1)
  recipient!: string;

  // Monto a enviar en USDC (hasta 7 decimales)
  @IsString()
  @Matches(/^\d+(\.\d{1,7})?$/, {
    message: 'amount inválido. Ej: "1" o "0.1234567"',
  })
  amount!: string;
}
