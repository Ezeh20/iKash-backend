import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module'; // <- si tu prisma.module.ts está en raíz, ajusta este import
import { UsersModule } from './modules/users/user.module';

import { OfferModule } from './modules/offer/offer.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { OrderModule } from './modules/order/order.module';
import { EscrowModule } from './modules/escrow/escrow.module';
import { ChatMessageModule } from './modules/chat-message/chat-message.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { KycModule } from './modules/kyc/kyc.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    OfferModule,
    PaymentMethodsModule,
    OrderModule,
    EscrowModule,
    ChatMessageModule,
    StellarModule,
    KycModule,
  ],
})
export class AppModule {}