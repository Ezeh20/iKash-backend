import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../common/base.repository';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class OfferRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.offer, 'offerId');
  }

  search(where: any, skip = 0, take = 20) {
    return this.prisma.offer.findMany({
      where,
      skip,
      take,
      orderBy: { offerId: 'desc' },
    });
  }
}