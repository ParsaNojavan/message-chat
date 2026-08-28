import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { GroupRtcService } from './group-rtc.service';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';

@Controller()
export class GroupRtcController {

    constructor(private readonly groupRtcService: GroupRtcService) { }

    @MessagePattern('group-rtc.token')
    async create(@Payload() data: { roomId }, @RPCContext() context) {
        return await this.groupRtcService.createToken(data.roomId, context.sub)
    }
}
