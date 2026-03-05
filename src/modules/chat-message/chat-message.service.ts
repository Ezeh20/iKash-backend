import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { ChatMessageRepository } from './chat-message.repository';

@Injectable()
export class ChatMessageService {
  constructor(private readonly repo: ChatMessageRepository) {}

  create(dto: CreateChatMessageDto) {
    return this.repo.create(dto);
  }

  list(p: PaginationDto, orderId?: string) {
    if (orderId) return this.repo.findByOrder(orderId, p.skip, p.take ?? 50);
    return this.repo.findMany({ skip: p.skip, take: p.take ?? 50, orderBy: { timestamp: 'desc' } });
  }

  async get(id: string) {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('ChatMessage no encontrado');
    return item;
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}