import { Controller } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';

@Controller()
export class ChannelController {
    constructor(private readonly channelService: ChannelService) { }

    @MessagePattern('channel.create')
    async create(@Payload() data: { name, avatar }, @RPCContext() context) {
        console.log(data)
        return await this.channelService.createChannel(data.name, data.avatar, context)
    }

    @MessagePattern('channel.add')
    async add(@Payload() data: { roomId, memberId }, @RPCContext() context) {
        return await this.channelService.addMember(data.roomId, data.memberId, context)
    }

    @MessagePattern('channel.remove')
    async remove(@Payload() data: { roomId, memberId }, @RPCContext() context) {
        return await this.channelService.removeMember(data.roomId, data.memberId, context)
    }
}
