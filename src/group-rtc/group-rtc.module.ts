import { Module } from '@nestjs/common';
import { GroupRtcController } from './group-rtc.controller';
import { GroupRtcService } from './group-rtc.service';
import { GroupRtcGateway } from './group-rtc.gateway';

@Module({
  controllers: [GroupRtcController],
  providers: [GroupRtcService, GroupRtcGateway]
})
export class GroupRtcModule {}
