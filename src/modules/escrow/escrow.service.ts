import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { UpdateEscrowDto } from './dto/update-escrow.dto';
import { EscrowRepository } from './escrow.repository';

@Injectable()
export class EscrowService {
  constructor(private readonly repo: EscrowRepository) {}

  async create(dto: CreateEscrowDto) {
    const exists = await this.repo.findByOrder(dto.orderId);
    if (exists) throw new BadRequestException('Ya existe escrow para ese orderId');
    return this.repo.create(dto);
  }

  list(p: PaginationDto, orderId?: string) {
    if (orderId) return this.repo.findMany({ skip: p.skip, take: p.take, where: { orderId } });
    return this.repo.findMany({ skip: p.skip, take: p.take });
  }

  async get(id: string) {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Escrow no encontrado');
    return item;
  }

  update(id: string, dto: UpdateEscrowDto) {
    return this.repo.update(id, dto);
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}