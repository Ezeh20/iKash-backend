import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderCron } from './order.cron';
import { EscrowModule } from '../escrow/escrow.module';

@Module({
  imports: [EscrowModule],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository, OrderCron],
})
export class OrderModule {}
