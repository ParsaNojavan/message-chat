import { Test, TestingModule } from '@nestjs/testing';
import { ChatFolderController } from './chat-folder.controller';

describe('ChatFolderController', () => {
  let controller: ChatFolderController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatFolderController],
    }).compile();

    controller = module.get<ChatFolderController>(ChatFolderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
