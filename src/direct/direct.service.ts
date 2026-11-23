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

        const normalizedUserId = NormalizeObjectId.getObjectIdOrString(userId);
        const normalizedRoomIds = roomIds
            .filter(id => Types.ObjectId.isValid(id))
            .map(id => NormalizeObjectId.getObjectIdOrString(id));

        if (normalizedRoomIds.length === 0) {
            throw new BadRequestException('valid.roomIds.required');
        }

        const allowedRooms = await this.roomModel.find({
            _id: { $in: normalizedRoomIds },
            type: { $in: [ChatType.DM, ChatType.SAVED] }
        }).select('_id').lean();

        const allowedRoomIds = allowedRooms.map(r => r._id);
        const allowedRoomIdsStr = allowedRooms.map(r => r._id.toString());

        if (allowedRoomIds.length === 0) {
            throw new BadRequestException('no.valid.dm.or.saved.rooms.found');
        }

        const now = new Date();

        await this.memberModel.updateMany(
            {
                userId: { $in: [normalizedUserId, userId.toString()] },
                roomId: { $in: [...allowedRoomIds, ...allowedRoomIdsStr] }
            },
            {
                $set: {
                    clearedAt: now,
                    isHiddenInList: true,
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

        const normalizedRoomId = NormalizeObjectId.getObjectIdOrString(roomId);
        const normalizedUserId = NormalizeObjectId.getObjectIdOrString(userId);

        const room = await this.roomModel.findById(normalizedRoomId).lean();
        if (!room) {
            throw new NotFoundException('room.not.found');
        }

        if (room.type !== ChatType.DM) {
            throw new BadRequestException('mutual.delete.only.allowed.in.dm');
        }

        const members = await this.memberModel.find({
            roomId: { $in: [normalizedRoomId, roomId.toString()] }
        }).lean();

        const isMember = members.some(m => m.userId.toString() === userId.toString());
        if (!isMember) {
            throw new ForbiddenException('not.a.member.of.this.room');
        }

        const now = new Date();

        await this.memberModel.updateMany(
            { roomId: { $in: [normalizedRoomId, roomId.toString()] } },
            {
                $set: {
                    clearedAt: now,
                    isHiddenInList: true,
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
