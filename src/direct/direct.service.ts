import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import { ChatType } from '@app/contracts/models/enums/chat-type';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { NormalizeObjectId } from '@app/contracts/utils/mongoose/normalizeObjectId';
import { BadRequestException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

    async deleteRoomsForMe(roomIds: string[], userId: string): Promise<DataResultDto<{ deletedRoomIds: string[] }>> {
        if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
            throw new BadRequestException('roomIds.array.required');
        }

        const normalizedUserIds = [
            ...[NormalizeObjectId.getObjectIdOrString(userId)].flat(),
            new Types.ObjectId(userId),
            userId.toString(),
        ];

        const normalizedRoomIds = roomIds
            .filter(id => Types.ObjectId.isValid(id))
            .flatMap(id => [
                ...[NormalizeObjectId.getObjectIdOrString(id)].flat(),
                new Types.ObjectId(id),
                id.toString(),
            ]);

        if (normalizedRoomIds.length === 0) {
            throw new BadRequestException('valid.roomIds.required');
        }

        const allowedRooms = await this.roomModel.find({
            _id: { $in: normalizedRoomIds },
            type: { $in: [ChatType.DM, ChatType.SAVED] }
        }).select('_id').lean();

        const allowedRoomIds = allowedRooms.flatMap(r => [
            r._id,
            r._id.toString(),
            new Types.ObjectId(r._id.toString())
        ]);
        const allowedRoomIdsStr = allowedRooms.map(r => r._id.toString());

        if (allowedRooms.length === 0) {
            throw new BadRequestException('no.valid.dm.or.saved.rooms.found');
        }

        const now = new Date();

        await this.memberModel.updateMany(
            {
                userId: { $in: normalizedUserIds },
                roomId: { $in: allowedRoomIds }
            },
            {
                $set: {
                    clearedAt: now,
                    isHiddenInList: true,
                    pinnedAt: null,
                }
            }
        );

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'rooms.deleted.for.me',
            data: {
                deletedRoomIds: allowedRoomIdsStr
            }
        };
    }

    async deleteDirectMutual(roomId: string, userId: string): Promise<DataResultDto<{ roomId: string; participantIds: string[] }>> {
        if (!roomId || !Types.ObjectId.isValid(roomId)) {
            throw new BadRequestException('invalid.roomId');
        }

        const normalizedRoomIds = [
            ...[NormalizeObjectId.getObjectIdOrString(roomId)].flat(),
            new Types.ObjectId(roomId),
            roomId.toString(),
        ];

        const room = await this.roomModel.findOne({
            _id: { $in: normalizedRoomIds }
        }).lean();

        if (!room) {
            throw new NotFoundException('room.not.found');
        }

        if (room.type !== ChatType.DM) {
            throw new BadRequestException('mutual.delete.only.allowed.in.dm');
        }

        const members = await this.memberModel.find({
            roomId: { $in: normalizedRoomIds }
        }).lean();

        const isMember = members.some(m => m.userId.toString() === userId.toString());
        if (!isMember) {
            throw new ForbiddenException('not.a.member.of.this.room');
        }

        const now = new Date();

        await this.memberModel.updateMany(
            { roomId: { $in: normalizedRoomIds } },
            {
                $set: {
                    clearedAt: now,
                    isHiddenInList: true,
                    pinnedAt: null,
                }
            }
        );

        const participantIds = members.map(m => m.userId.toString());

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'direct.deleted.mutually',
            data: {
                roomId: roomId.toString(),
                participantIds
            }
        };
    }

}
