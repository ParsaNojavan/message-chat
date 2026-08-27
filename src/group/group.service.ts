import Context from '@app/contracts/models/dtos/rpcContext';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import RoomMember from 'src/models/concrete/member';
import Room from 'src/models/concrete/room';

@Injectable()
export class GroupService {
    constructor(@InjectConnection() private readonly connection: Connection,
        @InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>) { }

    async createGroup(name: string, avatar: string, context: Context) {

        const room = await this.roomModel.create({
            name: name,
            avatar: avatar,
            type: ChatType.GROUP
        })

        const owner = await this.memberModel.create({
            userId: context.sub,
            roomId: room._id,
            role: RoleType.OWNER,
            joinedAt: new Date()
        })

        return { room, owner };
    }

    async addMember(roomId: string, memberId: string):
        Promise<RoomMember> {

            console.log(roomId,memberId)

        const member = await this.memberModel.create({
            userId: memberId,
            roomId: roomId,
            role: RoleType.MEMBER,
            joinedAt: new Date()
        });

        return member;
    }

    async removeMember(roomId: string, memberId: string):
        Promise<void> {
        await this.memberModel.deleteOne({
            userId: memberId,
            roomId: roomId
        });
    }
}
