import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import ResultDto from '@app/contracts/models/dtos/resultDto';
import Context from '@app/contracts/models/dtos/rpcContext';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { NormalizeObjectId } from '@app/contracts/utils/mongoose/normalizeObjectId';
import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import RoomMember from 'src/models/concrete/member';
import Room from 'src/models/concrete/room';

@Injectable()
export class GroupService {
    constructor(@InjectConnection() private readonly connection: Connection,
        @InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>) { }

    async createGroup(name: string, avatar: string, context: Context)
        : Promise<DataResultDto<any>> {

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

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            message: 'channel.created',
            data: {
                channel: room,
                owner: owner
            }
        };
    }

    async addMember(roomId: string, memberId: string, context: Context)
        : Promise<DataResultDto<any>> {

        const permissionMember = await this.memberModel.findOne({
            roomId: NormalizeObjectId.getObjectIdOrString(roomId),
            userId: NormalizeObjectId.getObjectIdOrString(context.sub)
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

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            message: 'member.created',
            data: {
                member: member
            }
        };
    }

    async removeMember(roomId: string, memberId: string, context: Context)
        : Promise<ResultDto> {

        const permissionMember = await this.memberModel.findOne({
            roomId: NormalizeObjectId.getObjectIdOrString(roomId),
            userId: NormalizeObjectId.getObjectIdOrString(context.sub)
        })

        if (permissionMember?.role !== RoleType.ADMIN && permissionMember?.role !== RoleType.OWNER) {
            throw new ForbiddenException('user.add.failed')
        }

        await this.memberModel.deleteOne({
            userId: memberId,
            roomId: roomId
        });

        return {
            success: true,
            statusCode: HttpStatus.NO_CONTENT,
            message: 'user.removed'
        }
    }
}
