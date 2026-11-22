import { Document, Types } from "mongoose"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"

@Schema({ timestamps: true })
export default class HiddenMessage extends Document implements IEntity {

    @Prop({ type: Types.ObjectId, ref: 'Message', required: true, index: true })
    messageId: Types.ObjectId;
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;
}

export const HiddenMessageSchema = SchemaFactory.createForClass(HiddenMessage);

HiddenMessageSchema.index({ userId: 1, messageId: 1 }, { unique: true });
