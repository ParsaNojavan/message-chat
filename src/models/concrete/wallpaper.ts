import IEntity from '@app/contracts/models/abstract/iEntity';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: true, timestamps: true })
export class WallpaperConfig implements IEntity {
    @Prop({ type: Types.ObjectId, auto: true })
    _id: Types.ObjectId;

    @Prop({ type: String, required: true })
    type: 'image' | 'color' | 'gradient' | 'pattern';

    @Prop({ type: String, required: true })
    value: string;

    @Prop({ type: Number, default: 0, min: 0, max: 30 })
    blur: number;

    @Prop({ type: Number, default: 0, min: 0, max: 80 })
    dimming: number;

    @Prop({ type: Boolean, default: false })
    isMotion: boolean;
}

export const WallpaperConfigSchema = SchemaFactory.createForClass(WallpaperConfig);

@Schema({ _id: false })
export class UserWallpaperSetting implements IEntity {
    @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, default: null })
    activeWallpaperId: Types.ObjectId | null;

    @Prop({ type: [WallpaperConfigSchema], default: [] })
    savedWallpapers: WallpaperConfig[];
}

export const UserWallpaperSettingSchema = SchemaFactory.createForClass(UserWallpaperSetting);

@Schema({ timestamps: true })
export class UserGlobalWallpaper extends Document {
    @Prop({ type: Types.ObjectId, required: true, index: true, unique: true })
    userId: Types.ObjectId;

    @Prop({ type: WallpaperConfigSchema, default: null })
    activeGlobalWallpaper: WallpaperConfig | null;

    @Prop({ type: [WallpaperConfigSchema], default: [] })
    savedGlobalWallpapers: WallpaperConfig[];
}

export const UserGlobalWallpaperSchema = SchemaFactory.createForClass(UserGlobalWallpaper);