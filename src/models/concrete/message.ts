import { Document, Types } from "mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import * as bcrypt from 'bcrypt'
import { RoleType } from "@app/contracts/models/enums/role-type"

@Schema({ timestamps: true })
export default class Message extends Document implements IEntity {
    @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
    roomId: Types.ObjectId
    @Prop({ type: Types.ObjectId, required: true, index: true })
    senderId: Types.ObjectId
    @Prop()
    content: string;
    @Prop({ default: false })
    isRead: boolean;
    @Prop({ type: [{ type: Types.ObjectId }], default: [] })
    readBy: Types.ObjectId[];

    @Prop([{
        mediaId: { type: Types.ObjectId, required: true },
        url: { type: String, required: true },
        thumbnailUrl: { type: String },
        type: { type: String, required: true }
    }])
    media?: Array<{ mediaId: Types.ObjectId, url: string,thumbnailUrl?: string, type: string }>;
}

export type MessageDocument = Message & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ roomId: 1, createdAt: 1 });