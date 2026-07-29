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

    MongooseModule.forRoot(process.env.MONGO_STRING?.toString() ?? '', { dbName: 'message_chatdb' }),
     MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: RoomMember.name, schema: RoomMemberSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, WsJwtGuard, ChatService],
})
export class ChatModule {}
