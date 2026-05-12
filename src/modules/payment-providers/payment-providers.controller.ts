import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('payment-providers')
export class PaymentProvidersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    return this.prisma.payment_provider.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
  }
}
