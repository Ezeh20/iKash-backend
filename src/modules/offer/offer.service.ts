import { Injectable } from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OfferRepository } from './offer.repository';
import { AppException, ErrorCode } from '../../common/errors';
import type { Offer, offer_status, offer_type } from '@prisma/client';

export type OfferFilter = {
  creatorId?: string;
  status?: offer_status;
  type?: offer_type;
  assetCode?: string;
};

@Injectable()
export class OfferService {
  constructor(private readonly repo: OfferRepository) {}

  create(dto: CreateOfferDto): Promise<Offer> {
    return this.repo.create(dto as unknown as Record<string, unknown>);
  }

  list(p: PaginationDto, q: OfferFilter): Promise<Offer[]> {
    const where: Record<string, unknown> = {};
    if (q.creatorId) where.creatorId = q.creatorId;
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;
    if (q.assetCode) where.assetCode = q.assetCode;

    return this.repo.search(where, p.skip, p.take);
  }

  async get(id: string): Promise<Offer> {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new AppException(
        ErrorCode.OFFER_NOT_FOUND,
        `Offer ${id} not found`,
      );
    }
    return item;
  }

  update(id: string, dto: UpdateOfferDto): Promise<Offer> {
    return this.repo.update(
      id,
      dto as unknown as Record<string, unknown>,
    ) as Promise<Offer>;
  }

  remove(id: string): Promise<Offer> {
    return this.repo.delete(id) as Promise<Offer>;
  }
}
