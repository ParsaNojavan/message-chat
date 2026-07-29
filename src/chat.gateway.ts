import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { WsResponse } from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from '@app/contracts/utils/jwt_token/guards/ws.guard';
import { Claims } from '@app/contracts/utils/crossCuttingConcerns/decorators/claims.decorator';
import type { AuthenticatedSocket } from '@app/contracts/utils/jwt_token/authenticatedSocket';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {

  constructor(private readonly jwtService: JwtService) { }

  private readonly logger = new Logger(ChatGateway.name);

  async handleConnection(client: AuthenticatedSocket) {
    const token = client.handshake.auth?.token ?? client.handshake.query?.token;

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });

      client.data = {
        user: payload,
      };
    }
    catch (error) {
      client.disconnect();
      return;
    }

  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.data.user}`);
  }

  @WebSocketServer()
  server: Server;

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
  @Claims('admin')
  @SubscribeMessage('server.message')
  handleServerMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { text: string },
  ): WsResponse<any> {
    return {
      event: 'server.message.result',
      data: {
        message: 'message accepted',
        text: body.text,
        user: client.data.user,
      },
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('room.join')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId: string },
  ): Promise<WsResponse<any>> {

    await client.join(body.roomId);

    return {
      event: 'room.join.result',
      data: {
        message: `joined room ${body.roomId}`,
        roomId: body.roomId,
        user: client.data.user,
      },
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('room.leave')
  async handleLeaveRoom(@ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId: string }): Promise<WsResponse<any>> {
      await client.leave(body.roomId);

      return {
      event: 'room.leave.result',
      data: {
        message: `left room ${body.roomId}`,
        roomId: body.roomId,
        user: client.data.user,
      },
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('room.message')
  async handleRoomMessage(@ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId: string, message: string }) {
    const payload = {
      sender: client.data.user.sub,
      text: body.message,
      createdAt: new Date(),
    };

    this.server.to(body.roomId).emit('room.message.new', payload);
  }
}
