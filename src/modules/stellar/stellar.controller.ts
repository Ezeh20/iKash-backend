import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { SendPaymentDto } from './dto/send-payment';

@Controller('stellar')
export class StellarController {
  constructor(private readonly stellar: StellarService) {}

  @Get('account/:publicKey')
  getAccount(@Param('publicKey') publicKey: string) {
    return this.stellar.getAccount(publicKey);
  }

  @Get('balances/:publicKey')
  getBalances(@Param('publicKey') publicKey: string) {
    return this.stellar.getBalances(publicKey);
  }

  @Get('transactions/:publicKey')
  getTxs(
    @Param('publicKey') publicKey: string,
    @Query('limit') limit?: string,
  ) {
    return this.stellar.getTransactions(publicKey, limit ? Number(limit) : 10);
  }

  @Post('pay')
  sendPayment(@Body() dto: SendPaymentDto) {
    return this.stellar.sendPayment(dto);
  }
}