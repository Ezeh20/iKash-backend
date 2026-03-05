import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../common/base.repository';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class EscrowRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.escrowOnChain, 'escrowId');
  }

  findByOrder(orderId: string) {
    return this.prisma.escrowOnChain.findUnique({ where: { orderId } });
  }
}