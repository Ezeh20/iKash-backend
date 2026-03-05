import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderRepository } from './order.repository';

@Injectable()
export class OrderService {
  constructor(private readonly repo: OrderRepository) {}

  create(dto: CreateOrderDto) {
    const data: any = { ...dto };
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    return this.repo.create(data);
  }

  list(p: PaginationDto, q: any) {
    const where: any = {};
    if (q.offerId) where.offerId = q.offerId;
    if (q.buyerId) where.buyerId = q.buyerId;
    if (q.sellerId) where.sellerId = q.sellerId;
    if (q.status) where.orderStatus = q.status;

    return this.repo.search(where, p.skip, p.take);
  }

  async get(id: string) {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Order no encontrado');
    return item;
  }

  update(id: string, dto: UpdateOrderDto) {
    const data: any = { ...dto };
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    return this.repo.update(id, data);
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}