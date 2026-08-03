import type { AuthenticatedSocket } from '@app/contracts/utils/jwt_token/authenticatedSocket';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { RtcService } from './rtc.service';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '@app/contracts/utils/jwt_token/guards/ws.guard';
import { RtcType } from '@app/contracts/models/enums/rtc-type';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/rtc',
})
export class RtcGateway implements OnGatewayDisconnect, OnGatewayConnection {

  @WebSocketServer()
  server: Server;

  constructor(private readonly rtcService: RtcService,
    private readonly jwtService: JwtService) { }

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

      client.join(payload.sub);
    }
    catch (error) {
      client.disconnect();
      return;
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data?.user?.sub;
    if (!userId) return;

    const result = await this.rtcService.handleUserDisconnect(userId);
    if (result) {
      this.server.to(result.call.callId).emit('call:ended', {
        callId: result.call.callId,
        reason: 'peer-disconnected',
      });

      this.server.in(result.call.callId).socketsLeave(result.call.callId);
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('call:initiate')
  async onInitiateCall(@MessageBody() body: { calleeId: string, type: RtcType },
    @ConnectedSocket() client: AuthenticatedSocket) {
    const callerId = client.data?.user?.sub;
    if (!callerId) return { event: 'error', data: 'Unauthorized' };

    try {
      const call = await this.rtcService.createCall(callerId, body.calleeId, body.type);
      client.join(call.callId);

      this.server.to(body.calleeId).emit('call:incoming', {
        callId: call.callId,
        callerId: call.callerId,
        type: call.type,
      });

      return { status: 'dialing', callId: call.callId };
    } catch (error) {
      return { event: 'error', data: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('call:accept')
  async onAcceptCall(@MessageBody() body: { callId: string },
    @ConnectedSocket() client: AuthenticatedSocket) {

    const calleeId = client.data?.user?.sub;
    if (!calleeId) return { status: 'error', message: 'Unauthorized' };

    try {
      const call = await this.rtcService.acceptCall(body.callId, calleeId);
      
      client.join(call.callId);
      
      const payload = {
        callId: call.callId,
        callerId: call.callerId,
        calleeId: call.calleeId,
        type: call.type,
      };
      
      this.server.to(call.callId).emit('call:accepted', payload);

      return { status: 'connected', ...payload };
    } catch (error) {
      client.emit('error', error.message);
      return { status: 'error', message: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('call:reject')
  async onRejectCall(@MessageBody() body: { callId: string },
    @ConnectedSocket() client: AuthenticatedSocket) {
    const calleeId = client.data?.user?.sub;
    if (!calleeId) return;

    const result = await this.rtcService.endCall(calleeId);
    if (result) {
      this.server.to(result.call.callId).emit('call:rejected', { callId: result.call.callId });
      this.server.in(result.call.callId).socketsLeave(result.call.callId);
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('call:end')
  async onEndCall(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.data?.user?.sub;
    if (!userId) return;

    const result = await this.rtcService.endCall(userId);

    if (result) {
      this.server.to(result.call.callId).emit('call:ended', { callId: result.call.callId });
      this.server.in(result.call.callId).socketsLeave(result.call.callId);
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('webrtc:signal')
  async onWebrtcSignal(
    @MessageBody() body: { callId: string; signal: any },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data?.user?.sub;
    const call = await this.rtcService.getCallById(body.callId);

    if (call && (call.status === 'connected' || call.status === 'dialing')) {
      client.to(call.callId).emit('webrtc:signal', {
        senderId: userId,
        signal: body.signal,
      });
    }
  }
}
