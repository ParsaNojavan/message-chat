import Context from '@app/contracts/models/dtos/rpcContext';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import RoomMember from 'src/models/concrete/member';
import Room from 'src/models/concrete/room';

@Injectable()
export class ChannelService {
    constructor(@InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>) { }

    async createChannel(name: string, avatar: string, context: Context) {
        const room = await this.roomModel.create({
            name: name,
            avatar: avatar,
            type: ChatType.CHANNEL
        })

        const owner = await this.memberModel.create({
            userId: context.sub,
            roomId: room._id,
            role: RoleType.OWNER,
            joinedAt: new Date()
        })

        return { room, owner };
    }

    async addMember(roomId: string, memberId: string, context: Context):
        Promise<RoomMember> {

        const permissionMember = await this.memberModel.findOne({
            roomId: new Types.ObjectId(roomId),
            userId: new Types.ObjectId(context.sub)
        })

        if (permissionMember?.role !== RoleType.ADMIN && permissionMember?.role !== RoleType.OWNER) {
            throw new ForbiddenException('user.add.failed')
        }

        const member = await this.memberModel.create({
            userId: memberId,
            roomId: roomId,
            role: RoleType.MEMBER,
            joinedAt: new Date()
        });

        return member;
    }

    async removeMember(roomId: string, memberId: string, context: Context):
        Promise<void> {

        const permissionMember = await this.memberModel.findOne({
            roomId: new Types.ObjectId(roomId),
            userId: new Types.ObjectId(context.sub)
        })

        if (permissionMember?.role !== RoleType.ADMIN && permissionMember?.role !== RoleType.OWNER) {
            throw new ForbiddenException('user.remove.failed')
        }

        await this.memberModel.deleteOne({
            userId: memberId,
            roomId: roomId
        });
    }
}
