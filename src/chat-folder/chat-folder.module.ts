import { Module } from '@nestjs/common';
import { ChatFolderController } from './chat-folder.controller';
import { ChatFolderService } from './chat-folder.service';
import { MongooseModule } from '@nestjs/mongoose';
import Room, { RoomSchema } from 'src/models/concrete/room';
import ChatFolder, { ChatFolderSchema } from 'src/models/concrete/chat-folder';
import RoomMember, { RoomMemberSchema } from 'src/models/concrete/member';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: RoomMember.name, schema: RoomMemberSchema },
      { name: ChatFolder.name, schema: ChatFolderSchema },
    ]),
  ],
  controllers: [ChatFolderController],
  providers: [ChatFolderService]
})
export class ChatFolderModule { }
