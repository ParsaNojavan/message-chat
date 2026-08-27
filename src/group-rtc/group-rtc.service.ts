import Context from '@app/contracts/models/dtos/rpcContext';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

    async createToken(roomId: string, context: Context) {

        const userId = context.sub;
        console.log(userId)

        if (!roomId || !userId) {
            throw new UnauthorizedException('Room ID and User ID are required');
        }

        const redisCallKey = `active_call:${userId}`;
        const currentActiveRoom = await this.redis.get(redisCallKey);

        if (currentActiveRoom && currentActiveRoom !== roomId)
            throw new ConflictException('already in call');

        const room = await this.roomModel.findOne({ _id: new Types.ObjectId(roomId) })
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

        if (!isRoomActive) {
            await this.redis.set(activeRoomKey, 'active', 'EX', 7200);

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
        const ttlSeconds = 2 * 60 * 60;

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
}
