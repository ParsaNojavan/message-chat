import { Controller, Get, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';
import { JwtAuthGuard } from '@app/contracts/utils/jwt_token/guards/jwt.guard';

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

  @MessagePattern('message.seen')
  async markAsSeen(
    @Payload() payload: { roomId: string, messageIds: string[] }, @RPCContext() context
  ) {

    if (!payload.messageIds?.length) {
      return [];
    }

    return this.chatService
      .markAsSeen(payload.roomId, payload.messageIds, context);
  }

  @MessagePattern('room.mute')
  async muteRoom(
    @Payload() payload: { roomId: string, durationMinutes: number }, @RPCContext() context
  ) {

    return this.chatService
      .muteRoom(payload.roomId, payload.durationMinutes, context);
  }

  @MessagePattern('rooms.fetch')
  async fetchRooms(@RPCContext() context) {

    return this.chatService
      .getUserRooms(context);
  }

  @MessagePattern('room.join')
  async joinRoom(roomId: string, @RPCContext() context) {
    await this.chatService.joinRoom(roomId, context.sub);
  }

}
