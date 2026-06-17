import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SendService } from './send.service';
import { PrepareSendDto } from './dto/prepare-send.dto';
import { SubmitSendDto } from './dto/submit-send.dto';

@UseGuards(JwtAuthGuard)
@Controller('send')
export class SendController {
  constructor(private readonly service: SendService) {}

  // Resuelve alias/dirección y devuelve info del destinatario para confirmación.
  @Get('resolve')
  resolve(@Query('recipient') recipient: string) {
    if (!recipient) {
      throw new BadRequestException('Falta el parámetro "recipient".');
    }
    return this.service.resolveRecipient(recipient);
  }

  // Valida, calcula el fee del 0.3% y devuelve la transacción USDC sin firmar.
  @Post('prepare')
  prepare(@Request() req: any, @Body() dto: PrepareSendDto) {
    return this.service.prepare(req.user.publicKey, dto.recipient, dto.amount);
  }

  // Recibe el XDR firmado por el frontend y lo envía a Stellar.
  @Post('submit')
  submit(@Body() dto: SubmitSendDto) {
    return this.service.submit(dto.signedXdr);
  }
}
