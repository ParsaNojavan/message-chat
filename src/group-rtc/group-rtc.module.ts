import { Module } from '@nestjs/common';
import { GroupRtcController } from './group-rtc.controller';
import { GroupRtcService } from './group-rtc.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Room } from 'livekit-server-sdk';
import RoomMember, { RoomMemberSchema } from 'src/models/concrete/member';
import Message, { MessageSchema } from 'src/models/concrete/message';
import Reaction, { ReactionSchema } from 'src/models/concrete/reaction';
import { RoomSchema } from 'src/models/concrete/room';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: RoomMember.name, schema: RoomMemberSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Reaction.name, schema: ReactionSchema }
    ]),
  ],
  controllers: [GroupRtcController],
  providers: [GroupRtcService]
})
export class GroupRtcModule { }
