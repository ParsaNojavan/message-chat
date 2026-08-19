import { Module } from '@nestjs/common';
import { DirectService } from './direct.service';
import { DirectController } from './direct.controller';
import { MongooseModule } from '@nestjs/mongoose';
import Room, { RoomSchema } from 'src/models/concrete/room';
import RoomMember, { RoomMemberSchema } from 'src/models/concrete/member';
import Message, { MessageSchema } from 'src/models/concrete/message';
import Reaction, { ReactionSchema } from 'src/models/concrete/reaction';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: RoomMember.name, schema: RoomMemberSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Reaction.name, schema: ReactionSchema}
    ]),
  ],
  providers: [DirectService],
  controllers: [DirectController]
})
export class DirectModule { }
