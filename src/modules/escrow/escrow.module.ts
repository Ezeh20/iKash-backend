import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EscrowController } from './escrow.controller';
import { EscrowRepository } from './escrow.repository';
import { EscrowService } from './escrow.service';
import { TrustlessWorkService } from './trustless-work.service';
import { FileStorageModule } from '../file-storage/file-storage.module';

@Module({
  imports: [ConfigModule, FileStorageModule],
  controllers: [EscrowController],
  providers: [EscrowService, EscrowRepository, TrustlessWorkService],
  exports: [EscrowService],
})
export class EscrowModule {}
