import { Module } from '@nestjs/common';
import { ChatMessageController } from './chat-message.controller';
import { ChatMessageRepository } from './chat-message.repository';
import { ChatMessageService } from './chat-message.service';

@Module({
  controllers: [ChatMessageController],
  providers: [ChatMessageService, ChatMessageRepository],
})
export class ChatMessageModule {}