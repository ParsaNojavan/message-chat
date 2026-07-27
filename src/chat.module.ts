import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ChatGateway } from './chat.gateway';
import { WsJwtGuard } from '@app/contracts/utils/jwt_token/guards/ws.guard';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

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
  ],
  controllers: [ChatController],
  providers: [ChatGateway, WsJwtGuard, ChatService],
})
export class ChatModule {}
