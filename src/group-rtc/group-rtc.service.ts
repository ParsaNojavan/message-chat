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

    private async clearCallTimeout(roomId: string): Promise<void> {
        const pattern = `call_timeout:${roomId.toString()}:*`;
        let cursor = '0';
        const keys: string[] = [];

        do {
            const [nextCursor, scannedKeys] = await this.redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                100,
            );
            cursor = nextCursor;
            if (scannedKeys.length > 0) {
                keys.push(...scannedKeys);
            }
        } while (cursor !== '0');

        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
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
        const participantsKey = `call_participants:${nRoomId}`;

        // ۱. بررسی و اضافه کردن کاربر به لیست حاضرین
        const isNewParticipant = await this.redis.sadd(participantsKey, nUserId);
        await this.redis.expire(participantsKey, this.CALL_TTL_SECONDS);

        // ۲. تلاش برای ایجاد تماس اتمیک
        const isNewCall = await this.redis.set(
            activeRoomKey,
            'active',
            'EX',
            this.CALL_TTL_SECONDS,
            'NX',
        );

        if (isNewCall === 'OK') {
            const timeoutKey = `call_timeout:${nRoomId}:${nUserId}`;
            await this.redis.set(timeoutKey, 'ringing', 'EX', 35);

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
        } else if (isNewParticipant === 1) {
            // تماس از قبل برقرار بوده و شخص دیگری (پاسخ‌دهنده) وارد شده -> تایمر لغو شود
            await this.clearCallTimeout(nRoomId);
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

        await this.clearCallTimeout(nRoomId);
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

        await this.clearCallTimeout(nRoomId);
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

        const roomIds = userMemberships.map((member) => member.roomId?.toString());

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

    async handleMissedCall(callerId: string, roomId: string) {
        const nRoomId = roomId.toString();
        const nCallerId = callerId.toString();

        const lockKey = `lock:missed_call:${nRoomId}:${nCallerId}`;
        const acquired = await this.redis.set(lockKey, 'locked', 'EX', 10, 'NX');
        if (!acquired) {
            return;
        }

        const activeRoomKey = `active_room:${nRoomId}`;
        const participantsKey = `call_participants:${nRoomId}`;
        const redisCallKey = `active_call:${nCallerId}`;

        await this.redis.del(activeRoomKey);
        await this.redis.del(participantsKey);
        await this.redis.del(redisCallKey);
        await this.clearCallTimeout(nRoomId);

        const allMembers = await this.getAllMemberIds(nRoomId);
        const recipientIds = await this.getOtherMemberIds(nRoomId, nCallerId);

        const missedCallMessage = await this.messageModel.create({
            roomId: nRoomId,
            type: MessageType.CALL_MISSED,
            senderId: nCallerId,
        });

        await this.redis.publish(
            'rtc:channel',
            JSON.stringify({
                event: 'call_missed',
                roomId: nRoomId,
                callerId: nCallerId,
                targetUserIds: allMembers,
                message: missedCallMessage,
                timestamp: Date.now(),
            }),
        );

        const contentString = 'Missed Call';
        this.notificationClient.emit('notification.send', {
            type: 'notification.send',
            senderId: nCallerId,
            recipientIds: recipientIds,
            messageId: missedCallMessage._id.toString(),
            messagePreview: contentString,
            roomId: nRoomId,
        });
    }
}
