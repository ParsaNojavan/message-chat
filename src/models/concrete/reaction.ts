import { Document, Types } from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ _id: false })
export default class Reaction {
    @Prop({ type: Types.ObjectId, required: true })
    userId: Types.ObjectId;

    @Prop({ required: true, trim: true })
    emoji: string;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);