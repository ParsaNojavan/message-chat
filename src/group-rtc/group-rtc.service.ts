import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import { MessageType } from '@app/contracts/models/enums/message-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpStatus,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { AccessToken } from 'livekit-server-sdk';
import { Model } from 'mongoose';
import RoomMember from 'src/models/concrete/member';
import Message from 'src/models/concrete/message';
import Room from 'src/models/concrete/room';
import { NormalizeObjectId } from '@app/contracts/utils/mongoose/normalizeObjectId';

@Injectable()
export class GroupRtcService {
    private readonly livekitApiKey = process.env.LIVEKIT_API_KEY;
    private readonly livekitApiSecret = process.env.LIVEKIT_API_SECRET;
    private readonly CALL_TTL_SECONDS = 2 * 60 * 60;

    constructor(
        @InjectModel(RoomMember.name) private readonly memberModel: Model<RoomMember>,
        @InjectModel(Room.name) private readonly roomModel: Model<Room>,
        @InjectModel(Message.name) private readonly messageModel: Model<Message>,
        @Inject('notification-client') private readonly notificationClient: ClientProxy,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
    ) { }

    private async getAllMemberIds(roomId: string): Promise<string[]> {
        const members = await this.memberModel
            .find({
                roomId: { $in: NormalizeObjectId.getObjectIdOrString(roomId) },
            })
            .select('userId')
            .lean();

        return [
            ...new Set(
                members
                    .map((m) => m.userId?.toString())
                    .filter((id): id is string => Boolean(id))
            ),
        ];
    }

    private async getOtherMemberIds(roomId: string, excludeUserId: string): Promise<string[]> {
        const members = await this.memberModel
            .find({
                roomId: { $in: NormalizeObjectId.getObjectIdOrString(roomId) },
                userId: { $nin: NormalizeObjectId.getObjectIdOrString(excludeUserId) },
            })
            .select('userId')
            .lean();

        const excludeStr = excludeUserId.toString();

        return [
            ...new Set(
                members
                    .map((m) => m.userId?.toString())
                    .filter((id): id is string => Boolean(id) && id !== excludeStr)
            ),
        ];
    }

    async createToken(roomId: string, userId: string) {
        if (!roomId || !userId) {
            throw new BadRequestException('Room ID and User ID are required');
        }

        const nRoomId = roomId.toString();
        const nUserId = userId.toString();

        const redisCallKey = `active_call:${nUserId}`;
        const currentActiveRoom = await this.redis.get(redisCallKey);

        if (currentActiveRoom && currentActiveRoom !== nRoomId) {
            throw new ConflictException('already in call');
        }

        const room = await this.roomModel.findById(nRoomId);
        if (!room) {
            throw new NotFoundException('room not found');
        }

        const roomMember = await this.memberModel.findOne({
            roomId: { $in: NormalizeObjectId.getObjectIdOrString(nRoomId) },
            userId: { $in: NormalizeObjectId.getObjectIdOrString(nUserId) },
        });

        if (!roomMember) {
            throw new ForbiddenException('access.denied');
        }

        const targetUserIds = await this.getOtherMemberIds(nRoomId, nUserId);

        const activeRoomKey = `active_room:${nRoomId}`;
        const isRoomActive = await this.redis.get(activeRoomKey);

        if (!isRoomActive) {
            await this.redis.set(activeRoomKey, 'active', 'EX', this.CALL_TTL_SECONDS);

            await this.redis.publish(
                'rtc:channel',
                JSON.stringify({
                    event: 'incoming_call',
                    roomId: nRoomId,
                    roomName: room.name,
                    roomAvatar: room.avatar,
                    callerId: nUserId,
                    targetUserIds: targetUserIds,
                    timestamp: Date.now(),
                }),
            );

            this.notificationClient.emit('notification.send', {
                type: 'notification.send',
                senderId: nUserId,
                recipientIds: targetUserIds,
                messagePreview: 'new incoming call',
                roomId: nRoomId,
            });
        }

        const isAdmin = roomMember.role === RoleType.ADMIN;
        const name = isAdmin
            ? `Admin-${nUserId.substring(0, 5)}`
            : `Member-${nUserId.substring(0, 5)}`;

        const at = new AccessToken(this.livekitApiKey, this.livekitApiSecret, {
            identity: nUserId,
            name: name,
            ttl: '2h',
        });

        at.addGrant({
            roomJoin: true,
            room: nRoomId,
            canPublish: true,
            canSubscribe: true,
            roomAdmin: isAdmin,
        });

        const participantsKey = `call_participants:${nRoomId}`;
        await this.redis.sadd(participantsKey, nUserId);
        await this.redis.expire(participantsKey, this.CALL_TTL_SECONDS);

        await this.redis.set(redisCallKey, nRoomId, 'EX', this.CALL_TTL_SECONDS);

        await this.redis.publish(
            'rtc:channel',
            JSON.stringify({
                event: 'user_joining_call',
                roomId: nRoomId,
                userId: nUserId,
                name: name,
                targetUserIds: targetUserIds,
                timestamp: Date.now(),
            }),
        );

        return {
            rpcToken: (await at.toJwt()).toString(),
        };
    }

