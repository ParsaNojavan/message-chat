import { Document, Types } from "mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import * as bcrypt from 'bcrypt'
import { RoleType } from "@app/contracts/models/enums/role-type"
import Reaction, { ReactionSchema } from "./reaction"
import { MessageType } from "@app/contracts/models/enums/message-type"
import { Call, CallSchema } from "./call"

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

    @Prop({ type: String, enum: Object.values(MessageType), default: MessageType.DEFAULT })
    type: MessageType;

    @Prop({ type: CallSchema, required: false })
    callData?: Call;

    @Prop([{
        mediaId: { type: Types.ObjectId, required: true },
        url: { type: String, required: true },
        thumbnailUrl: { type: String },
        type: { type: String, required: true }
    }])
    media?: Array<{ mediaId: Types.ObjectId, url: string, thumbnailUrl?: string, type: string }>;

    @Prop({ type: Types.ObjectId, ref: 'Message', required: false })
    replyTo?: Types.ObjectId;
    @Prop({ default: false })
    isForwarded: boolean;
    @Prop({ type: Types.ObjectId, required: false })
    forwardedFromUser?: Types.ObjectId;
    @Prop({ type: Types.ObjectId, ref: 'Room', required: false })
    forwardedFromRoom?: Types.ObjectId;
    @Prop({ type: [ReactionSchema], default: [] })
    reactions: Reaction[];
    @Prop({ default: false })
    isEdited: boolean;


}

export type MessageDocument = Message & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ roomId: 1, createdAt: 1 });