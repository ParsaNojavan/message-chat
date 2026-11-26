import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { WallpaperService } from './wallpaper.service';
import { WallpaperConfig } from 'src/models/concrete/wallpaper';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';

@Controller()
export class WallpaperController {
    constructor(private readonly wallpaperService: WallpaperService) { }

    @MessagePattern('wallpaper.upload')
    async uploadWallpaper(
        @Payload() payload: { roomId: string, config: WallpaperConfig },
        @RPCContext() context
    ) {
        return await this.wallpaperService.uploadNewWallpaper(payload.roomId, context.sub, payload.config);
    }

    @MessagePattern('wallpaper.list')
    async getWallpapers(
        @Payload() payload: { roomId: string },
        @RPCContext() context
    ) {
        return await this.wallpaperService.getWallpaperSettings(payload.roomId, context.sub);
    }

    @MessagePattern('wallpaper.global.set')
    async setGlobalWallpaper(
        @Payload() payload: { config: WallpaperConfig },
        @RPCContext() context
    ) {
        return await this.wallpaperService.setGlobalWallpaper(context.sub, payload.config);
    }

    @MessagePattern('wallpaper.effective.get')
    async getEffectiveWallpaper(
        @Payload() payload: { roomId: string },
        @RPCContext() context
    ) {
        return await this.wallpaperService.getEffectiveWallpaper(payload.roomId, context.sub);
    }

    @MessagePattern('wallpaper.global.save')
    async saveGlobalWallpaper(@Payload() payload: { config: WallpaperConfig }, @RPCContext() context) {
        return await this.wallpaperService.saveGlobalWallpaper(context.sub, payload.config);
    }

    @MessagePattern('wallpaper.global.list')
    async getSavedGlobalWallpapers(@RPCContext() context) {
        return await this.wallpaperService.getSavedGlobalWallpapers(context.sub);
    }

    @MessagePattern('wallpaper.global.select')
    async selectGlobalWallpaper(@Payload() payload: { value: string }, @RPCContext() context) {
        return await this.wallpaperService.selectGlobalWallpaper(context.sub, payload.value);
    }
}
