import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WsResponse } from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from '@app/contracts/utils/jwt_token/guards/ws.guard';
import { Claims } from '@app/contracts/utils/crossCuttingConcerns/decorators/claims.decorator';
import type { AuthenticatedSocket } from '@app/contracts/utils/jwt_token/authenticatedSocket';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connected: ${client.data.user}`);
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.data.user}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    return {
      event: 'pong',
      data: {
        message: 'authenticated successfully',
        user: client.data.user,
      },
    };
  }

  @UseGuards(WsJwtGuard)
  @Claims('chat.send')
  @SubscribeMessage('send_message')
  handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { text: string },
  ): WsResponse<any> {
    return {
      event: 'send_message_result',
      data: {
        message: 'message accepted',
        text: body.text,
        user: client.data.user,
      },
    };
  }

  @UseGuards(WsJwtGuard)
  @Claims('chat.join')
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId: string },
  ): WsResponse<any> {
    return {
      event: 'join_room_result',
      data: {
        message: `joined room ${body.roomId}`,
        roomId: body.roomId,
        user: client.data.user,
      },
    };
  }
}
