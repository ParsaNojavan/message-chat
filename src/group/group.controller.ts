import { Controller } from '@nestjs/common';
import { GroupService } from './group.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';

@Controller()
export class GroupController {
    constructor(private readonly groupService: GroupService) { }

    @MessagePattern('group.create')
    async create(@Payload() data: { name, avatar },@RPCContext() context) {
        console.log(data)
        return await this.groupService.createGroup(data.name, data.avatar, context)
    }

    @MessagePattern('group.add')
    async add(@Payload() data: { roomId, memberId },@RPCContext() context) {
        console.log(data)
        return await this.groupService.addMember(data.roomId, data.memberId)
    }

    @MessagePattern('group.remove')
    async remove(@Payload() data: { roomId, memberId },@RPCContext() context) {
        return await this.groupService.removeMember(data.roomId, data.memberId)
    }

}
