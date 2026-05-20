import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../common/base.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrderRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.order, 'orderId');
  }

  // Override create to atomically create order and mark associated offer as executed
  async create(data: { offerId: string; buyerId: string; sellerId: string; assetAmount: string | number; fiatAmount: string | number; orderStatus?: string; expiresAt?: Date | string | null }) {
    // Use a transaction to ensure both actions succeed together
    const created = await this.prisma.$transaction(async (tx) => {
      const payload: Prisma.OrderUncheckedCreateInput = {
        offerId: data.offerId,
        buyerId: data.buyerId,
        sellerId: data.sellerId,
        assetAmount: data.assetAmount as any,
        fiatAmount: data.fiatAmount as any,
        orderStatus: (data.orderStatus as any) || undefined,
        expiresAt: data.expiresAt ? new Date(data.expiresAt as string) : undefined,
      } as Prisma.OrderUncheckedCreateInput;

      const order = await tx.order.create({ data: payload });
      // mark the offer executed so it no longer appears in active market
      await tx.offer.update({ where: { offerId: data.offerId }, data: { executed: true } });
      return order;
    });

    return created;
  }

  search(where: any, skip = 0, take = 20) {
    return this.prisma.order.findMany({
      where,
      skip,
      take,
      orderBy: { orderId: 'desc' },
      include: {
        offer: {
          include: {
            payment_methods: {
              include: {
                payment_provider: true,
              },
            },
          },
        },
        escrow: true,
        buyer: true,
        seller: true,
      },
    });
  }

  findById(id: string) {
    return this.prisma.order.findUnique({
      where: { orderId: id },
      include: {
        offer: {
          include: {
            payment_methods: {
              include: {
                payment_provider: true,
              },
            },
          },
        },
        escrow: true,
        buyer: true,
        seller: true,
      },
    });
  }

  async getUserStats(userId: string) {
    const totalOrders = await this.prisma.order.count({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
    });

    const completedOrders = await this.prisma.order.count({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        orderStatus: 'released',
      },
    });

    return { totalOrders, completedOrders };
  }
}