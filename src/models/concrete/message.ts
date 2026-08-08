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

}

export type RoomDocument = Message & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ roomId: 1, createdAt: 1 });