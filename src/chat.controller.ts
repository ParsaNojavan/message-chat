import { Controller, Get } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @MessagePattern('users-status.check')
  async getPresences(@Payload() data: { userIds: string[] }) {
    if (!data.userIds || data.userIds.length === 0) {
      return [];
    }

    return await this.chatService.getUsersPresence(data.userIds)
  }
}
