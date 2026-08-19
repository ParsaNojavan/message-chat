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
import { UseGuards, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { WsJwtGuard } from '@app/contracts/utils/jwt_token/guards/ws.guard';
import { Claims } from '@app/contracts/utils/crossCuttingConcerns/decorators/claims.decorator';
import type { AuthenticatedSocket } from '@app/contracts/utils/jwt_token/authenticatedSocket';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { ChatService } from './chat.service';
import Redis from 'ioredis';
import ReactionDto from '@app/contracts/models/dtos/chat/reaction.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect {

  constructor(private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    @Inject('REDIS_SUB_CLIENT') private readonly redis: Redis,) { }

  async onModuleInit() {
    await this.redis.subscribe('presence:events');
    await this.redis.subscribe('notifications:event');
    await this.redis.subscribe('messages:event');
    await this.redis.psubscribe('user:*:blocks');

    this.redis.on('message', (channel, message) => {
      console.log(channel)
      if (channel === 'presence:events') {

        const presenceData = JSON.parse(message);

        this.server.emit('presence.update', presenceData);
      }
      else if (channel === 'notifications:event') {
        const payload = JSON.parse(message);
        console.log(payload)

        if (payload.type === 'notification.send') {
          payload.recipientIds.forEach(userId => {

            this.server.to(userId).emit('new_notification', payload);
          });
        }
        else if (payload.type === 'notification.read') {

          this.server.to(payload.roomId).emit('seen_notification', payload);

        }
      }
      else if (channel === 'messages:event') {
        const payload = JSON.parse(message);
        console.log(payload)

        this.server.to(payload.roomId).emit('seen_messages', payload);
      }
    });
    this.redis.on('pmessage', async (pattern, channel, message) => {
      if (pattern === 'user:*:blocks') {
        const payload = JSON.parse(message);

        const blockerId = payload.userId
        const blockedId = payload.blockedId

        const sockets = this.server.sockets.sockets;
        const dmRoomId = await this.chatService.getSharedDmRoom(blockerId, blockedId);

        for (const [socketId, socket] of sockets.entries()) {
          if (socket.data?.user?.sub === blockedId) {
            socket.leave(dmRoomId);

            socket.emit('room.kicked', { roomId: dmRoomId, reason: 'blocked' });

            console.log(`User ${blockedId} forced to leave room ${dmRoomId} due to block.`);
          }
        }
      }
    })
  }

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

      await client.join(payload.sub);
      await this.chatService.setUserOnline(payload.sub);
    }
    catch (error) {
      client.disconnect();
      return;
    }

  }

  async handleDisconnect(client: AuthenticatedSocket) {
    await client.leave(client.data.user.sub);
    this.logger.log(`Client disconnected: ${client.data.user}`);
    await this.chatService.setUserOffline(client.data.user.sub);
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
    const isBlocked = await this.chatService.isUserBlockedInRoom(body.roomId, client.data.user.sub);
    if (isBlocked) {
      return { event: 'error', data: { message: 'You are blocked.' } };
    }

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
  @SubscribeMessage('room.typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId: string, isTyping: boolean },
  ) {
    const isBlocked = await this.chatService.isUserBlockedInRoom(body.roomId, client.data.user.sub);
    if (isBlocked) {
      return { event: 'error', data: { message: 'You are blocked.' } };
    }

    const permission = await this.chatService.channelPermission(body.roomId, client.data.user.sub)
    if (!permission) {
      return { event: 'error', data: { message: 'You dont have permission.' } };
    }

    client.to(body.roomId).emit('room.typing.event', {
      roomId: body.roomId,
      userId: client.data.user.sub,
      isTyping: body.isTyping,
    });
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
    @MessageBody() body: {
      roomId: string, message: string, media?: {
        mediaId: string;
        url: string;
        thumbnailUrl: string;
        type: string;
      }[],
      replyTo?: string,
      isForwarded?: boolean,
      forwardedFromUser?: string,
      forwardedFromRoom?: string
    }) {

    const isBlocked = await this.chatService.isUserBlockedInRoom(body.roomId, client.data.user.sub);
    if (isBlocked) {
      return { event: 'error', data: { message: 'You are blocked.' } };
    }

    const permission = await this.chatService.channelPermission(body.roomId, client.data.user.sub)
    if (!permission) {
      return { event: 'error', data: { message: 'You dont have permission.' } };
    }

    const payload = await this.chatService.createMessage(body.roomId, {
      senderId: client.data.user.sub,
      content: body.message,
      replyTo: body.replyTo,
      isForwarded: body.isForwarded,
      forwardedFromUser: body.forwardedFromUser,
      forwardedFromRoom: body.forwardedFromRoom
    }, body.media);

    this.server.to(body.roomId).emit('room.message.new', payload);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('room.message.react')
  async handleReactMessage(@ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { reaction: ReactionDto }) {
    const userId = client.data.user.sub;
    const result = await this.chatService.toggleReaction(userId, body.reaction);

    this.server.to(result.roomId).emit('room.message.reaction.updated', {
      messageId: body.reaction.messageId,
      reactions: result.reactions,
    });
  }
}
