import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Room from 'src/models/concrete/room';
import { UserGlobalWallpaper, WallpaperConfig } from 'src/models/concrete/wallpaper';

@Injectable()
export class WallpaperService {
    constructor(@InjectModel(Room.name) private roomModel: Model<Room>,
        @InjectModel(UserGlobalWallpaper.name) private globalWallpaperModel: Model<UserGlobalWallpaper>) { }

    async uploadNewWallpaper(roomId: string, userId: string, config: WallpaperConfig):
        Promise<DataResultDto<any>> {
        const result = await this.roomModel.findOneAndUpdate(
            { _id: roomId },
            {
                $push: { "userWallpaperSettings.$[userElem].savedWallpapers": config }
            },
            {
                arrayFilters: [{ "userElem.userId": userId }],
                new: true
            }
        );

        if (!result) throw new NotFoundException('room.not-found');
        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'wallpaper.upload.successs',
            data: result
        }
    }

    async getWallpaperSettings(roomId: string, userId: string): Promise<DataResultDto<any>> {
        const room = await this.roomModel.findOne(
            { _id: roomId, "userWallpaperSettings.userId": userId },
            { "userWallpaperSettings.$": 1 }
        );

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'wallpaper.fetch.success',
            data: room?.userWallpaperSettings[0]
        }
    }

    async switchWallpaper(roomId: string, userId: string, wallpaperId: string): Promise<DataResultDto<any>> {
        const result = await this.roomModel.findOneAndUpdate(
            { _id: roomId, "userWallpaperSettings.userId": userId },
            {
                $set: { "userWallpaperSettings.$.activeWallpaperId": new Types.ObjectId(wallpaperId) }
            },
            { new: true }
        );

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'wallpaper.switch.success',
            data: result
        }
    }

    async getEffectiveWallpaper(roomId: string, userId: string): Promise<DataResultDto<any>> {
        const room = await this.roomModel.findOne(
            { _id: roomId, "userWallpaperSettings.userId": userId },
            { "userWallpaperSettings.$": 1 }
        );

        if (room?.userWallpaperSettings[0]?.activeWallpaperId) {
            return {
                success: true,
                statusCode: HttpStatus.OK,
                message: 'wallpaper.effective.room',
                data: { type: 'room', setting: room.userWallpaperSettings[0] }
            };
        }

        const global = await this.globalWallpaperModel.findOne({ userId });
        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'wallpaper.effective.global',
            data: { type: 'global', setting: global?.activeGlobalWallpaper || null }
        };
    }

    async setGlobalWallpaper(userId: string, config: WallpaperConfig): Promise<DataResultDto<any>> {
        const result = await this.globalWallpaperModel.findOneAndUpdate(
            { userId },
            { activeGlobalWallpaper: config },
            { upsert: true, new: true }
        );

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'wallpaper.global.set.success',
            data: result
        };
    }

    async saveGlobalWallpaper(userId: string, config: WallpaperConfig): Promise<DataResultDto<any>> {
        const result = await this.globalWallpaperModel.findOneAndUpdate(
            { userId },
            { $push: { savedGlobalWallpapers: config } },
            { upsert: true, new: true }
        );
        return { success: true, statusCode: HttpStatus.OK, message: 'global.saved', data: result };
    }

    async getSavedGlobalWallpapers(userId: string): Promise<DataResultDto<any>> {
        const result = await this.globalWallpaperModel.findOne({ userId });
        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'global.list',
            data: result?.savedGlobalWallpapers || []
        };
    }

    async selectGlobalWallpaper(userId: string, wallpaperValue: string): Promise<DataResultDto<any>> {
        const userGlobal = await this.globalWallpaperModel.findOne({ userId });
        const selected = userGlobal?.savedGlobalWallpapers.find(w => w.value === wallpaperValue);

        if (!selected) throw new NotFoundException('wallpaper.not-found');

        const result = await this.globalWallpaperModel.findOneAndUpdate(
            { userId },
            { activeGlobalWallpaper: selected },
            { new: true }
        );
        return { success: true, statusCode: HttpStatus.OK, message: 'global.switched', data: result };
    }


}
