import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import ResultDto from '@app/contracts/models/dtos/resultDto';
import Context from '@app/contracts/models/dtos/rpcContext';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { NormalizeObjectId } from '@app/contracts/utils/mongoose/normalizeObjectId';
import { BadRequestException, ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import RoomMember from 'src/models/concrete/member';
import Room from 'src/models/concrete/room';

@Injectable()
export class ChannelService {
    constructor(@InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>) { }

    async createChannel(name: string, avatar: string, context: Context)
        : Promise<DataResultDto<any>> {
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
            throw new ForbiddenException('user.remove.failed')
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


    async leaveChannels(roomIds: string[], userId: string): Promise<DataResultDto<{ leftRoomIds: string[] }>> {
        if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
            throw new BadRequestException('roomIds.array.required');
        }

        const validIds = roomIds.filter(id => Types.ObjectId.isValid(id));
        const objectIds = validIds.map(id => new Types.ObjectId(id));

        const groups = await this.roomModel.find({
            _id: { $in: objectIds },
            type: ChatType.CHANNEL
        }).select('_id').lean();

        const groupObjectIds = groups.map(g => g._id);
        const groupStrIds = groups.map(g => g._id.toString());

        if (groupObjectIds.length === 0) {
            throw new BadRequestException('no.valid.groups.found');
        }

        await this.memberModel.deleteMany({
            userId: { $in: [NormalizeObjectId.getObjectIdOrString(userId), userId.toString()] },
            roomId: { $in: [...groupObjectIds, ...groupStrIds] }
        });

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'groups.left.successfully',
            data: {
                leftRoomIds: groupStrIds
            }
        };
    }

    async deleteChannel(roomId: string, userId: string): Promise<DataResultDto<{ roomId: string; memberIds: string[] }>> {
        if (!roomId || !Types.ObjectId.isValid(roomId)) {
            throw new BadRequestException('invalid.roomId');
        }

        const normalizedRoomId = NormalizeObjectId.getObjectIdOrString(roomId);
        const normalizedUserId = NormalizeObjectId.getObjectIdOrString(userId);

        const member = await this.memberModel.findOne({
            roomId: { $in: [normalizedRoomId, roomId.toString()] },
            userId: { $in: [normalizedUserId, userId.toString()] }
        });

        if (!member || member.role !== RoleType.OWNER) {
            throw new ForbiddenException('only.owner.can.delete.group');
        }

        const allMembers = await this.memberModel.find({
            roomId: { $in: [normalizedRoomId, roomId.toString()] }
        }).select('userId').lean();

        const memberIds = allMembers.map(m => m.userId.toString());

        await this.memberModel.deleteMany({
            roomId: { $in: [normalizedRoomId, roomId.toString()] }
        });
        await this.roomModel.deleteOne({ _id: normalizedRoomId });

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'group.deleted',
            data: {
                roomId: roomId.toString(),
                memberIds
            }
        };
    }

}
