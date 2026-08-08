import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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

  async createMessage(roomId: string, messageDto: MessageDto): Promise<Message> {
    const message = await this.messageModel.create({
      roomId: roomId,
      senderId: messageDto.senderId,
      content: messageDto.content
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

  async markAsSeen(roomId: string, userId: string, messageIds: string[]) {
    await this.messageModel.updateMany(
      { _id: { $in: messageIds }, roomId: roomId },
      { $set: { isRead: true }, $addToSet: { readBy: userId } }
    );

    this.notificationClient.emit('notification.read', {
      roomId,
      userId,
      messageIds
    });

    await this.redis.publish(`messages:events`, JSON.stringify({
      event: 'messages.seen',
      data: {
        roomId,
        userId,
        messageIds,
      }
    }));
  }

}
