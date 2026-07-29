import { Document, Types } from "mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { ChatType } from "@app/contracts/models/enums/chat-type"
import * as bcrypt from 'bcrypt'

@Schema({ timestamps: true })
export default class Room extends Document implements IEntity {
    @Prop({ type: String, enum: ChatType, required: true})
    type: ChatType
    @Prop()
    name: string
    @Prop()
    avatar: string
}

export type RoomDocument = Room & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const RoomSchema = SchemaFactory.createForClass(Room);
