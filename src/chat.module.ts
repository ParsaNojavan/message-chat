import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ChatGateway } from './chat.gateway';
import { WsJwtGuard } from '@app/contracts/utils/jwt_token/guards/ws.guard';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { MongooseModule } from '@nestjs/mongoose';
import Room, { RoomSchema } from './models/concrete/room';
import RoomMember, { RoomMemberSchema } from './models/concrete/member';
import Message, { MessageSchema } from './models/concrete/message';
import { GroupController } from './group/group.controller';
import { GroupService } from './group/group.service';
import { GroupModule } from './group/group.module';
import { DirectModule } from './direct/direct.module';
import Redis from 'ioredis';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ChannelModule } from './channel/channel.module';
import Reaction, { ReactionSchema } from './models/concrete/reaction';
import { GroupRtcModule } from './group-rtc/group-rtc.module';
import { Call, CallSchema } from './models/concrete/call';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        console.log('AppModule JWT_SECRET =', secret);

        if (!secret) {
          throw new Error('JWT_SECRET is not defined');
        }

        return {
          secret,
        };
      },
    }),
    ClientsModule.register([
      {
        name: 'notification-client',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379')
        }
      }
    ]),
    ClientsModule.register([
      {
        name: 'user-client',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379')
        }
      }
    ]),

    MongooseModule.forRoot(process.env.MONGO_STRING?.toString() ?? '', { dbName: 'message_chatdb' }),
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: RoomMember.name, schema: RoomMemberSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Reaction.name, schema: ReactionSchema},
      { name: Call.name, schema: CallSchema}
    ]),
    GroupModule,
    DirectModule,
    ChannelModule,
    GroupRtcModule,
  ],
  controllers: [ChatController],
  providers: [ChatGateway, WsJwtGuard, ChatService,
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
    {
      provide: 'REDIS_SUB_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          username: configService.get<string>('REDIS_USERNAME'),
          password: configService.get<string>('REDIS_PASSWORD'),
        });
      },
      inject: [ConfigService]
    }
  ],
})
export class ChatModule { }
