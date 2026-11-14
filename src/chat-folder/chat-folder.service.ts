import ChatFolderDto from '@app/contracts/models/dtos/chat/chat-folder.dto';
import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import Context from '@app/contracts/models/dtos/rpcContext';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { Model, Types } from 'mongoose';
import ChatFolder from 'src/models/concrete/chat-folder';
import RoomMember from 'src/models/concrete/member';

@Injectable()
export class ChatFolderService {
    constructor(
        @InjectModel(RoomMember.name) private memberModel: Model<RoomMember>,
        @InjectModel(ChatFolder.name) private folderModel: Model<ChatFolder>
    ) { }

    async create(folderDto: ChatFolderDto, context: Context): Promise<DataResultDto<any>> {
        const userObjectId = new Types.ObjectId(context.sub);

        const lastFolder = await this.folderModel
            .findOne({ userId: userObjectId })
            .sort({ order: -1 })
            .select('order')
            .lean();

        const nextOrder = lastFolder ? lastFolder.order + 1 : 0;

        const folder = await this.folderModel.create({
            userId: userObjectId,
            name: folderDto.name,
            order: nextOrder,
            includedChatTypes: folderDto.includedChatTypes || [],
            excludedChatTypes: folderDto.excludedChatTypes || [],
            includedRoomIds: folderDto.includedRoomIds?.map((id) => new Types.ObjectId(id)) || [],
        });

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            message: 'folder.created.success',
            data: folder
        };
    }

    async getUserFolders(context: Context): Promise<DataResultDto<any>> {
        const folders = await this.folderModel
            .find({ userId: new Types.ObjectId(context.sub) })
            .sort({ order: 1 })
            .exec();

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'folders.fetch.success',
            data: folders
        };
    }

    async getFolderById(folderId: string, context: Context): Promise<DataResultDto<any>> {
        const folder = await this.folderModel.findOne({
            _id: new Types.ObjectId(folderId),
            userId: new Types.ObjectId(context.sub),
        });

        if (!folder) {
            return {
                success: false,
                statusCode: HttpStatus.NOT_FOUND,
                message: 'folder.not-found',
                data: null
            };
        }

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'folder.fetch.success',
            data: folder
        };
    }

    async update(folderId: string, folderDto: ChatFolderDto, context: Context): Promise<DataResultDto<any>> {
        const updateData: any = {};

        if (folderDto.name !== undefined) updateData.name = folderDto.name;
        if (folderDto.includedChatTypes !== undefined) updateData.includedChatTypes = folderDto.includedChatTypes;
        if (folderDto.excludedChatTypes !== undefined) updateData.excludedChatTypes = folderDto.excludedChatTypes;
        if (folderDto.includedRoomIds !== undefined) {
            updateData.includedRoomIds = folderDto.includedRoomIds.map((id) => new Types.ObjectId(id));
        }

        const updatedFolder = await this.folderModel.findOneAndUpdate(
            { _id: new Types.ObjectId(folderId), userId: new Types.ObjectId(context.sub) },
            { $set: updateData },
            { new: true }
        );

        if (!updatedFolder) {
            return {
                success: false,
                statusCode: HttpStatus.NOT_FOUND,
                message: 'folder.not-found',
                data: null
            };
        }

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'folder.update.success',
            data: updatedFolder
        };
    }

    async delete(folderId: string, context: Context): Promise<DataResultDto<any>> {
        const result = await this.folderModel.deleteOne({
            _id: new Types.ObjectId(folderId),
            userId: new Types.ObjectId(context.sub),
        });

        if (result.deletedCount === 0) {
            return {
                success: false,
                statusCode: HttpStatus.NOT_FOUND,
                message: 'folder.not-found',
                data: null
            };
        }

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'folder.delete.success',
            data: null
        };
    }

    async reorderFolders(folderIds: string[], context: Context): Promise<DataResultDto<any>> {
        const userObjectId = new Types.ObjectId(context.sub);

        const bulkOps = folderIds.map((folderId, index) => ({
            updateOne: {
                filter: { _id: new Types.ObjectId(folderId), userId: userObjectId },
                update: { $set: { order: index } },
            },
        }));

        await this.folderModel.bulkWrite(bulkOps);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'folders.reorder.success',
            data: null
        };
    }

    async addRoomToFolder(folderId: string, roomId: string, context: Context): Promise<DataResultDto<any>> {
        const folder = await this.folderModel.findOneAndUpdate(
            { _id: new Types.ObjectId(folderId), userId: new Types.ObjectId(context.sub) },
            { $addToSet: { includedRoomIds: new Types.ObjectId(roomId) } },
            { new: true }
        );

        if (!folder) {
            return {
                success: false,
                statusCode: HttpStatus.NOT_FOUND,
                message: 'folder.not-found',
                data: null
            };
        }

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'folder.add-room.success',
            data: folder
        };
    }

    async removeRoomFromFolder(folderId: string, roomId: string, context: Context): Promise<DataResultDto<any>> {
        const folder = await this.folderModel.findOneAndUpdate(
            { _id: new Types.ObjectId(folderId), userId: new Types.ObjectId(context.sub) },
            { $pull: { includedRoomIds: new Types.ObjectId(roomId) } },
            { new: true }
        );

        if (!folder) {
            return {
                success: false,
                statusCode: HttpStatus.NOT_FOUND,
                message: 'folder.not-found',
                data: null
            };
        }

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'folder.remove-room.success',
            data: folder
        };
    }

    async getFolderRooms(folderId: string, context: Context): Promise<DataResultDto<any>> {
        const userObjectId = new Types.ObjectId(context.sub);

        const folder = await this.folderModel.findOne({
            _id: new Types.ObjectId(folderId),
            userId: userObjectId,
        });

        if (!folder) {
            return {
                success: false,
                statusCode: HttpStatus.NOT_FOUND,
                message: 'folder.not-found',
                data: null
            };
        }

        const matchConditions: any[] = [];

        if (folder.excludedChatTypes && folder.excludedChatTypes.length > 0) {
            matchConditions.push({ 'room.type': { $nin: folder.excludedChatTypes } });
        }

        const includeConditions: any[] = [];

        if (folder.includedChatTypes && folder.includedChatTypes.length > 0) {
            includeConditions.push({ 'room.type': { $in: folder.includedChatTypes } });
        }

        if (folder.includedRoomIds && folder.includedRoomIds.length > 0) {
            includeConditions.push({ 'room._id': { $in: folder.includedRoomIds } });
        }

        if (includeConditions.length > 0) {
            matchConditions.push({ $or: includeConditions });
        }

        const pipeline: any[] = [
            { $match: { userId: userObjectId } },
            {
                $lookup: {
                    from: 'rooms',
                    localField: 'roomId',
                    foreignField: '_id',
                    as: 'room',
                },
            },
            { $unwind: '$room' },
        ];

        if (matchConditions.length > 0) {
            pipeline.push({ $match: { $and: matchConditions } });
        }

        pipeline.push({ $sort: { pinnedAt: -1, 'room.updatedAt': -1 } });

        const rooms = await this.memberModel.aggregate(pipeline);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'folder.rooms.fetch.success',
            data: rooms
        };
    }
}
