import { Controller } from '@nestjs/common';
import { DirectService } from './direct.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';

@Controller('direct')
export class DirectController {
    constructor(private readonly directService: DirectService) { }

    @MessagePattern('direct.create')
    async create(@Payload() data: { userId }, @RPCContext() context) {
        return await this.directService.createDirectChat(data.userId, context)
    }
}
