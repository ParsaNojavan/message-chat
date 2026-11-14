import { Document, Types } from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { ChatType } from "@app/contracts/models/enums/chat-type";
import IEntity from "@app/contracts/models/abstract/iEntity";

@Schema({ timestamps: true })
export default class ChatFolder extends Document implements IEntity {
    @Prop({ type: Types.ObjectId, required: true, index: true })
    userId: Types.ObjectId;

    @Prop({ type: String, required: true, trim: true })
    name: string;

    @Prop({ type: Number, default: 0 })
    order: number;

    @Prop({ type: [String], enum: ChatType, default: [] })
    includedChatTypes: ChatType[];

    @Prop({ type: [String], enum: ChatType, default: [] })
    excludedChatTypes: ChatType[];

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Room' }], default: [] })
    includedRoomIds: Types.ObjectId[];

}

export type ChatFolderDocument = ChatFolder & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const ChatFolderSchema = SchemaFactory.createForClass(ChatFolder);

ChatFolderSchema.index({ userId: 1, order: 1 });
