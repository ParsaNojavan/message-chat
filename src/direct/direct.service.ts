import { ChatType } from '@app/contracts/models/enums/chat-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import RoomMember from 'src/models/concrete/member';
import Room from 'src/models/concrete/room';
import { Context } from 'vm';

@Injectable()
export class DirectService {
    constructor(@InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>) { }

    async createDirectChat(userId: string, context: Context) {
        const room = await this.roomModel.create({
            name: '',
            avatar: '',
            type: ChatType.DM
        });

        const members = await this.memberModel.create([
            {
                roomId: room._id,
                userId: context.sub,
                role: RoleType.MEMBER,
                joinedAt: new Date(),
            },
            {
                roomId: room._id,
                userId: userId,
                role: RoleType.MEMBER,
                joinedAt: new Date(),
            },
        ])

        return {
            room: room,
            members: members
        }
    }
}
