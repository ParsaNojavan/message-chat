import { Test, TestingModule } from '@nestjs/testing';
import { GroupRtcGateway } from './group-rtc.gateway';

describe('GroupRtcGateway', () => {
  let gateway: GroupRtcGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GroupRtcGateway],
    }).compile();

    gateway = module.get<GroupRtcGateway>(GroupRtcGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