    async handleDecline(roomId: string, userId: string): Promise<{ callEnded: boolean }> {
        const nRoomId = roomId.toString();
        const nUserId = userId.toString();

        const room = await this.roomModel.findById(nRoomId);
        if (!room) throw new NotFoundException('Room not found');

        const participantsKey = `call_participants:${nRoomId}`;
        const activeRoomKey = `active_room:${nRoomId}`;
        const redisCallKey = `active_call:${nUserId}`;

        await this.redis.del(redisCallKey);
        await this.redis.srem(participantsKey, nUserId);

        const remainingCount = await this.redis.scard(participantsKey);
        const targetUserIds = await this.getOtherMemberIds(nRoomId, nUserId);

        if (room.type === ChatType.GROUP) {
            await this.redis.publish(
                'rtc:channel',
                JSON.stringify({
                    event: 'user_declined',
                    roomId: nRoomId,
                    userId: nUserId,
                    targetUserIds: targetUserIds,
                    timestamp: Date.now(),
                }),
            );

            if (remainingCount === 0) {
                await this.redis.del(activeRoomKey);
                await this.redis.del(participantsKey);

                const allMembers = await this.getAllMemberIds(nRoomId);

                await this.redis.publish(
                    'rtc:channel',
                    JSON.stringify({
                        event: 'call_ended',
                        roomId: nRoomId,
                        reason: 'empty_room',
                        targetUserIds: allMembers,
                        timestamp: Date.now(),
                    }),
                );

                return { callEnded: true };
            }

            return { callEnded: false };
        } else {

            await this.redis.del(activeRoomKey);
            await this.redis.del(participantsKey);

            const allMembers = await this.getAllMemberIds(nRoomId);

            await this.redis.publish(
                'rtc:channel',
                JSON.stringify({
                    event: 'call_declined',
                    roomId: nRoomId,
                    userId: nUserId,
                    targetUserIds: allMembers,
                    timestamp: Date.now(),
                }),
            );

            const declinedMessage = await this.messageModel.create({
                roomId: nRoomId,
                type: MessageType.CALL_DECLINED,
                senderId: nUserId,
            });

            const contentString = 'call declined';
            this.notificationClient.emit('notification.send', {
                type: 'notification.send',
                senderId: nUserId,
                recipientIds: targetUserIds,
                messageId: declinedMessage._id.toString(),
                messagePreview:
                    contentString.length > 50
                        ? `${contentString.substring(0, 50)}...`
                        : contentString,
                roomId: nRoomId,
            });

            return { callEnded: true };
        }
    }

