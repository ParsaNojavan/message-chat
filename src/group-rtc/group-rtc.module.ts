import { Module } from '@nestjs/common';
import { GroupRtcController } from './group-rtc.controller';
import { GroupRtcService } from './group-rtc.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Room } from 'livekit-server-sdk';
import RoomMember, { RoomMemberSchema } from 'src/models/concrete/member';
import Message, { MessageSchema } from 'src/models/concrete/message';
import Reaction, { ReactionSchema } from 'src/models/concrete/reaction';
import { RoomSchema } from 'src/models/concrete/room';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

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
  providers: [GroupRtcService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          username: configService.get<string>('REDIS_USERNAME'),
          password: configService.get<string>('REDIS_PASSWORD'),
        });
      },
      inject: [ConfigService]
    },
  ],
  exports: [GroupRtcService]
})
export class GroupRtcModule { }
