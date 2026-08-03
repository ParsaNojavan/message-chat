import { Module } from '@nestjs/common';
import { RtcService } from './rtc.service';
import { RtcGateway } from './rtc.gateway';
import { RtcController } from './rtc.controller';
import Redis from 'ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
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
  providers: [RtcService, RtcGateway,
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
    }
  ],
  controllers: [RtcController],
})
export class RtcModule { }
