import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaseRepository } from '../../common/base.repository';

@Injectable()
export class PaymentMethodsRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.paymentMethod, 'paymentId');
  }
}