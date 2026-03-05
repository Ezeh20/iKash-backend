import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../common/base.repository';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class OrderRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.order, 'orderId');
  }

  search(where: any, skip = 0, take = 20) {
    return this.prisma.order.findMany({
      where,
      skip,
      take,
      orderBy: { orderId: 'desc' },
    });
  }
}