import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import ResultDto from '@app/contracts/models/dtos/resultDto';
import Context from '@app/contracts/models/dtos/rpcContext';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { NormalizeObjectId } from '@app/contracts/utils/mongoose/normalizeObjectId';
import { BadRequestException, ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
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

    async getCommonRooms(
        currentUserId: string | Types.ObjectId,
        targetUserId: string | Types.ObjectId,
        cursor?: string,
        limit: number | string = 20,
    ): Promise<DataResultDto<any>> {
        if (!currentUserId || !Types.ObjectId.isValid(currentUserId)) {
            throw new BadRequestException('currentUserId is required and must be valid');
        }
        if (!targetUserId || !Types.ObjectId.isValid(targetUserId)) {
            throw new BadRequestException('targetUserId is required and must be valid');
        }

        const currentObjId = new Types.ObjectId(currentUserId);
        const targetObjId = new Types.ObjectId(targetUserId);

        if (currentObjId.equals(targetObjId)) {
            throw new BadRequestException('cannot check common rooms with yourself');
        }

        const currentStr = currentUserId.toString();
        const targetStr = targetUserId.toString();
        const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

        const commonRoomAgg = await this.memberModel.aggregate<{ _id: string }>([
            {
                $match: {
                    userId: {
                        $in: [currentObjId, targetObjId, currentStr, targetStr],
                    },
                },
            },
            {
                $group: {
                    _id: { $toString: '$roomId' },
                    users: { $addToSet: { $toString: '$userId' } },
                },
            },
            {
                $match: {
                    users: { $all: [currentStr, targetStr] },
                },
            },
            {
                $project: { _id: 1 },
            },
        ]);

        if (!commonRoomAgg || commonRoomAgg.length === 0) {
            return {
                success: true,
                statusCode: HttpStatus.OK,
                message: 'common-rooms.empty',
                data: { items: [], nextCursor: null },
            };
        }

        const commonRoomObjectIds = commonRoomAgg
            .filter((item) => Types.ObjectId.isValid(item._id))
            .map((item) => new Types.ObjectId(item._id));

        const filterQuery: any = {
            _id: { $in: commonRoomObjectIds },
            type: ChatType.GROUP,
        };

        if (cursor) {
            if (!Types.ObjectId.isValid(cursor)) {
                throw new BadRequestException('cursor invalid');
            }
            filterQuery._id = {
                $in: commonRoomObjectIds,
                $lt: new Types.ObjectId(cursor),
            };
        }

        const rooms = await this.roomModel
            .find(filterQuery)
            .sort({ _id: -1 })
            .limit(parsedLimit + 1)
            .select('name avatar type createdAt updatedAt')
            .lean();

        const hasNext = rooms.length > parsedLimit;
        const items = hasNext ? rooms.slice(0, parsedLimit) : rooms;
        const nextCursor = hasNext && items.length > 0 ? items[items.length - 1]._id.toString() : null;

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'common-rooms.fetched.successfully',
            data: {
                items,
                nextCursor,
            },
        };
    }
}
