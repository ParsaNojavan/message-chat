import { Test, TestingModule } from '@nestjs/testing';
import { RtcController } from './rtc.controller';

describe('RtcController', () => {
  let controller: RtcController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RtcController],
    }).compile();

    controller = module.get<RtcController>(RtcController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
