import { Test, TestingModule } from '@nestjs/testing';
import { RtcGateway } from './rtc.gateway';

describe('RtcGateway', () => {
  let gateway: RtcGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RtcGateway],
    }).compile();

    gateway = module.get<RtcGateway>(RtcGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
