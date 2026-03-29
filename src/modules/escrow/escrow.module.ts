import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EscrowController } from './escrow.controller';
import { EscrowRepository } from './escrow.repository';
import { EscrowService } from './escrow.service';
import { TrustlessWorkService } from './trustless-work.service';

@Module({
  imports: [ConfigModule],
  controllers: [EscrowController],
  providers: [EscrowService, EscrowRepository, TrustlessWorkService],
  exports: [EscrowService],
})
export class EscrowModule {}