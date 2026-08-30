import { ForbiddenException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Room from './models/concrete/room';
import { Model, Types } from 'mongoose';
import Message from './models/concrete/message';
import type { MessageDocument } from './models/concrete/message';
import RoomMember from './models/concrete/member';
import { ChatGateway } from './chat.gateway';
import { RoleType } from '@app/contracts/models/enums/role-type';
import MessageDto from '@app/contracts/models/dtos/chat/message.dto';
import Redis from 'ioredis';
import { ClientProxy } from '@nestjs/microservices';
import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import ReactionDto from '@app/contracts/models/dtos/chat/reaction.dto';
import { NormalizeObjectId } from '@app/contracts/utils/mongoose/normalizeObjectId';
import { firstValueFrom } from 'rxjs';
import Context from '@app/contracts/models/dtos/rpcContext';

@Injectable()
export class ChatService {
  constructor(@InjectModel(Room.name) private roomModel: Model<Room>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('notification-client') private notificationClient: ClientProxy,
    @Inject('user-client') private userClient: ClientProxy) { }

  async isUserMemberOfRoom(roomId: string, userId: string): Promise<boolean> {
    const isMember = await this.memberModel.exists({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId)
    })

    return !!isMember;
  }

  async joinRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.roomModel.findById(new Types.ObjectId(roomId));
    if (!room) throw new NotFoundException("Room not found");

    console.log(room)

    const existingRoom = await this.memberModel.findOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId)
    });

    console.log(existingRoom)

    if (!existingRoom) {
      await this.memberModel.create({
        roomId: new Types.ObjectId(roomId),
        userId: new Types.ObjectId(userId),
        role: RoleType.MEMBER,
        joinedAt: new Date(),
      });
    }

  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const result = await this.memberModel.deleteOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0)
      throw new NotFoundException("You are not a member of this room");
  }

  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    const members = await this.memberModel
      .find({ roomId: new Types.ObjectId(roomId) })
      .populate('userId', 'username avatar email')
      .exec();

    return members;
  }



  async createMessage(
    roomId: string,
    messageDto: MessageDto,
    media?: {
      mediaId: string;
      url: string;
      type: string;
    }[]
  ): Promise<Message> {

    const message = await this.messageModel.create({
      roomId: roomId,
      senderId: messageDto.senderId,
      content: messageDto.content || '',
      media: media,
      replyTo: messageDto.replyTo,
      isForwarded: messageDto.isForwarded,
      forwardedFromUser: messageDto.forwardedFromUser,
      forwardedFromRoom: messageDto.forwardedFromRoom
    });

    if (message.replyTo) {
      await message.populate({
        path: 'replyTo',
        select: 'content senderId media isForwarded'
      });
    }

    const members = await this.memberModel
      .find({
        roomId: { $in: NormalizeObjectId.getObjectIdOrString(roomId) },
        userId: { $nin: NormalizeObjectId.getObjectIdOrString(messageDto.senderId) },
      })
      .select('userId')
      .lean();

    const recipientIds = members
      .map((m) => m.userId?.toString())
      .filter(Boolean);

    const previewText = message.content || (media?.length ? 'Sent an attachment' : '');

    this.notificationClient.emit('notification.send', {
      senderId: message.senderId.toString(),
      recipientIds: recipientIds,
      messageId: message._id.toString(),
      messagePreview:
        previewText.length > 50
          ? `${previewText.substring(0, 50)}...`
          : previewText,
      roomId: roomId.toString(),
    });

    return message;
  }

  async setUserOnline(userId: string) {
    const key = `presence:user-status:${userId}`;
    const connectionCount = await this.redis.incr(key);

    if (connectionCount === 1) {
      const eventData = JSON.stringify({ userId, status: 'online' });
      await this.redis.publish('presence:events', eventData);
    }
  }

  async setUserOffline(userId: string) {
    const key = `presence:user-status:${userId}`;
    const connectionCount = await this.redis.decr(key);

    if (connectionCount === 0) {

      const eventData = JSON.stringify({ userId, status: 'offline' });
      await this.redis.publish('presence:events', eventData);

      await this.redis.del(key);
    } else if (connectionCount < 0) {
      await this.redis.del(key);
    }
  }

  async getUsersPresence(userIds: string[]): Promise<Record<string, string>> {
    if (!userIds || userIds.length === 0) return {};

    const keys = userIds.map((id) => `presence:user-status:${id}`);
    const connectionCounts = await this.redis.mget(keys);

    const result: Record<string, string> = {};

    userIds.forEach((id, index) => {
      const val = connectionCounts[index];
      const count = val ? parseInt(val, 10) : 0;
      result[id] = count > 0 ? 'online' : 'offline';
    });

    return result;
  }

  async markAsSeen(roomId: string, messageIds: string[], context: Context): Promise<DataResultDto<any>> {

    const userId = context.sub;

    await this.messageModel.updateMany(
      { _id: { $in: messageIds }, roomId: roomId },
      { $set: { isRead: true }, $addToSet: { readBy: userId } }
    );

    this.notificationClient.emit('notification.read', {
      roomId,
      userId,
      messageIds
    });

    await this.redis.publish(`messages:event`, JSON.stringify({
      type: 'messages.seen',
      roomId,
      userId,
      messageIds,
    }
    ));

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'messages.seen.successfuly',
      data: {
        roomId,
        userId,
        messageIds,
      }
    }
  }

  async muteRoom(roomId: string, durationMinutes: number, context: Context): Promise<DataResultDto<any>> {

    let mutedUntil: Date | null = null;
    if (durationMinutes > 0) {
      mutedUntil = new Date();
      mutedUntil.setMinutes(mutedUntil.getMinutes() + durationMinutes);
    } else if (durationMinutes === -1) {
      mutedUntil = new Date();
      mutedUntil.setFullYear(mutedUntil.getFullYear() + 100);
    } else if (durationMinutes === 0) {
      mutedUntil = null;
    }

    const result = await this.memberModel.updateOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(context.sub)
    }, {
      mutedUntil: mutedUntil
    });

    if (result.matchedCount === 0) {
      throw new NotFoundException('room.member.notFound');
    }

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'user.muted.successfuly',
      data: {
        roomId: roomId,
        muted: mutedUntil
      }
    }
  }

  async getUserRooms(context: Context): Promise<DataResultDto<any>> {
    const userId = context.sub;

    const memberships = await this.memberModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate({
        path: 'roomId',
        select: 'type name avatar createdAt updatedAt'
      })
      .exec();

    const rooms = await Promise.all(memberships.map(async (member) => {
      const room = member.roomId as any;

      const roomData = {
        id: room._id,
        type: room.type,
        name: room.name,
        avatar: room.avatar,
        mutedUntil: member.mutedUntil,
        role: member.role,
        joinedAt: member.joinedAt,
      };

      if (room.type === 'DM') {
        const otherMember = await this.memberModel.findOne({
          roomId: room._id,
          userId: { $ne: new Types.ObjectId(userId) }
        }).select('userId').exec();

        if (otherMember) {
          roomData['targetUserId'] = otherMember.userId;
        }
      }

      return roomData;
    }));

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'rooms.fetched.successfuly',
      data: rooms,
    };

  }

  async isUserBlockedInRoom(roomId: string, senderId: string): Promise<boolean> {
    const room = await this.roomModel.findById(roomId).select('type members');

    if (!room) {
      throw new NotFoundException('روم یافت نشد');
    }

    if (room.type !== 'DM') {
      return false;
    }

    const otherMember = await this.memberModel.findOne({
      roomId: roomId,
      userId: { $ne: senderId }
    }).select('userId');

    if (!otherMember) {
      return false;
    }

    const redisKey = `user:${otherMember?.userId}:blocks`;
    const blockedData = await this.redis.get(redisKey);

    let isBlocked = false;

    if (blockedData) {
      const blockedUsersList = JSON.parse(blockedData);
      isBlocked = blockedUsersList.includes(senderId.toString());
    }

    return isBlocked;
  }

  async getSharedDmRoom(blockerId: string, blockedId: string): Promise<string> {

    const sharedRooms = await this.memberModel.aggregate([
      {
        $match: {
          userId: { $in: [new Types.ObjectId(blockerId), new Types.ObjectId(blockedId)] }
        }
      },
      {
        $group: {
          _id: '$roomId',
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: 2 }
      }
    ]);

    const sharedRoomIds = sharedRooms.map(room => room._id);
    const dmRoom = await this.roomModel.findOne({
      _id: { $in: sharedRoomIds },
      type: ChatType.DM
    });

    return dmRoom!._id.toString()
  }

  async channelPermission(roomId: string, userId: string) {

    let roomType = await this.redis.get(`room:${roomId}:type`);

    if (!roomType) {
      const room = await this.roomModel.findById(roomId).select('type');
      if (!room) throw new NotFoundException('Room not found');

      roomType = room.type;
      await this.redis.set(`room:${roomId}:type`, roomType)
    }


    if (roomType !== ChatType.CHANNEL) return true;

    const isAdmin = await this.redis.sismember(`channel:${roomId}:admins`, userId);

    if (isAdmin === 1) return true;

    const member = await this.memberModel.findOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId)
    }).select('role')

    if (member && (member.role === RoleType.ADMIN || member.role === RoleType.OWNER)) {
      await this.redis.sadd(`channel:${roomId}:admins`, userId);
      return true;
    }

    return false;
  }

  async toggleReaction(userId: string, reaction: ReactionDto) {
    const message = await this.messageModel.findById(reaction.messageId);
    if (!message) throw new NotFoundException('message.not-found')

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString(),
    );

    if (existingReactionIndex > -1) {
      const existingEmoji = message.reactions[existingReactionIndex].emoji;

      if (existingEmoji === reaction.emoji) {
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        message.reactions[existingReactionIndex].emoji = reaction.emoji;
      }
    } else {
      message.reactions.push({
        userId: new Types.ObjectId(userId),
        emoji: reaction.emoji,
      });
    }

    await message.save();

    return {
      roomId: message.roomId.toString(),
      messageId: message._id,
      reactions: message.reactions,
    };
  }

  async getRoomMessages(roomId: string, limit: number = 20, context: Context, messageId?: string) {

    const normalizedRoomId = NormalizeObjectId.getObjectIdOrString(roomId);
    const normalizedUserId = NormalizeObjectId.getObjectIdOrString(context.sub);

    const memberShip = await this.memberModel
      .findOne({ roomId: normalizedRoomId, userId: normalizedUserId })
      .lean()
      .exec();

    if (!memberShip) throw new ForbiddenException('access denied');


    let cursorDate: Date | null = null;

    if (messageId) {
      const targetMessage = await this.messageModel
        .findOne({
          _id: NormalizeObjectId.getObjectIdOrString(messageId),
          roomId: normalizedRoomId
        })
        .select('_id createdAt')
        .exec();

      if (!targetMessage) {
        throw new NotFoundException('Message not found');
      }

      cursorDate = targetMessage.createdAt;
    }

    const query: Record<string, any> = { roomId: NormalizeObjectId.getObjectIdOrString(roomId) };
    if (cursorDate) {
      query.createdAt = { $lt: cursorDate };
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    const sortedMessages = messages.reverse();

    const senderIds = Array.from(
      new Set(
        sortedMessages
          .map((msg) => msg.senderId?.toString())
          .filter(Boolean)
      )
    );

    let userMap = new Map<string, any>();

    if (senderIds.length > 0) {
      try {
        const response = await firstValueFrom(
          this.userClient.send('users.details', { userIds: senderIds })
        );

        const users: any[] = response?.data || response || [];

        userMap = new Map(
          users.map((user) => [user._id.toString(), user])
        );
      } catch (error) {

        console.error('Failed to fetch user details:', error);
      }
    }

    const populatedMessages = sortedMessages.map((msg) => ({
      ...msg,
      sender: userMap.get(msg.senderId?.toString()) || null,
    }));

    return {
      messages: populatedMessages,
      hasMore: messages.length === limit,
      nextCursor: sortedMessages.length > 0 ? populatedMessages[0]._id : null,
    };
  }

  async searchRoomMessages(
    roomId: string,
    query: string,
    limit: number = 20,
    context: Context,
    messageId?: string
  ) {
    const normalizedRoomId = NormalizeObjectId.getObjectIdOrString(roomId);
    const normalizedUserId = NormalizeObjectId.getObjectIdOrString(context.sub);

    const memberShip = await this.memberModel
      .findOne({
        roomId: normalizedRoomId,
        userId: normalizedUserId,
      })
      .lean()
      .exec();

    if (!memberShip) {
      throw new ForbiddenException('Access denied to room');
    }

    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {

      return { messages: [], hasMore: false, nextCursor: null };
    }

    const escapedQuery = trimmedQuery.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&');

    const filter: any = {
      roomId: { $in: normalizedRoomId },
      content: { $regex: escapedQuery, $options: 'i' },
    };

    console.log(filter)

    if (messageId) {
      const normalizedMessageId = NormalizeObjectId.getObjectIdOrString(messageId);
      const baseMessage = await this.messageModel
        .findById(normalizedMessageId)
        .lean()
        .exec();

      if (baseMessage) {
        filter.createdAt = { $lt: baseMessage.createdAt };
      }
    }

    const messages = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    console.log(messages)

    if (messages.length === 0) {
      return { messages: [], hasMore: false, nextCursor: null };
    }

    const senderIds = [...new Set(messages.map((m) => m.senderId?.toString()).filter(Boolean))];
    let usersMap = new Map();

    if (senderIds.length > 0) {
      try {
        const users = await firstValueFrom(
          this.userClient.send('users.details', { userIds: senderIds }),
        );
        if (Array.isArray(users)) {
          usersMap = new Map(users.map((u: any) => [(u.id || u._id)?.toString(), u]));
        }
      } catch {
        // continue without user details
      }
    }

    const populatedMessages = messages.map((m) => ({
      ...m,
      sender: usersMap.get(m.senderId?.toString()) || null,
    }));

    return {
      messages: populatedMessages,
      hasMore: messages.length === limit,
      nextCursor: messages[messages.length - 1]._id,
    };
  }

  async searchUserMessages(userId: string, query: string, limit = 20): Promise<DataResultDto<any>> {
    if (!query || query.trim() === '') {
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'messages fetched',
        data: [],
      };
    }

    const memberships = await this.memberModel
      .find({
        userId: NormalizeObjectId.getObjectIdOrString(userId),
      })
      .select('roomId')
      .lean();

    const roomIds = memberships.map((m) => m.roomId);
    if (!roomIds.length) {
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'messages fetched',
        data: [],
      };
    }

    const expandedRoomIds = roomIds.reduce((acc: any[], id: any) => {
      acc.push(id);
      if (id) acc.push(id.toString());
      return acc;
    }, []);

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const messages = await this.messageModel
      .find({
        roomId: { $in: expandedRoomIds },
        content: { $regex: escapedQuery, $options: 'i' },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (!messages.length) {
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'messages fetched',
        data: [],
      };
    }

    const senderIds = [...new Set(messages.map((m) => m.senderId?.toString()).filter(Boolean))];
    const messageRoomIds = [...new Set(messages.map((m) => m.roomId?.toString()).filter(Boolean))];

    const [usersResponse, rooms] = await Promise.all([
      senderIds.length
        ? firstValueFrom(this.userClient.send('users.details', senderIds))
        : [],
      messageRoomIds.length
        ? this.roomModel.find({ _id: { $in: messageRoomIds } }).lean()
        : [],
    ]);

    const userMap = new Map(
      usersResponse.data.map((u: any) => [
        (u._id || u.id)?.toString(),
        u,
      ] as [string, any])
    );

    const roomMap = new Map(
      (rooms || []).map((r: any) => [
        r._id.toString(),
        r,
      ] as [string, any])
    );

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'messages fetched successfully',
      data: messages.map((msg) => ({
        ...msg,
        sender: userMap.get(msg.senderId?.toString()) || null,
        room: roomMap.get(msg.roomId?.toString()) || null,
      })),
    };
  }

  async searchRooms(
    userId: string,
    query: string,
    limit = 10,
  ): Promise<DataResultDto<{ myRooms: any[]; globalRooms: any[] }>> {
    if (!query || query.trim() === '') {
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Search query is empty',
        data: { myRooms: [], globalRooms: [] },
      };
    }

    const cleanQuery = query.trim();
    const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexFilter = { $regex: escapedQuery, $options: 'i' };

    const userMemberships = await this.memberModel
      .find({ userId: NormalizeObjectId.getObjectIdOrString(userId) })
      .select('roomId')
      .lean();

    const myRoomIds = userMemberships.map((m) => m.roomId);

    const expandedMyRoomIds = myRoomIds.reduce((acc: any[], id: any) => {
      if (id) {
        acc.push(id);
        acc.push(id.toString());
      }
      return acc;
    }, []);

    const myNamedRoomsPromise = this.roomModel
      .find({
        _id: { $in: expandedMyRoomIds },
        type: { $in: [ChatType.GROUP, ChatType.CHANNEL] },
        name: regexFilter,
      })
      .limit(limit)
      .lean();

    const myDMRoomsPromise = (async () => {
      const dmRooms = await this.roomModel
        .find({
          _id: { $in: expandedMyRoomIds },
          type: ChatType.DM,
        })
        .select('_id')
        .lean();

      if (dmRooms.length === 0) return [];

      const dmRoomIds = dmRooms.map((r) => r._id);

      const otherMembers = await this.memberModel
        .find({
          roomId: { $in: dmRoomIds },
          userId: { $ne: NormalizeObjectId.getObjectIdOrString(userId) },
        })
        .select('roomId userId')
        .lean();

      if (otherMembers.length === 0) return [];

      const otherUserIds = Array.from(new Set(otherMembers.map((m) => m.userId.toString())));

      const usersResponse = await firstValueFrom(this.userClient.send(
        'users.details',
        { userIds: otherUserIds, query: cleanQuery }
      ));

      const matchedUserIds = new Set(
        (usersResponse || [])
          .filter((u: any) =>
            (u.name && u.name.toLowerCase().includes(cleanQuery.toLowerCase())) ||
            (u.username && u.username.toLowerCase().includes(cleanQuery.toLowerCase()))
          )
          .map((u: any) => u._id?.toString() || u.id?.toString())
      );

      const matchedDmRoomIds = otherMembers
        .filter((m) => matchedUserIds.has(m.userId.toString()))
        .map((m) => m.roomId);

      return this.roomModel
        .find({ _id: { $in: matchedDmRoomIds } })
        .limit(limit)
        .lean();
    })();

    const globalRoomsPromise = this.roomModel
      .find({
        _id: { $nin: expandedMyRoomIds },
        type: { $in: [ChatType.GROUP, ChatType.CHANNEL] },
      })
      .limit(limit)
      .lean();

    const [myNamedRooms, myDMRooms, globalRooms] = await Promise.all([
      myNamedRoomsPromise,
      myDMRoomsPromise,
      globalRoomsPromise,
    ]);

    const myRooms = [...myNamedRooms, ...myDMRooms].slice(0, limit);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Rooms search completed successfully',
      data: {
        myRooms,
        globalRooms,
      },
    };
  }
}
