import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../common/base.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Offer } from '@prisma/client';

@Injectable()
export class OfferRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.offer, 'offerId');
  }

  async create(data: Record<string, unknown>): Promise<Offer> {
    const { paymentMethodIds, ...offerData } = data as {
      paymentMethodIds?: string[];
      [key: string]: unknown;
    };

    const connectPaymentMethods: { connect?: Array<{ paymentId: string }> } =
      {};

    if (paymentMethodIds && paymentMethodIds.length > 0) {
      const v2Methods = await this.prisma.paymentMethod.findMany({
        where: { paymentId: { in: paymentMethodIds } },
        select: { paymentId: true },
      });
      if (v2Methods.length > 0) {
        connectPaymentMethods.connect = v2Methods.map(
          (m: { paymentId: string }) => ({
            paymentId: m.paymentId,
          }),
        );
      }
    }

    return this.prisma.offer.create({
      data: {
        ...offerData,
        payment_methods: connectPaymentMethods.connect
          ? connectPaymentMethods
          : undefined,
      } as never,
      include: {
        payment_methods: {
          include: { payment_provider: true },
        },
      },
    });
  }

  findById(offerId: string): Promise<Offer | null> {
    return this.prisma.offer.findUnique({
      where: { offerId },
      include: {
        payment_methods: {
          include: { payment_provider: true },
        },
      },
    });
  }

  search(
    where: Record<string, unknown>,
    skip = 0,
    take = 20,
  ): Promise<Offer[]> {
    return this.prisma.offer.findMany({
      where,
      skip,
      take,
      orderBy: { offerId: 'desc' },
      include: {
        payment_methods: {
          include: { payment_provider: true },
        },
      },
    });
  }
}
