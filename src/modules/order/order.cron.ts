import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderService } from './order.service';

@Injectable()
export class OrderCron {
  private readonly logger = new Logger(OrderCron.name);

  constructor(private readonly orderService: OrderService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireOrders() {
    this.logger.log('Starting automated order expiration job...');
    try {
      await this.orderService.expireOrders();
      this.logger.log('Automated order expiration job completed.');
    } catch (error) {
      this.logger.error(
        'Failed to execute automated order expiration job:',
        error,
      );
    }
  }
}
