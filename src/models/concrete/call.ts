import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Call {
  @Prop({ type: Number, required: false })
  duration?: number;

  @Prop({ type: String, required: false })
  callSessionId?: string;
}

export const CallSchema = SchemaFactory.createForClass(Call);