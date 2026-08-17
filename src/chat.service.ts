import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Room from './models/concrete/room';
import { Model, Types } from 'mongoose';
import Message from './models/concrete/message';
import RoomMember from './models/concrete/member';
import { ChatGateway } from './chat.gateway';
import { RoleType } from '@app/contracts/models/enums/role-type';
import MessageDto from '@app/contracts/models/dtos/chat/message.dto';
import Redis from 'ioredis';
import { ClientProxy } from '@nestjs/microservices';
import { Context } from 'vm';
import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import { ChatType } from '@app/contracts/models/enums/chat-type';

@Injectable()
export class ChatService {
  constructor(@InjectModel(Room.name) private roomModel: Model<Room>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('notification-client') private notificationClient: ClientProxy) { }

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

  async createMessage(roomId: string, messageDto: MessageDto, media?: {
    mediaId: string;
    url: string;
    type: string;
  }[]): Promise<Message> {

    const message = await this.messageModel.create({
      roomId: roomId,
      senderId: messageDto.senderId,
      content: messageDto.content,
      media: media
    })

    const members = await this.memberModel
      .find({
        roomId: new Types.ObjectId(roomId),
        userId: { $ne: new Types.ObjectId(messageDto.senderId) },
      })
      .select('userId')
      .lean();

    const recipientIds = members.map((m) => m.userId.toString());

    this.notificationClient.emit('notification.send', {
      senderId: message.senderId.toString(),
      recipientIds: recipientIds,
      messageId: message._id.toString(),
      messagePreview:
        message.content.length > 50
          ? `${message.content.substring(0, 50)}...`
          : message.content,
      roomId: roomId,
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


}
