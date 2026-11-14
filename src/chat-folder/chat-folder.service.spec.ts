import { Test, TestingModule } from '@nestjs/testing';
import { ChatFolderService } from './chat-folder.service';

describe('ChatFolderService', () => {
  let service: ChatFolderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatFolderService],
    }).compile();

    service = module.get<ChatFolderService>(ChatFolderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
