import { Document, Types } from "mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { ChatType } from "@app/contracts/models/enums/chat-type"
import * as bcrypt from 'bcrypt'
import { PinnedMessage, PinnedMessageSchema } from "./pinned-message"
import { UserWallpaperSetting, UserWallpaperSettingSchema } from "./wallpaper"

@Schema({ timestamps: true })
export default class Room extends Document implements IEntity {
    @Prop({ type: String, enum: ChatType, required: true })
    type: ChatType
    @Prop()
    name: string
    @Prop()
    avatar: string

    @Prop({ type: [PinnedMessageSchema], default: [] })
    pinnedMessages: PinnedMessage[];

    @Prop({ type: [UserWallpaperSettingSchema], default: [] })
    userWallpaperSettings: UserWallpaperSetting[];
}

export type RoomDocument = Room & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const RoomSchema = SchemaFactory.createForClass(Room);
RoomSchema.index({ _id: 1, "userWallpaperSettings.userId": 1 });