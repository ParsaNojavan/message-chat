import { Test, TestingModule } from '@nestjs/testing';
import { DirectController } from './direct.controller';

describe('DirectController', () => {
  let controller: DirectController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DirectController],
    }).compile();

    controller = module.get<DirectController>(DirectController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