    async leaveCall(roomId: string, userId: string): Promise<{ callEnded: boolean }> {
        const nRoomId = roomId.toString();
        const nUserId = userId.toString();

        const room = await this.roomModel.findById(nRoomId);
        if (!room) throw new NotFoundException('Room not found');

        const participantsKey = `call_participants:${nRoomId}`;
        const activeRoomKey = `active_room:${nRoomId}`;
        const redisCallKey = `active_call:${nUserId}`;

        await this.redis.del(redisCallKey);
        await this.redis.srem(participantsKey, nUserId);

        const remainingCount = await this.redis.scard(participantsKey);
        const shouldEndCall = room.type !== ChatType.GROUP || remainingCount === 0;

        if (shouldEndCall) {
            await this.redis.del(activeRoomKey);
            await this.redis.del(participantsKey);

            const allMembers = await this.getAllMemberIds(nRoomId);
            const notificationRecipients = await this.getOtherMemberIds(nRoomId, nUserId);

            await this.redis.publish(
                'rtc:channel',
                JSON.stringify({
                    event: 'call_ended',
                    roomId: nRoomId,
                    reason: remainingCount === 0 ? 'empty_room' : 'user_left',
                    targetUserIds: allMembers,
                    timestamp: Date.now(),
                }),
            );

            const endedMessage = await this.messageModel.create({
                roomId: nRoomId,
                type: MessageType.CALL_ENDED,
                senderId: nUserId,
            });

            const contentString = 'call ended';
            this.notificationClient.emit('notification.send', {
                type: 'notification.send',
                senderId: nUserId,
                recipientIds: notificationRecipients,
                messageId: endedMessage._id.toString(),
                messagePreview: contentString,
                roomId: nRoomId,
            });

            return { callEnded: true };
        } else {
            const otherMembers = await this.getOtherMemberIds(nRoomId, nUserId);

            await this.redis.publish(
                'rtc:channel',
                JSON.stringify({
                    event: 'user_left_call',
                    roomId: nRoomId,
                    userId: nUserId,
                    targetUserIds: otherMembers,
                    remainingCount: remainingCount,
                    timestamp: Date.now(),
                }),
            );

            return { callEnded: false };
        }
    }

    async getCalls(userId: string, page: number = 1, limit: number = 20): Promise<DataResultDto<any>> {
        const nUserId = userId.toString();
        const skip = (page - 1) * limit;

        const userMemberships = await this.memberModel
            .find({ userId: { $in: NormalizeObjectId.getObjectIdOrString(nUserId) } })
            .select('roomId')
            .lean();

        const roomIds = userMemberships.map((member) => member.roomId);

        if (roomIds.length === 0) {
            return {
                statusCode: HttpStatus.OK,
                success: true,
                message: 'calls.fetch.success',
                data: {
                    totalItems: 0,
                    totalPages: 0,
                    currentPage: page,
                    calls: [],
                },
            };
        }

        const filterQuery = {
            roomId: { $in: roomIds },
            type: {
                $in: [
                    MessageType.CALL_DECLINED,
                    MessageType.CALL_ENDED,
                    MessageType.CALL_MISSED,
                ],
            },
        };

        const [calls, total] = await Promise.all([
            this.messageModel
                .find(filterQuery)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('senderId', 'firstName lastName avatar username')
                .populate('roomId', 'type name avatar')
                .lean(),

            this.messageModel.countDocuments(filterQuery),
        ]);

        const formattedCalls = calls.map((call: any) => {
            const isCaller = call.senderId?._id?.toString() === nUserId;

            return {
                _id: call._id,
                roomId: call.roomId,
                isCaller,
                callData: call.callData,
                createdAt: call.createdAt,
                type: call.type,
                caller: call.senderId,
            };
        });

        return {
            statusCode: HttpStatus.OK,
            success: true,
            message: 'calls.fetch.success',
            data: {
                totalItems: total,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                calls: formattedCalls,
            },
        };
    }
}
