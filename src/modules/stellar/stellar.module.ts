import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { StellarService } from './stellar.service';
import { StellarEventParserService } from './stellar-event-parser.service';
import { StellarListenerService } from './stellar-listener.service';
import { StellarController } from './stellar.controller';

@Module({
  imports: [ConfigModule, PrismaModule, AuditLogModule],
  providers: [
    StellarService,
    StellarEventParserService,
    StellarListenerService,
  ],
  controllers: [StellarController],
  exports: [StellarService, StellarEventParserService, StellarListenerService],
})
export class StellarModule {}
