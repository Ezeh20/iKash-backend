import { Module } from '@nestjs/common';
import { EscrowController } from './escrow.controller';
import { EscrowRepository } from './escrow.repository';
import { EscrowService } from './escrow.service';

@Module({
  controllers: [EscrowController],
  providers: [EscrowService, EscrowRepository],
})
export class EscrowModule {}