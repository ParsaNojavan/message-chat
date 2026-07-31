import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Room from './models/concrete/room';
import { Model, Types } from 'mongoose';
import Message from './models/concrete/message';
import RoomMember from './models/concrete/member';
import { ChatGateway } from './chat.gateway';
import { RoleType } from '@app/contracts/models/enums/role-type';
import MessageDto from '@app/contracts/models/dtos/chat/message.dto';

@Injectable()
export class ChatService {
  constructor(@InjectModel(Room.name) private roomModel: Model<Room>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>) { }

  async isUserMemberOfRoom(roomId: string, userId: string): Promise<boolean> {
    const isMember = await this.memberModel.exists({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId)
    })

    return !!isMember;
  }

  async joinRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException("Room not found");

    const existingRoom = await this.memberModel.findOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId)
    });

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

    return message;
  }
}
