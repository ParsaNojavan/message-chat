import { Types } from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ _id: false, timestamps: true })
export class PinnedMessage {
    @Prop({ type: Types.ObjectId, ref: 'Message', required: true })
    messageId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    pinnedBy: Types.ObjectId;

    @Prop({ default: Date.now })
    pinnedAt: Date;
}

export const PinnedMessageSchema = SchemaFactory.createForClass(PinnedMessage);