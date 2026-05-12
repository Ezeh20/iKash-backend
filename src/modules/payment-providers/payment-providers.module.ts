import { Module } from '@nestjs/common';
import { PaymentProvidersController } from './payment-providers.controller';

@Module({
  controllers: [PaymentProvidersController],
})
export class PaymentProvidersModule {}
