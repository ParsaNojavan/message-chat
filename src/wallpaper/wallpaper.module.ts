import { Module } from '@nestjs/common';
import { WallpaperController } from './wallpaper.controller';
import { WallpaperService } from './wallpaper.service';
import { MongooseModule } from '@nestjs/mongoose';
import Room, { RoomSchema } from 'src/models/concrete/room';
import { UserGlobalWallpaper, UserGlobalWallpaperSchema, UserWallpaperSetting, UserWallpaperSettingSchema, WallpaperConfig, WallpaperConfigSchema } from 'src/models/concrete/wallpaper';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: WallpaperConfig.name, schema: WallpaperConfigSchema },
      { name: UserWallpaperSetting.name, schema: UserWallpaperSettingSchema },
      { name: UserGlobalWallpaper.name, schema: UserGlobalWallpaperSchema },
    ]),
  ],
  controllers: [WallpaperController],
  providers: [WallpaperService]
})
export class WallpaperModule { }
