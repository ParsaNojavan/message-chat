import { Controller, Get } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @MessagePattern('users-status.check')
  async getPresences(
    @Payload() payload: { userIds: string[] },
  ) {
    console.log(payload.userIds);

    if (!payload.userIds?.length) {
      return [];
    }

    return this.chatService.getUsersPresence(payload.userIds);
  }

}
