import { Document, Types } from "mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import * as bcrypt from 'bcrypt'
import { RoleType } from "@app/contracts/models/enums/role-type"

@Schema({ timestamps: true })
export default class RoomMember extends Document implements IEntity {
    @Prop({ type: String, enum: RoleType, required: true })
    role: RoleType
    @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
    roomId: Types.ObjectId
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId
    @Prop({ type: Date, default: Date.now })
    joinedAt: Date;
}

export type RoomDocument = RoomMember & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const RoomMemberSchema = SchemaFactory.createForClass(RoomMember);
RoomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });