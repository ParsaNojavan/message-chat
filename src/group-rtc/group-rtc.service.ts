import Context from '@app/contracts/models/dtos/rpcContext';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { AccessToken } from 'livekit-server-sdk';
import { Model, Types } from 'mongoose';
import RoomMember from 'src/models/concrete/member';
import Room from 'src/models/concrete/room';

@Injectable()
export class GroupRtcService {

    private readonly livekitApiKey = process.env.LIVEKIT_API_KEY;
    private readonly livekitApiSecret = process.env.LIVEKIT_API_SECRET;

    constructor(@InjectModel(RoomMember.name) private memberModel: Model<RoomMember>,
        @InjectModel(Room.name) private roomModel: Model<Room>,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,) { }

    async createToken(roomId: string, userId: string) {

        console.log(userId)

        if (!roomId || !userId) {
            throw new BadRequestException('Room ID and User ID are required');
        }

        const redisCallKey = `active_call:${userId}`;
        const currentActiveRoom = await this.redis.get(redisCallKey);

        if (currentActiveRoom && currentActiveRoom !== roomId)
            throw new ConflictException('already in call');

        const room = await this.roomModel.findById(roomId);
        if (!room) throw new NotFoundException('room not found')

        const roomMember = await this.memberModel.findOne({
            roomId: roomId,
            userId: userId
        });

        if (!roomMember)
            throw new ForbiddenException('access.denied')

        const otherMembers = await this.memberModel.find({
            roomId,
            userId: { $ne: userId }
        }).select('userId');

        const targetUserIds = otherMembers.map(m => m.userId.toString());


        const activeRoomKey = `active_room:${roomId}`;
        const isRoomActive = await this.redis.get(activeRoomKey);
        const ttlSeconds = 2 * 60 * 60;

        if (!isRoomActive) {
            await this.redis.set(activeRoomKey, 'active', 'EX', ttlSeconds);

            await this.redis.publish('rtc:channel', JSON.stringify({
                event: 'incoming_call',
                roomId: roomId,
                roomName: room.name,
                roomAvatar: room.avatar,
                callerId: userId,
                targetUserIds: targetUserIds,
                timestamp: Date.now()
            }));
        }

        const isAdmin = roomMember.role === RoleType.ADMIN;
        const name = isAdmin ? `Admin-${userId.substring(0, 5)}` : `Member-${userId.substring(0, 5)}`;

        const at = new AccessToken(this.livekitApiKey, this.livekitApiSecret, {
            identity: userId,
            name: name,
            ttl: '2h'
        });

        at.addGrant({
            roomJoin: true,
            room: roomId,
            canPublish: true,
            canSubscribe: true,
            roomAdmin: isAdmin,
        });

        const participantsKey = `call_participants:${roomId}`;
        await this.redis.sadd(participantsKey, userId);
        await this.redis.expire(participantsKey, ttlSeconds);

        await this.redis.set(redisCallKey, roomId, 'EX', ttlSeconds);
        await this.redis.publish('rtc:channel', JSON.stringify({
            event: 'user_joining_call',
            roomId: roomId,
            userId: userId,
            name: name,
            targetUserIds: targetUserIds,
            timestamp: Date.now()
        }));

        return {
            "rpcToken": (await at.toJwt()).toString()
        }
    }

    async handleDecline(roomId: string, userId: string): Promise<{ callEnded: boolean }> {
        const room = await this.roomModel.findById(roomId)
        if (!room) throw new NotFoundException('Room not found');

        const otherMembers = await this.memberModel.find({
            roomId,
            userId: { $ne: userId }
        }).select('userId');
        const targetUserIds = otherMembers.map(m => m.userId.toString());

        if (room.type === ChatType.GROUP) {

            await this.redis.publish('rtc:channel', JSON.stringify({
                event: 'user_declined',
                roomId: roomId,
                userId: userId,
                targetUserIds: targetUserIds,
                timestamp: Date.now()
            }));

            return { callEnded: false };
        } else {
            await this.redis.del(`active_room:${roomId}`);
            await this.redis.del(`call_participants:${roomId}`);

            await this.redis.publish('rtc:channel', JSON.stringify({
                event: 'call_declined',
                roomId: roomId,
                userId: userId,
                targetUserIds: targetUserIds,
                timestamp: Date.now()
            }));

            return { callEnded: true };
        }
    }

    async leaveCall(roomId: string, userId: string): Promise<{ callEnded: boolean }> {
        const room = await this.roomModel.findById(roomId);
        if (!room) throw new NotFoundException('Room not found');

        const participantsKey = `call_participants:${roomId}`;
        const activeRoomKey = `active_room:${roomId}`;
        const redisCallKey = `active_call:${userId}`;

        await this.redis.del(redisCallKey);
        await this.redis.srem(participantsKey, userId);

        const remainingCount = await this.redis.scard(participantsKey);

        const otherMembers = await this.memberModel.find({
            roomId,
            userId: { $ne: userId }
        }).select('userId');
        const targetUserIds = otherMembers.map(m => m.userId.toString());

        if (room.type !== ChatType.GROUP || remainingCount === 0) {
            await this.redis.del(activeRoomKey);
            await this.redis.del(participantsKey);

            await this.redis.publish('rtc:channel', JSON.stringify({
                event: 'call_ended',
                roomId: roomId,
                reason: remainingCount === 0 ? 'empty_room' : 'user_left',
                targetUserIds: targetUserIds,
                timestamp: Date.now()
            }));

            return { callEnded: true };

        } else {
            await this.redis.publish('rtc:channel', JSON.stringify({
                event: 'user_left_call',
                roomId: roomId,
                userId: userId,
                targetUserIds: targetUserIds,
                timestamp: Date.now()
            }));

            return { callEnded: false };
        }
    }
}
