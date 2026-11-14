import type ChatFolderDto from '@app/contracts/models/dtos/chat/chat-folder.dto';
import type Context from '@app/contracts/models/dtos/rpcContext';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ChatFolderService } from './chat-folder.service';

@Controller()
export class ChatFolderController {
    constructor(private readonly chatFolderService: ChatFolderService) { }

    @MessagePattern('folder.create')
    async create(@Payload() folderDto: ChatFolderDto, @RPCContext() context: Context) {
        return await this.chatFolderService.create(folderDto, context);
    }

    @MessagePattern('folder.get-all')
    async getUserFolders(@RPCContext() context: Context) {
        return await this.chatFolderService.getUserFolders(context);
    }

    @MessagePattern('folder.get')
    async getFolderById(@Payload() data: { folderId: string }, @RPCContext() context: Context) {
        return await this.chatFolderService.getFolderById(data.folderId, context);
    }

    @MessagePattern('folder.update')
    async update(
        @Payload() data: { folderId: string; folderDto: ChatFolderDto },
        @RPCContext() context: Context
    ) {
        return await this.chatFolderService.update(data.folderId, data.folderDto, context);
    }

    @MessagePattern('folder.delete')
    async delete(@Payload() data: { folderId: string }, @RPCContext() context: Context) {
        return await this.chatFolderService.delete(data.folderId, context);
    }

    @MessagePattern('folder.reorder')
    async reorderFolders(@Payload() data: { folderIds: string[] }, @RPCContext() context: Context) {
        return await this.chatFolderService.reorderFolders(data.folderIds, context);
    }

    @MessagePattern('folder.add-room')
    async addRoomToFolder(
        @Payload() data: { folderId: string; roomId: string },
        @RPCContext() context: Context
    ) {
        return await this.chatFolderService.addRoomToFolder(data.folderId, data.roomId, context);
    }

    @MessagePattern('folder.remove-room')
    async removeRoomFromFolder(
        @Payload() data: { folderId: string; roomId: string },
        @RPCContext() context: Context
    ) {
        return await this.chatFolderService.removeRoomFromFolder(data.folderId, data.roomId, context);
    }

    @MessagePattern('folder.get-rooms')
    async getFolderRooms(@Payload() data: { folderId: string }, @RPCContext() context: Context) {
        return await this.chatFolderService.getFolderRooms(data.folderId, context);
    }
}
