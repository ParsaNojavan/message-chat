import { Test, TestingModule } from '@nestjs/testing';
import { GroupRtcController } from './group-rtc.controller';

describe('GroupRtcController', () => {
  let controller: GroupRtcController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupRtcController],
    }).compile();

    controller = module.get<GroupRtcController>(GroupRtcController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
